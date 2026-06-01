package ru.variantum.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "form_students")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FormStudent {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "assignment_id", nullable = false)
    private UUID assignmentId;

    @Column(name = "full_name", nullable = false, length = 255)
    private String fullName;

    @Column(name = "variant_id", nullable = false)
    private UUID variantId;

    @Column(name = "access_token", nullable = false, unique = true, length = 64)
    private String accessToken;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
