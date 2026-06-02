package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.FormStudent;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FormStudentRepository extends JpaRepository<FormStudent, UUID> {
    Optional<FormStudent> findByAccessToken(String token);
    List<FormStudent> findByAssignmentId(UUID assignmentId);
    long countByAssignmentId(UUID assignmentId);
    List<FormStudent> findByAssignmentIdAndFullNameIgnoreCase(UUID assignmentId, String name);
}
