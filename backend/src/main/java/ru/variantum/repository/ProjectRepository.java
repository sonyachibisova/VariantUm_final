package ru.variantum.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.variantum.domain.Project;

import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    Optional<Project> findByIdAndUserId(UUID id, UUID userId);

    Page<Project> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    @Query("""
            SELECT p FROM Project p
            WHERE p.userId = :userId
              AND (:subject IS NULL OR p.subject = :subject)
              AND (:grade IS NULL OR p.grade = :grade)
              AND (:q IS NULL OR LOWER(p.topic) LIKE LOWER(CONCAT('%', :q, '%'))
                              OR LOWER(p.title) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY p.createdAt DESC
            """)
    Page<Project> search(
            @Param("userId") UUID userId,
            @Param("subject") String subject,
            @Param("grade") Integer grade,
            @Param("q") String q,
            Pageable pageable
    );
}
