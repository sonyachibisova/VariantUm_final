package ru.variantum.dto.response;

public record RecommendationResponse(
        String type,
        Integer variantIndex,
        String severity,
        String message
) {}
