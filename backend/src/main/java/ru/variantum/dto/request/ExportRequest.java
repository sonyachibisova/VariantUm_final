package ru.variantum.dto.request;

import java.util.List;

/**
 * Параметры экспорта комплекта.
 * includeFields: studentName | className | date | grade | parentSignature
 * layout: ONE_PER_PAGE | CONTINUOUS
 * kitName: опциональное название комплекта, выводится перед каждым вариантом
 */
public record ExportRequest(
        List<String> includeFields,
        String layout,
        boolean includeAnswers,
        boolean showDifficulty,
        String kitName
) {
    public boolean hasField(String field) {
        return includeFields != null && includeFields.contains(field);
    }

    public boolean onePerPage() {
        return layout == null || "ONE_PER_PAGE".equals(layout);
    }

    public boolean hasKitName() {
        return kitName != null && !kitName.isBlank();
    }
}
