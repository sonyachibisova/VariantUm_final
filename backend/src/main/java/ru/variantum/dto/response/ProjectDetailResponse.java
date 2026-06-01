package ru.variantum.dto.response;

import java.util.List;

public record ProjectDetailResponse(
        String projectId,
        String title,
        String mode,
        String status,
        String subject,
        Integer grade,
        String topic,
        String referenceText,
        String referenceFileId,
        String referenceFileName,
        String createdAt,
        String updatedAt,
        List<VariantResponse> variants,
        List<RecommendationResponse> recommendations
) {}
