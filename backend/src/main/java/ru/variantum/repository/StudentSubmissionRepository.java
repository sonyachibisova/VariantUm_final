package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.StudentSubmission;

import java.util.List;
import java.util.UUID;

public interface StudentSubmissionRepository extends JpaRepository<StudentSubmission, UUID> {
    List<StudentSubmission> findByAssignmentId(UUID assignmentId);
    List<StudentSubmission> findByVariantId(UUID variantId);
    boolean existsByAssignmentIdAndStudentName(UUID assignmentId, String studentName);
}
