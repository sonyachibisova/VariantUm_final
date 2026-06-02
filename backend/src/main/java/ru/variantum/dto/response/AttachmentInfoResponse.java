package ru.variantum.dto.response;

import java.util.UUID;

public record AttachmentInfoResponse(UUID id, String fileName, String mimeType, int fileSize) {}
