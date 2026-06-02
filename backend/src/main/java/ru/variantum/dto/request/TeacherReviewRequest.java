package ru.variantum.dto.request;

import java.util.List;

public record TeacherReviewRequest(List<TaskReview> taskReviews) {
    // taskId — строка, не UUID: задачи передаются как UUID-строки,
    // общая оценка — специальный ключ "__OVERALL__"
    public record TaskReview(String taskId, String comment, String grade, Boolean overrideCorrect) {}
}
