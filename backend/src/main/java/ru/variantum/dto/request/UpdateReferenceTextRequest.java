package ru.variantum.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateReferenceTextRequest(
        @NotBlank(message = "Текст эталона не может быть пустым")
        @Size(max = 50000, message = "Текст эталона слишком длинный")
        String referenceText
) {}
