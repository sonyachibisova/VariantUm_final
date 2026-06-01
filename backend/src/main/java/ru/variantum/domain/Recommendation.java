package ru.variantum.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "recommendations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Recommendation {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Type type;

    @Column(name = "variant_index")
    private Integer variantIndex;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Severity severity;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false)
    @Builder.Default
    private Boolean dismissed = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
        if (dismissed == null) dismissed = false;
    }

    public enum Type {
        DIFFICULTY_OUTLIER, DUPLICATE_ANSWER, TIME_MISMATCH, ADD_VARIATION, CUSTOM
    }

    public enum Severity { INFO, WARNING, CRITICAL }
}
