package ru.variantum.dto.response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record FormAssignmentResponse(
        UUID id,
        UUID projectId,
        String mode,
        String accessToken,   // CLASS_LIST: single shared link token; null for INDIVIDUAL_LINKS
        OffsetDateTime createdAt,
        List<FormStudentResponse> students,
        List<FormVariantTokenResponse> variantTokens
) {}
