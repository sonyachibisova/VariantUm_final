package ru.variantum.dto.response;

import java.util.UUID;

public record FormStudentResponse(
        UUID id,
        String fullName,
        UUID variantId,
        int variantIndex,
        String accessToken
) {}
