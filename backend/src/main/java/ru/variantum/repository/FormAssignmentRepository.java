package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.FormAssignment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FormAssignmentRepository extends JpaRepository<FormAssignment, UUID> {
    List<FormAssignment> findByProjectId(UUID projectId);
    List<FormAssignment> findByProjectIdAndUserId(UUID projectId, UUID userId);
    Optional<FormAssignment> findByAccessToken(String token);
}
