package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.variantum.domain.Recommendation;

import java.util.List;
import java.util.UUID;

public interface RecommendationRepository extends JpaRepository<Recommendation, UUID> {
    List<Recommendation> findByProjectIdAndDismissedFalse(UUID projectId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Recommendation r WHERE r.projectId = :projectId")
    void deleteByProjectId(@Param("projectId") UUID projectId);
}
