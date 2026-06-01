package ru.variantum.dto.response;

import java.util.List;

public record ProjectPageResponse(
        List<ProjectListItemResponse> projects,
        int totalPages,
        long totalElements
) {}
