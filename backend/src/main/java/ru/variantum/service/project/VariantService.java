package ru.variantum.service.project;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.variantum.domain.Project;
import ru.variantum.domain.ProjectVersion;
import ru.variantum.domain.Task;
import ru.variantum.domain.Variant;
import ru.variantum.dto.request.UpdateVariantRequest;
import ru.variantum.dto.request.VariantActionRequest;
import ru.variantum.dto.response.ProjectDetailResponse;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.repository.TaskRepository;
import ru.variantum.repository.VariantRepository;
import ru.variantum.service.llm.AiEditAllService;
import ru.variantum.service.llm.AiEditSingleService;
import ru.variantum.service.llm.GeneratedModels;
import ru.variantum.service.ratelimit.LlmCostService;
import ru.variantum.service.ratelimit.RateLimitService;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Редактирование вариантов внутри проекта: ручная правка, перегенерация,
 * AI-правка одного/всего комплекта, добавление и удаление варианта.
 * Каждая операция фиксируется в истории версий проекта.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class VariantService {

    private static final String REGENERATE_PROMPT =
            "Сгенерируй ПОЛНОСТЬЮ НОВЫЙ эквивалентный вариант: замени числовые данные, имена и сюжет, " +
            "сохранив структуру, число заданий, тип и сложность. Все ответы должны отличаться от исходных.";

    private static final String NEW_VARIANT_PROMPT =
            "На основе этого варианта составь ЕЩЁ ОДИН новый равноценный вариант той же структуры и сложности " +
            "с другими числами, именами и сюжетом. Ответы должны отличаться от исходного.";

    private final ProjectService projectService;
    private final VariantRepository variantRepository;
    private final TaskRepository taskRepository;
    private final ProjectMapper projectMapper;
    private final AiEditSingleService aiEditSingleService;
    private final AiEditAllService aiEditAllService;
    private final RateLimitService rateLimitService;
    private final LlmCostService costService;
    private final ObjectMapper objectMapper;

    // ---- ручная правка (после WYSIWYG) ----

    @Transactional
    public ProjectDetailResponse updateVariant(UUID userId, UUID projectId, UUID variantId, UpdateVariantRequest req) {
        Project project = projectService.requireOwned(userId, projectId);
        Variant variant = requireVariant(projectId, variantId);

        if (req.difficulty() != null) variant.setDifficulty(req.difficulty());

        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variantId);
        if (req.tasks() != null) {
            for (var patch : req.tasks()) {
                tasks.stream()
                        .filter(t -> t.getId().toString().equals(patch.taskId()))
                        .findFirst()
                        .ifPresent(t -> {
                            if (patch.text() != null) t.setText(patch.text());
                            if (patch.answer() != null) t.setAnswer(patch.answer());
                            if (patch.steps() != null) t.setSteps(patch.steps());
                            if (patch.estimatedMinutes() != null) t.setEstimatedMinutes(patch.estimatedMinutes());
                            if (patch.difficulty() != null) t.setDifficulty(patch.difficulty());
                            if (patch.photoUrl() != null) {
                                t.setPhotoUrl(patch.photoUrl().isBlank() ? null : patch.photoUrl());
                            }
                            taskRepository.save(t);
                        });
            }
        }
        recalcTotalMinutes(variant);
        variantRepository.save(variant);

        projectService.saveVersion(project, ProjectVersion.Action.MANUAL_EDIT,
                "Ручная правка варианта " + variant.getIndexInProject());
        return projectService.toDetailResponse(project);
    }

    // ---- перегенерация одного варианта ----

    @Transactional
    public ProjectDetailResponse regenerate(UUID userId, UUID projectId, UUID variantId, VariantActionRequest req) {
        Project project = projectService.requireOwned(userId, projectId);
        Variant variant = requireVariant(projectId, variantId);

        rateLimitService.requireQuota(userId);

        String prompt = REGENERATE_PROMPT;
        if (req != null && req.customPrompt() != null && !req.customPrompt().isBlank()) {
            prompt += " Дополнительно: " + req.customPrompt();
        }
        GeneratedModels.GeneratedVariant edited = aiEditSingleService.edit(
                variantJson(variant), prompt,
                project.getSubject(), project.getGrade(), project.getTopic(),
                variant.getDifficulty(), firstSteps(variant));

        applyToVariant(variant, edited);

        rateLimitService.deductPercent(userId, variantTasksCost(variantId));

        projectService.saveVersion(project, ProjectVersion.Action.REGENERATED,
                "Перегенерация варианта " + variant.getIndexInProject());
        projectService.runRecommendations(project);
        return projectService.toDetailResponse(project);
    }

    // ---- промпт-правка одного варианта ----

    @Transactional
    public ProjectDetailResponse aiEditSingle(UUID userId, UUID projectId, UUID variantId, String userPrompt) {
        Project project = projectService.requireOwned(userId, projectId);
        Variant variant = requireVariant(projectId, variantId);

        rateLimitService.requireQuota(userId);

        GeneratedModels.GeneratedVariant edited = aiEditSingleService.edit(
                variantJson(variant), userPrompt,
                project.getSubject(), project.getGrade(), project.getTopic(),
                variant.getDifficulty(), firstSteps(variant));

        applyToVariant(variant, edited);

        rateLimitService.deductPercent(userId, variantTasksCost(variantId));

        projectService.saveVersion(project, ProjectVersion.Action.AI_EDIT_SINGLE,
                "Правка варианта " + variant.getIndexInProject() + " через ИИ");
        projectService.runRecommendations(project);
        return projectService.toDetailResponse(project);
    }

    // ---- промпт-правка всего комплекта ----

    @Transactional
    public ProjectDetailResponse aiEditAll(UUID userId, UUID projectId, String userPrompt) {
        Project project = projectService.requireOwned(userId, projectId);

        rateLimitService.requireQuota(userId);

        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId);
        List<String> variantJsonList = variants.stream()
                .map(v -> variantJson(v))
                .toList();

        GeneratedModels.GeneratedSet edited = aiEditAllService.edit(
                variantJsonList, userPrompt,
                project.getSubject(), project.getGrade(), project.getTopic(),
                project.getTargetDifficulty(),
                project.getDifficultyGradation() != null ? project.getDifficultyGradation().name() : "EQUAL");

        projectService.persistVariants(project, edited);
        rateLimitService.deductPercent(userId, costService.setCost(edited));
        projectService.saveVersion(project, ProjectVersion.Action.AI_EDIT_ALL, "Правка комплекта через ИИ");
        projectService.runRecommendations(project);
        return projectService.toDetailResponse(project);
    }

    // ---- добавить вариант ----

    @Transactional
    public ProjectDetailResponse addVariant(UUID userId, UUID projectId, VariantActionRequest req) {
        Project project = projectService.requireOwned(userId, projectId);
        rateLimitService.requireQuota(userId);
        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId);
        if (variants.isEmpty()) {
            throw new ResourceNotFoundException("В проекте нет вариантов для шаблона");
        }
        Variant template = variants.get(variants.size() - 1);
        int newIndex = template.getIndexInProject() + 1;

        String prompt = NEW_VARIANT_PROMPT;
        if (req != null && req.customPrompt() != null && !req.customPrompt().isBlank()) {
            prompt += " Дополнительно: " + req.customPrompt();
        }
        Integer difficulty = req != null && req.difficulty() != null ? req.difficulty() : template.getDifficulty();

        GeneratedModels.GeneratedVariant generated = aiEditSingleService.edit(
                variantJson(template), prompt,
                project.getSubject(), project.getGrade(), project.getTopic(),
                difficulty, firstSteps(template));

        GeneratedModels.GeneratedVariant withIndex = new GeneratedModels.GeneratedVariant(
                newIndex, difficulty, generated.totalEstimatedMinutes(), generated.tasks());
        projectService.persistVariant(project, withIndex);

        rateLimitService.deductPercent(userId, costService.variantCost(withIndex));

        projectService.saveVersion(project, ProjectVersion.Action.VARIANT_ADDED, "Добавлен вариант " + newIndex);
        projectService.runRecommendations(project);
        return projectService.toDetailResponse(project);
    }

    // ---- перегенерация одного задания ----

    @Transactional
    public ProjectDetailResponse regenerateTask(UUID userId, UUID projectId, UUID variantId, UUID taskId) {
        Project project = projectService.requireOwned(userId, projectId);
        Variant variant = requireVariant(projectId, variantId);

        rateLimitService.requireQuota(userId);

        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variantId);
        Task target = tasks.stream()
                .filter(t -> t.getId().equals(taskId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Задание не найдено"));

        // Сериализуем только одно задание — так GigaChat точнее выполняет инструкцию
        GeneratedModels.GeneratedTask gt = projectMapper.toGenerated(variant, List.of(target)).tasks().get(0);
        String taskJson = projectMapper.toJson(gt);

        GeneratedModels.GeneratedTask newTask = aiEditSingleService.regenerateTask(
                taskJson, project.getSubject(), project.getGrade());

        // Обновляем только целевое задание, все остальные трогать не нужно
        target.setText(ProjectService.cleanTaskText(newTask.text()));
        if (newTask.answer() != null) target.setAnswer(newTask.answer());
        if (newTask.estimatedMinutes() != null) target.setEstimatedMinutes(newTask.estimatedMinutes());
        taskRepository.save(target);

        rateLimitService.deductPercent(userId, costService.taskCost(target.getText(), target.getMetadataJson()));

        projectService.saveVersion(project, ProjectVersion.Action.AI_EDIT_SINGLE,
                "Перегенерация задания " + target.getIndexInVariant() + " варианта " + variant.getIndexInProject());
        return projectService.toDetailResponse(project);
    }

    // ---- удалить вариант ----

    @Transactional
    public ProjectDetailResponse deleteVariant(UUID userId, UUID projectId, UUID variantId) {
        Project project = projectService.requireOwned(userId, projectId);
        Variant variant = requireVariant(projectId, variantId);

        taskRepository.deleteByVariantId(variant.getId());
        variantRepository.delete(variant);

        List<Variant> remaining = variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId);
        int idx = 1;
        for (Variant v : remaining) {
            if (!Objects.equals(v.getIndexInProject(), idx)) {
                v.setIndexInProject(idx);
                variantRepository.save(v);
            }
            idx++;
        }

        projectService.saveVersion(project, ProjectVersion.Action.VARIANT_DELETED, "Удалён вариант");
        projectService.runRecommendations(project);
        return projectService.toDetailResponse(project);
    }

    // ---- helpers ----

    /** Стоимость (в %) персистентных заданий варианта — для списания лимита после правки. */
    private double variantTasksCost(UUID variantId) {
        return taskRepository.findByVariantIdOrderByIndexInVariantAsc(variantId).stream()
                .mapToDouble(t -> costService.taskCost(t.getText(), t.getMetadataJson()))
                .sum();
    }

    private Variant requireVariant(UUID projectId, UUID variantId) {
        Variant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Вариант не найден"));
        if (!variant.getProjectId().equals(projectId)) {
            throw new ResourceNotFoundException("Вариант не принадлежит проекту");
        }
        return variant;
    }

    private String variantJson(Variant variant) {
        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variant.getId());
        return projectMapper.toJson(projectMapper.toGenerated(variant, tasks));
    }

    private Integer firstSteps(Variant variant) {
        return taskRepository.findByVariantIdOrderByIndexInVariantAsc(variant.getId()).stream()
                .map(Task::getSteps).filter(Objects::nonNull).findFirst().orElse(null);
    }

    private void applyToVariant(Variant variant, GeneratedModels.GeneratedVariant gv) {
        if (gv.tasks() == null || gv.tasks().isEmpty()) {
            throw new IllegalStateException("ИИ вернул вариант без заданий");
        }
        if (gv.difficulty() != null) variant.setDifficulty(gv.difficulty());

        taskRepository.deleteByVariantId(variant.getId());
        int i = 1;
        for (var gt : gv.tasks()) {
            taskRepository.save(Task.builder()
                    .variantId(variant.getId())
                    .indexInVariant(gt.index() > 0 ? gt.index() : i)
                    .text(ProjectService.cleanTaskText(gt.text()))
                    .answer(gt.answer())
                    .steps(gt.steps())
                    .estimatedMinutes(gt.estimatedMinutes())
                    .difficulty(gt.difficulty() != null ? gt.difficulty() : variant.getDifficulty())
                    .taskType(parseTaskType(gt.taskType()))
                    .metadataJson(projectService.buildMetadataJson(gt))
                    .build());
            i++;
        }
        variant.setTotalEstimatedMinutes(
                gv.totalEstimatedMinutes() != null ? gv.totalEstimatedMinutes() : sumMinutes(gv));
        variantRepository.save(variant);
    }

    private void recalcTotalMinutes(Variant variant) {
        int sum = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variant.getId()).stream()
                .map(Task::getEstimatedMinutes).filter(Objects::nonNull).reduce(0, Integer::sum);
        if (sum > 0) variant.setTotalEstimatedMinutes(sum);
    }

    private Integer sumMinutes(GeneratedModels.GeneratedVariant gv) {
        if (gv.tasks() == null) return null;
        return gv.tasks().stream()
                .map(GeneratedModels.GeneratedTask::estimatedMinutes)
                .filter(Objects::nonNull).reduce(0, Integer::sum);
    }

    private Project.TaskType parseTaskType(String s) {
        if (s == null || s.isBlank()) return Project.TaskType.PROBLEM;
        try {
            return Project.TaskType.valueOf(s);
        } catch (IllegalArgumentException e) {
            return Project.TaskType.PROBLEM;
        }
    }
}
