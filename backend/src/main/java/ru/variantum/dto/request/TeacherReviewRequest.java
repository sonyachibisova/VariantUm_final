package ru.variantum.dto.request;

import java.util.List;
import java.util.UUID;

public record TeacherReviewRequest(List<TaskReview> taskReviews) {
    public record TaskReview(UUID taskId, String comment, String grade) {}
}
