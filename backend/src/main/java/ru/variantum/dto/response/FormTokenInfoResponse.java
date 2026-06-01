package ru.variantum.dto.response;

import java.util.List;
import java.util.UUID;

/**
 * Ответ на GET /form/{token}.
 * tokenType = "CLASS_LIST" — ученик должен ввести имя.
 * tokenType = "VARIANT" — сразу показываем задания варианта.
 */
public record FormTokenInfoResponse(
        String tokenType,    // CLASS_LIST | VARIANT
        UUID assignmentId,
        String projectTitle,
        // populated when tokenType = VARIANT
        Integer variantIndex,
        List<PublicTaskResponse> tasks
) {
    public record PublicTaskResponse(
            UUID taskId,
            String text,
            String taskType,
            Integer estimatedMinutes,
            String answerHint
    ) {}
}
