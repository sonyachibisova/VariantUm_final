package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.variantum.dto.request.ExportRequest;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.export.ExportService;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Экспорт комплекта в PDF/DOCX. Файл отдаётся напрямую как вложение
 * (Content-Disposition: attachment) — без промежуточного хранилища.
 */
@RestController
@RequestMapping("/projects/{id}/export")
@RequiredArgsConstructor
@Tag(name = "Export")
public class ExportController {

    private final ExportService exportService;

    @PostMapping("/pdf")
    public ResponseEntity<byte[]> exportPdf(@PathVariable UUID id,
                                            @RequestBody(required = false) ExportRequest req) {
        var result = exportService.exportPdf(CurrentUser.requireId(), id, req);
        return fileResponse(result);
    }

    @PostMapping("/docx")
    public ResponseEntity<byte[]> exportDocx(@PathVariable UUID id,
                                             @RequestBody(required = false) ExportRequest req) {
        var result = exportService.exportDocx(CurrentUser.requireId(), id, req);
        return fileResponse(result);
    }

    private ResponseEntity<byte[]> fileResponse(ExportService.ExportResult result) {
        ContentDisposition cd = ContentDisposition.attachment()
                .filename(result.filename(), StandardCharsets.UTF_8)
                .build();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(cd);
        return ResponseEntity.ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType(result.contentType()))
                .body(result.bytes());
    }
}
