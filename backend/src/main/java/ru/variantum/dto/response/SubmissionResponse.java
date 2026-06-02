package ru.variantum.dto.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SubmissionResponse(
        UUID id,
        UUID assignmentId,
        UUID variantId,
        int variantIndex,
        String studentName,
        String answersJson,
        String autoScore,
        String teacherReview,
        OffsetDateTime submittedAt,
        String correctAnswersJson,
        String tasksJson,        // [{taskId, text, taskType, index}] для всех заданий варианта
        String attachmentsJson   // [{id, fileName, mimeType, fileSize}]
) {}
