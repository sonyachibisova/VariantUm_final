package ru.variantum.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "llm_request_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LlmRequestLog {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "project_id")
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(name = "prompt_type", nullable = false, length = 50)
    private PromptType promptType;

    @Column(name = "tokens_used")
    private Integer tokensUsed;

    @Column(name = "duration_ms")
    private Integer durationMs;

    @Column(nullable = false)
    private Boolean success;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }

    public enum PromptType {
        ANALYZE, GENERATE_REF, GENERATE_CRIT, VALIDATE,
        AI_EDIT_SINGLE, AI_EDIT_ALL, RECOMMEND, TIME_ESTIMATE
    }
}
