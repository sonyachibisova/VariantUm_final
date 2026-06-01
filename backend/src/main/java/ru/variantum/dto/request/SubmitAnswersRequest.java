package ru.variantum.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public record SubmitAnswersRequest(
        @NotBlank String studentName,
        String studentId,
        @NotNull List<TaskAnswer> answers
) {
    public record TaskAnswer(UUID taskId, String answer) {}
}
