package ru.variantum.dto.response;

import java.util.UUID;

public record FormVariantTokenResponse(
        UUID id,
        UUID variantId,
        int variantIndex,
        String accessToken
) {}
