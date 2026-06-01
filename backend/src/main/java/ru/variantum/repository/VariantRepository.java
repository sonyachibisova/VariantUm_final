package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.variantum.domain.Variant;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VariantRepository extends JpaRepository<Variant, UUID> {
    List<Variant> findByProjectIdOrderByIndexInProjectAsc(UUID projectId);
    Optional<Variant> findByProjectIdAndIndexInProject(UUID projectId, Integer index);

    /**
     * JPQL-удаление вариантов проекта.
     * <ul>
     *   <li>{@code flushAutomatically} — перед DELETE сбрасывает в БД отложенные INSERT
     *       (например, только что созданный проект при генерации), иначе вставка вариантов
     *       упадёт по FK variants_project_id_fkey.</li>
     *   <li>{@code clearAutomatically} — после DELETE чистит кэш 1-го уровня, чтобы новые
     *       варианты с теми же index_in_project вставлялись без конфликта UNIQUE.</li>
     * </ul>
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Variant v WHERE v.projectId = :projectId")
    void deleteByProjectId(@Param("projectId") UUID projectId);
}
