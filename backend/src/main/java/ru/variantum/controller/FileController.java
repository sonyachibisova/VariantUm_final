package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import ru.variantum.domain.UploadedFile;
import ru.variantum.dto.response.FileUploadResponse;
import ru.variantum.repository.UploadedFileRepository;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.llm.TextCleanupService;
import ru.variantum.service.llm.VisionExtractionService;
import ru.variantum.service.parser.FileParserRegistry;
import ru.variantum.service.ratelimit.LlmCostService;
import ru.variantum.service.ratelimit.RateLimitService;
import ru.variantum.service.storage.MinioStorageService;

import java.io.ByteArrayInputStream;
import java.util.UUID;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Files")
public class FileController {

    private final FileParserRegistry fileParserRegistry;
    private final MinioStorageService minioStorageService;
    private final UploadedFileRepository uploadedFileRepository;
    private final VisionExtractionService visionExtractionService;
    private final TextCleanupService textCleanupService;
    private final RateLimitService rateLimitService;

    /**
     * Загрузка эталона.
     * - Изображения распознаёт GigaChat Vision (текст + формулы + графики + таблицы),
     *   при сбое — Tesseract OCR с последующей LLM-очисткой.
     * - PDF/DOCX/TXT парсятся библиотеками, затем текст прогоняется через LLM для исправления ошибок.
     *
     * @param clean можно отключить LLM-очистку текста документов (?clean=false) ради скорости.
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileUploadResponse> upload(@RequestPart("file") MultipartFile file,
                                                     @RequestParam(defaultValue = "true") boolean clean) {
        UUID userId = CurrentUser.requireId();
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        // Парсинг файла обращается к нейросети — проверяем дневной лимит
        rateLimitService.requireQuota(userId);

        String mimeType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }

        // Сохраняем в MinIO (некритично для разработки)
        String fileUuid = UUID.randomUUID().toString();
        String storageKey = minioStorageService.buildFileKey(userId, fileUuid);
        try {
            minioStorageService.put(storageKey, new ByteArrayInputStream(bytes), bytes.length, mimeType);
        } catch (Exception e) {
            storageKey = "local/" + fileUuid;
        }

        String extractedText;
        String parserUsed;
        try {
            if (mimeType.startsWith("image/")) {
                try {
                    extractedText = visionExtractionService.extract(bytes, filename, mimeType);
                    parserUsed = "gigachat-vision";
                } catch (Exception visionErr) {
                    log.warn("Vision не сработал для {}, фолбэк на Tesseract: {}", filename, visionErr.getMessage());
                    extractedText = textCleanupService.cleanup(fileParserRegistry.parse(file));
                    parserUsed = "tesseract+cleanup";
                }
            } else {
                String parsed = fileParserRegistry.parse(file);
                extractedText = clean ? textCleanupService.cleanup(parsed) : parsed;
                parserUsed = clean ? "parser+cleanup" : "parser";
            }
        } catch (Exception e) {
            extractedText = "";
            parserUsed = "failed:" + e.getMessage();
        }

        // Списываем стоимость парсинга файла (фиксированно)
        rateLimitService.deductPercent(userId, LlmCostService.PARSE_PER_FILE);

        UploadedFile uploaded = uploadedFileRepository.save(UploadedFile.builder()
                .userId(userId)
                .filename(filename)
                .mimeType(mimeType)
                .sizeBytes(file.getSize())
                .storageKey(storageKey)
                .parsedText(extractedText)
                .parserUsed(parserUsed)
                .build());

        return ResponseEntity.ok(new FileUploadResponse(
                uploaded.getId().toString(),
                uploaded.getFilename(),
                mimeType,
                extractedText
        ));
    }
}
