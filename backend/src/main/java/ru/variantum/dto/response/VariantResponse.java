package ru.variantum.dto.response;

import java.util.List;

public record VariantResponse(
        String variantId,
        int index,
        Integer difficulty,
        Integer totalEstimatedMinutes,
        List<TaskResponse> tasks
) {}
