package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.LlmRequestLog;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface LlmRequestLogRepository extends JpaRepository<LlmRequestLog, UUID> {
    long countByUserIdAndCreatedAtAfter(UUID userId, OffsetDateTime since);
}
