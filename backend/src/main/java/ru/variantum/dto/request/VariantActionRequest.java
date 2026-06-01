package ru.variantum.dto.request;

import jakarta.validation.constraints.Size;

/** Перегенерация одного варианта или добавление нового. customPrompt — необязателен. */
public record VariantActionRequest(
        Integer difficulty,
        @Size(max = 1000) String customPrompt
) {}
