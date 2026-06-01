package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.ProjectVersion;

import java.util.List;
import java.util.UUID;

public interface ProjectVersionRepository extends JpaRepository<ProjectVersion, UUID> {
    List<ProjectVersion> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
}
