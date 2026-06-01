package ru.variantum.dto.request;

import jakarta.validation.constraints.NotBlank;

public record ResolveNameRequest(@NotBlank String name) {}
