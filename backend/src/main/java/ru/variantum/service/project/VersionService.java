package ru.variantum.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.variantum.domain.Project;
import ru.variantum.domain.ProjectVersion;
import ru.variantum.dto.response.ProjectDetailResponse;
import ru.variantum.dto.response.VersionHistoryResponse;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.repository.ProjectVersionRepository;
import ru.variantum.service.llm.GeneratedModels;

import java.util.List;
import java.util.UUID;

/**
 * История версий комплекта и откат к выбранной версии.
 * Снимки пишет {@link ProjectService#saveVersion} при каждом значимом действии;
 * здесь — чтение списка и восстановление состояния из снимка.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class VersionService {

    private final ProjectService projectService;
    private final ProjectVersionRepository projectVersionRepository;
    private final ObjectMapper objectMapper;

    /** Список версий проекта (новые сверху). */
    @Transactional(readOnly = true)
    public VersionHistoryResponse history(UUID userId, UUID projectId) {
        projectService.requireOwned(userId, projectId);
        List<VersionHistoryResponse.Item> items = projectVersionRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(v -> new VersionHistoryResponse.Item(
                        v.getId().toString(),
                        v.getAction().name(),
                        v.getDescription(),
                        v.getCreatedAt().toString()))
                .toList();
        return new VersionHistoryResponse(items);
    }

    /** Откат проекта к состоянию указанной версии. */
    @Transactional
    public ProjectDetailResponse restore(UUID userId, UUID projectId, UUID versionId) {
        Project project = projectService.requireOwned(userId, projectId);
        ProjectVersion version = projectVersionRepository.findById(versionId)
                .orElseThrow(() -> new ResourceNotFoundException("Версия не найдена"));
        if (!version.getProjectId().equals(projectId)) {
            throw new ResourceNotFoundException("Версия не принадлежит проекту");
        }

        GeneratedModels.GeneratedSet snapshot;
        try {
            snapshot = objectMapper.treeToValue(version.getSnapshotJson(), GeneratedModels.GeneratedSet.class);
        } catch (Exception e) {
            log.error("Не удалось разобрать снимок версии {}: {}", versionId, e.getMessage());
            throw new IllegalStateException("Снимок версии повреждён, откат невозможен");
        }
        if (snapshot == null || snapshot.variants() == null || snapshot.variants().isEmpty()) {
            throw new IllegalStateException("Снимок версии пуст, откат невозможен");
        }

        projectService.persistVariants(project, snapshot);
        // Откат не пишется в историю и не списывает лимит
        return projectService.toDetailResponse(project);
    }
}
