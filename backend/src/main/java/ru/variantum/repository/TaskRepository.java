package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.variantum.domain.Task;

import java.util.List;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<Task, UUID> {
    List<Task> findByVariantIdOrderByIndexInVariantAsc(UUID variantId);

    /**
     * JPQL-удаление заданий варианта.
     * {@code flushAutomatically} сбрасывает отложенные INSERT в БД до DELETE
     * (иначе новый вариант не успеет появиться и вставка заданий упадёт по FK);
     * {@code clearAutomatically} чистит кэш 1-го уровня, чтобы последующая вставка
     * заданий с теми же index_in_variant не конфликтовала по UNIQUE.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Task t WHERE t.variantId = :variantId")
    void deleteByVariantId(@Param("variantId") UUID variantId);
}
