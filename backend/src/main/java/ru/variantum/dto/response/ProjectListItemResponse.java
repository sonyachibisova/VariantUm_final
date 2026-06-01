package ru.variantum.dto.response;

public record ProjectListItemResponse(
        String projectId,
        String title,
        String subject,
        Integer grade,
        int variantsCount,
        String createdAt
) {}
