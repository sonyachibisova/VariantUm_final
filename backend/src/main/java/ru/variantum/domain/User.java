package ru.variantum.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@SQLRestriction("deleted_at IS NULL")
public class User {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private Role role;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    @Builder.Default
    @Column(name = "tasks_used", nullable = false)
    private int tasksUsed = 0;

    @Builder.Default
    @Column(name = "tasks_limit", nullable = false)
    private int tasksLimit = 100;

    /** Израсходовано процентов дневного лимита нейросети (0..100). Сбрасывается ежедневно. */
    @Builder.Default
    @Column(name = "daily_percent_used", nullable = false)
    private double dailyPercentUsed = 0;

    /** Дата, на которую актуален daily_percent_used. Если она в прошлом — лимит сброшен. */
    @Column(name = "limit_reset_date")
    private LocalDate limitResetDate;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (role == null) role = Role.TEACHER;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public enum Role { TEACHER, ADMIN }
}
