package ru.variantum.domain;

import com.fasterxml.jackson.databind.JsonNode;
import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.Type;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "projects")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@SQLRestriction("deleted_at IS NULL")
public class Project {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 500)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Mode mode;

    private String subject;
    private Integer grade;
    private String topic;

    @Enumerated(EnumType.STRING)
    @Column(name = "task_type", length = 50)
    private TaskType taskType;

    @Column(name = "target_difficulty")
    private Integer targetDifficulty;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty_gradation", length = 50)
    private DifficultyGradation difficultyGradation;

    @Column(name = "custom_prompt", columnDefinition = "TEXT")
    private String customPrompt;

    @Column(name = "reference_text", columnDefinition = "TEXT")
    private String referenceText;

    @Column(name = "reference_file_id")
    private UUID referenceFileId;

    @Type(JsonBinaryType.class)
    @Column(name = "params_json", columnDefinition = "jsonb")
    private JsonNode paramsJson;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Status status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (status == null) status = Status.GENERATING;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public enum Mode { FROM_REFERENCE, FROM_CRITERIA }
    public enum TaskType { PROBLEM, TEST, EXERCISE, OPEN_QUESTION, MIXED }
    public enum DifficultyGradation { EQUAL, ASCENDING, CUSTOM }
    public enum Status { GENERATING, READY, FAILED }
}
