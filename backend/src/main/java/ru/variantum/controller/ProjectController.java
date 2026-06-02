package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.variantum.domain.Project;
import ru.variantum.domain.ProjectVersion;
import ru.variantum.domain.UploadedFile;
import ru.variantum.dto.request.CreateProjectRequest;
import ru.variantum.dto.request.UpdateReferenceTextRequest;
import ru.variantum.dto.response.ProjectDetailResponse;
import ru.variantum.dto.response.ProjectPageResponse;
import ru.variantum.dto.response.VersionHistoryResponse;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.repository.ProjectRepository;
import ru.variantum.repository.UploadedFileRepository;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.llm.TextCleanupService;
import ru.variantum.service.llm.VisionExtractionService;
import ru.variantum.service.parser.FileParserRegistry;
import ru.variantum.service.project.ProjectService;
import ru.variantum.service.project.VersionService;
import ru.variantum.service.storage.MinioStorageService;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/projects")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Projects")
public class ProjectController {

    private final ProjectService projectService;
    private final VersionService versionService;
    private final ProjectRepository projectRepository;
    private final UploadedFileRepository uploadedFileRepository;
    private final MinioStorageService minioStorageService;
    private final VisionExtractionService visionExtractionService;
    private final TextCleanupService textCleanupService;
    private final FileParserRegistry fileParserRegistry;

    @PostMapping
    public ResponseEntity<ProjectDetailResponse> create(@Valid @RequestBody CreateProjectRequest req) {
        UUID userId = CurrentUser.requireId();
        ProjectDetailResponse response = projectService.create(userId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ProjectPageResponse list(
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return projectService.list(CurrentUser.requireId(), subject, grade, q, page, size);
    }

    @GetMapping("/{id}")
    public ProjectDetailResponse get(@PathVariable UUID id) {
        return projectService.get(CurrentUser.requireId(), id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        projectService.delete(CurrentUser.requireId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/regenerate")
    public ProjectDetailResponse retryGeneration(@PathVariable UUID id) {
        return projectService.retryGeneration(CurrentUser.requireId(), id);
    }

    @PatchMapping("/{id}/reference-text")
    public ProjectDetailResponse updateReferenceText(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateReferenceTextRequest req) {
        return projectService.updateReferenceText(CurrentUser.requireId(), id, req.referenceText());
    }

    // ---- История версий ----

    @GetMapping("/{id}/history")
    public VersionHistoryResponse history(@PathVariable UUID id) {
        return versionService.history(CurrentUser.requireId(), id);
    }

    @PostMapping("/{id}/history/{versionId}/restore")
    public ProjectDetailResponse restore(@PathVariable UUID id, @PathVariable UUID versionId) {
        return versionService.restore(CurrentUser.requireId(), id, versionId);
    }

    /**
     * Скачивание исходного файла, загруженного пользователем при создании проекта.
     * Стримит файл из MinIO напрямую в ответе.
     */
    @GetMapping("/{id}/reference-file")
    public ResponseEntity<org.springframework.core.io.InputStreamResource> downloadReferenceFile(
            @PathVariable UUID id) {
        UUID userId = CurrentUser.requireId();
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        if (project.getReferenceFileId() == null) {
            return ResponseEntity.notFound().build();
        }
        UploadedFile file = uploadedFileRepository
                .findByIdAndUserId(project.getReferenceFileId(), userId)
                .orElseThrow(() -> new ResourceNotFoundException("Файл не найден"));

        if (file.getStorageKey() == null || file.getStorageKey().startsWith("local/")) {
            return ResponseEntity.notFound().build();
        }

        InputStream stream = minioStorageService.getStream(file.getStorageKey());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(file.getFilename(), StandardCharsets.UTF_8)
                .build());
        headers.setContentType(MediaType.parseMediaType(file.getMimeType()));
        return ResponseEntity.ok()
                .headers(headers)
                .body(new org.springframework.core.io.InputStreamResource(stream));
    }

    /**
     * Повторное распознавание загруженного файла: перечитывает файл из хранилища и заново
     * прогоняет через тот же пайплайн (Vision / парсер + LLM-очистка).
     */
    @PostMapping("/{id}/reparse-reference")
    public ProjectDetailResponse reparseReference(@PathVariable UUID id) {
        UUID userId = CurrentUser.requireId();
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        if (project.getReferenceFileId() == null) {
            throw new ResourceNotFoundException("У проекта нет загруженного файла");
        }
        UploadedFile uploadedFile = uploadedFileRepository
                .findByIdAndUserId(project.getReferenceFileId(), userId)
                .orElseThrow(() -> new ResourceNotFoundException("Файл не найден"));
        if (uploadedFile.getStorageKey() == null || uploadedFile.getStorageKey().startsWith("local/")) {
            throw new ResourceNotFoundException("Файл недоступен для повторного распознавания");
        }

        byte[] bytes;
        try (InputStream is = minioStorageService.getStream(uploadedFile.getStorageKey())) {
            bytes = is.readAllBytes();
        } catch (Exception e) {
            throw new RuntimeException("Не удалось прочитать файл из хранилища: " + e.getMessage(), e);
        }

        String mimeType = uploadedFile.getMimeType();
        String filename = uploadedFile.getFilename();
        String extractedText;
        String parserUsed;
        try {
            if (mimeType != null && mimeType.startsWith("image/")) {
                try {
                    extractedText = visionExtractionService.extract(bytes, filename, mimeType);
                    parserUsed = "gigachat-vision";
                } catch (Exception visionErr) {
                    log.warn("Vision не сработал для {} при повторном распознавании, фолбэк: {}", filename, visionErr.getMessage());
                    extractedText = textCleanupService.cleanup(fileParserRegistry.parseBytes(bytes, mimeType, filename));
                    parserUsed = "tesseract+cleanup";
                }
            } else {
                String parsed = fileParserRegistry.parseBytes(bytes, mimeType, filename);
                extractedText = textCleanupService.cleanup(parsed);
                parserUsed = "parser+cleanup";
            }
        } catch (Exception e) {
            throw new RuntimeException("Не удалось распознать текст: " + e.getMessage(), e);
        }

        uploadedFile.setParsedText(extractedText);
        uploadedFile.setParserUsed(parserUsed);
        uploadedFileRepository.save(uploadedFile);

        project.setReferenceText(extractedText);
        project = projectRepository.save(project);
        projectService.saveVersion(project, ProjectVersion.Action.MANUAL_EDIT, "Повторное распознавание файла");

        return projectService.toDetailResponse(project);
    }
}
