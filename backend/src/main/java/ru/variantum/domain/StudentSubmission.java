package ru.variantum.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "student_submissions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentSubmission {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "assignment_id", nullable = false)
    private UUID assignmentId;

    @Column(name = "variant_id", nullable = false)
    private UUID variantId;

    @Column(name = "student_name", nullable = false, length = 255)
    private String studentName;

    @Column(name = "answers_json", nullable = false, columnDefinition = "TEXT")
    private String answersJson;

    @Column(name = "auto_score", columnDefinition = "TEXT")
    private String autoScore;

    @Column(name = "teacher_review", columnDefinition = "TEXT")
    private String teacherReview;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private OffsetDateTime submittedAt;

    @PrePersist
    void onCreate() {
        if (submittedAt == null) submittedAt = OffsetDateTime.now();
    }
}
