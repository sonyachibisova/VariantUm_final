package ru.variantum.dto.response;

import java.util.List;
import java.util.UUID;

public record ResolvedVariantResponse(
        UUID studentId,
        String studentName,
        UUID variantId,
        int variantIndex,
        List<FormTokenInfoResponse.PublicTaskResponse> tasks,
        String studentAccessToken,
        boolean alreadySubmitted
) {}
