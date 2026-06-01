package ru.variantum.dto.response;

import java.util.List;

/** Список версий комплекта для UI «История изменений». */
public record VersionHistoryResponse(List<Item> versions) {
    public record Item(
            String versionId,
            String action,
            String description,
            String createdAt
    ) {}
}
