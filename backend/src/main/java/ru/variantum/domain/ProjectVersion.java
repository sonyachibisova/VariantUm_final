package ru.variantum.domain;

import com.fasterxml.jackson.databind.JsonNode;
import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Type;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "project_versions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectVersion {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Action action;

    @Column(length = 500)
    private String description;

    @Type(JsonBinaryType.class)
    @Column(name = "snapshot_json", columnDefinition = "jsonb", nullable = false)
    private JsonNode snapshotJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }

    public enum Action {
        GENERATED, MANUAL_EDIT, AI_EDIT_SINGLE, AI_EDIT_ALL,
        REGENERATED, VARIANT_ADDED, VARIANT_DELETED
    }
}
