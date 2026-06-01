package ru.variantum.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Промпт-правка одного варианта или всего комплекта. */
public record AiEditRequest(
        @NotBlank @Size(max = 1000) String prompt
) {}
