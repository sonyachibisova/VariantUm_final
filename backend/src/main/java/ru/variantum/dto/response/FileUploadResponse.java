package ru.variantum.dto.response;

public record FileUploadResponse(
        String fileId,
        String fileName,
        String mimeType,
        String extractedText
) {}
