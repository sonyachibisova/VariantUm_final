package ru.variantum.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.variantum.domain.*;
import ru.variantum.dto.request.CreateProjectRequest;
import ru.variantum.dto.response.*;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.domain.UploadedFile;
import ru.variantum.repository.*;
import ru.variantum.service.llm.GenerateFromCriteriaService;
import ru.variantum.service.llm.GenerateFromReferenceService;
import ru.variantum.service.llm.GeneratedModels;
import ru.variantum.service.llm.RecommenderService;
import ru.variantum.service.ratelimit.LlmCostService;
import ru.variantum.service.ratelimit.RateLimitService;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final VariantRepository variantRepository;
    private final TaskRepository taskRepository;
    private final RecommendationRepository recommendationRepository;
    private final ProjectVersionRepository projectVersionRepository;
    private final UploadedFileRepository uploadedFileRepository;
    private final GenerateFromCriteriaService generateFromCriteriaService;
    private final GenerateFromReferenceService generateFromReferenceService;
    private final RecommenderService recommenderService;
    private final RateLimitService rateLimitService;
    private final LlmCostService costService;
    private final ProjectMapper projectMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public ProjectDetailResponse create(UUID userId, CreateProjectRequest req) {
        // Проверяем квоту до запуска дорогостоящей генерации
        rateLimitService.requireQuota(userId);

        Project project = buildProjectEntity(userId, req);
        project = projectRepository.save(project);

        try {
            GeneratedModels.GeneratedSet set;
            if ("FROM_CRITERIA".equals(req.mode())) {
                set = generateFromCriteriaService.generate(req.criteria(), req.params());
            } else if ("FROM_REFERENCE".equals(req.mode())) {
                set = generateFromReferenceService.generate(req.referenceText(), req.analysis(), null, req.params());
            } else {
                throw new IllegalArgumentException("Неизвестный режим: " + req.mode());
            }

            persistVariants(project, set);

            // Списываем стоимость генерации в процентах дневного лимита
            rateLimitService.deductPercent(userId, costService.setCost(set));

            project.setStatus(Project.Status.READY);
            project = projectRepository.save(project);

            saveVersion(project, ProjectVersion.Action.GENERATED, "Первоначальная генерация");
            runRecommendations(project);
        } catch (Exception e) {
            project.setStatus(Project.Status.FAILED);
            log.error("Ошибка генерации проекта {}: {}", project.getId(), e.getMessage(), e);
            project = projectRepository.save(project);
        }
        return toDetailResponse(project);
    }

    @Transactional(readOnly = true)
    public ProjectDetailResponse get(UUID userId, UUID projectId) {
        Project project = projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        return toDetailResponse(project);
    }

    @Transactional(readOnly = true)
    public ProjectPageResponse list(UUID userId, String subject, Integer grade, String q, int page, int size) {
        Page<Project> pageResult;
        if (subject != null || grade != null || (q != null && !q.isBlank())) {
            pageResult = projectRepository.search(userId, subject, grade,
                    q != null && !q.isBlank() ? q : null,
                    PageRequest.of(page, size));
        } else {
            pageResult = projectRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size));
        }

        List<ProjectListItemResponse> items = pageResult.getContent().stream()
                .map(p -> {
                    int count = variantRepository.findByProjectIdOrderByIndexInProjectAsc(p.getId()).size();
                    return new ProjectListItemResponse(
                            p.getId().toString(),
                            p.getTitle(),
                            p.getSubject(),
                            p.getGrade(),
                            count,
                            p.getCreatedAt().toString()
                    );
                }).toList();

        return new ProjectPageResponse(items, pageResult.getTotalPages(), pageResult.getTotalElements());
    }

    @Transactional
    public void delete(UUID userId, UUID projectId) {
        Project project = projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        project.setDeletedAt(OffsetDateTime.now());
        projectRepository.save(project);
    }

    /**
     * Повторная генерация провалившегося проекта: использует данные, сохранённые при создании.
     * Для FROM_CRITERIA: tasksPerVariant и targetTimeMinutes берутся из paramsJson или defaults.
     */
    @Transactional
    public ProjectDetailResponse retryGeneration(UUID userId, UUID projectId) {
        rateLimitService.requireQuota(userId);

        Project project = projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));

        project.setStatus(Project.Status.GENERATING);
        project = projectRepository.save(project);

        try {
            CreateProjectRequest.ParamsData params = reconstructParams(project);
            GeneratedModels.GeneratedSet set;

            if (project.getMode() == Project.Mode.FROM_CRITERIA) {
                CreateProjectRequest.CriteriaData criteria = reconstructCriteria(project, params);
                set = generateFromCriteriaService.generate(criteria, params);
            } else {
                CreateProjectRequest.AnalysisData analysis = reconstructAnalysis(project);
                set = generateFromReferenceService.generate(project.getReferenceText(), analysis, null, params);
            }

            persistVariants(project, set);
            rateLimitService.deductPercent(userId, costService.setCost(set));

            project.setStatus(Project.Status.READY);
            project = projectRepository.save(project);
            saveVersion(project, ProjectVersion.Action.GENERATED, "Повторная генерация");
            runRecommendations(project);
        } catch (Exception e) {
            project.setStatus(Project.Status.FAILED);
            log.error("Ошибка повторной генерации проекта {}: {}", project.getId(), e.getMessage(), e);
            project = projectRepository.save(project);
        }

        return toDetailResponse(project);
    }

    private CreateProjectRequest.ParamsData reconstructParams(Project project) {
        if (project.getParamsJson() != null && !project.getParamsJson().isNull()) {
            try {
                return objectMapper.treeToValue(project.getParamsJson(), CreateProjectRequest.ParamsData.class);
            } catch (Exception e) {
                log.warn("Не удалось десериализовать paramsJson проекта {}: {}", project.getId(), e.getMessage());
            }
        }
        return new CreateProjectRequest.ParamsData(4, java.util.List.of("NUMBERS", "CONTEXT"),
                null, "EQUAL", null, null);
    }

    private CreateProjectRequest.CriteriaData reconstructCriteria(Project project, CreateProjectRequest.ParamsData params) {
        String subject = project.getSubject() != null ? project.getSubject() : "math";
        int grade = project.getGrade() != null ? project.getGrade() : 9;
        String topic = project.getTopic() != null ? project.getTopic() : "";
        String taskType = project.getTaskType() != null ? project.getTaskType().name() : "PROBLEM";
        int difficulty = project.getTargetDifficulty() != null ? project.getTargetDifficulty() : 3;
        return new CreateProjectRequest.CriteriaData(subject, grade, topic, taskType, 5, 45, difficulty);
    }

    private CreateProjectRequest.AnalysisData reconstructAnalysis(Project project) {
        String subject = project.getSubject() != null ? project.getSubject() : "other";
        int grade = project.getGrade() != null ? project.getGrade() : 9;
        String topic = project.getTopic() != null ? project.getTopic() : "";
        String taskType = project.getTaskType() != null ? project.getTaskType().name() : "PROBLEM";
        int difficulty = project.getTargetDifficulty() != null ? project.getTargetDifficulty() : 3;
        return new CreateProjectRequest.AnalysisData(subject, grade, topic, taskType, difficulty);
    }

    /** Возвращает проект пользователя или 404/403. Используется VariantService. */
    @Transactional(readOnly = true)
    public Project requireOwned(UUID userId, UUID projectId) {
        return projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
    }

    @Transactional
    public ProjectDetailResponse updateReferenceText(UUID userId, UUID projectId, String referenceText) {
        Project project = projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        project.setReferenceText(referenceText);
        project = projectRepository.save(project);
        saveVersion(project, ProjectVersion.Action.MANUAL_EDIT, "Правка эталонного текста");
        return toDetailResponse(project);
    }

    // ---- персистентность вариантов (общая) ----

    /** Сохраняет один вариант с массивом заданий. Возвращает сохранённый Variant. */
    public Variant persistVariant(Project project, GeneratedModels.GeneratedVariant gv) {
        Variant variant = variantRepository.save(Variant.builder()
                .projectId(project.getId())
                .indexInProject(gv.index())
                .difficulty(gv.difficulty())
                .totalEstimatedMinutes(resolveTotalMinutes(gv))
                .build());
        if (gv.tasks() != null) {
            var tasks = ru.variantum.service.llm.SubTaskSplitter.splitGeneratedTasks(gv.tasks());
            for (var gt : tasks) {
                taskRepository.save(Task.builder()
                        .variantId(variant.getId())
                        .indexInVariant(gt.index())
                        .text(cleanTaskText(gt.text()))
                        .answer(gt.answer())
                        .steps(gt.steps())
                        .estimatedMinutes(gt.estimatedMinutes())
                        .difficulty(gt.difficulty() != null ? gt.difficulty() : gv.difficulty())
                        .taskType(parseTaskType(gt.taskType()))
                        .metadataJson(buildMetadataJson(gt))
                        .build());
            }
        }
        return variant;
    }

    /** Полностью заменяет варианты проекта на переданный комплект. */
    @Transactional
    public void persistVariants(Project project, GeneratedModels.GeneratedSet set) {
        if (set == null || set.variants() == null || set.variants().isEmpty()) {
            throw new IllegalStateException("LLM вернул пустой комплект вариантов");
        }
        clearVariants(project.getId());
        for (var gv : set.variants()) {
            persistVariant(project, gv);
        }
    }

    @Transactional
    public void clearVariants(UUID projectId) {
        for (Variant v : variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId)) {
            taskRepository.deleteByVariantId(v.getId());
        }
        variantRepository.deleteByProjectId(projectId);
    }

    /** Текущее состояние проекта в виде LLM-комплекта (для промптов правки/рекомендаций). */
    public GeneratedModels.GeneratedSet currentSet(UUID projectId) {
        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId);
        List<GeneratedModels.GeneratedVariant> gvs = new ArrayList<>();
        for (Variant v : variants) {
            List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(v.getId());
            gvs.add(projectMapper.toGenerated(v, tasks));
        }
        return new GeneratedModels.GeneratedSet(gvs, null);
    }

    // ---- рекомендации (отключены) ----

    public void runRecommendations(Project project) {
        // Рекомендации отключены — экономим лимиты GigaChat
        try {
            recommendationRepository.deleteByProjectId(project.getId());
        } catch (Exception e) {
            log.debug("runRecommendations cleanup: {}", e.getMessage());
        }
    }

    // ---- история версий ----

    public void saveVersion(Project project, ProjectVersion.Action action, String description) {
        try {
            var snapshot = objectMapper.valueToTree(currentSet(project.getId()));
            projectVersionRepository.save(ProjectVersion.builder()
                    .projectId(project.getId())
                    .action(action)
                    .description(description)
                    .snapshotJson(snapshot)
                    .build());
        } catch (Exception e) {
            log.warn("Не удалось сохранить версию проекта: {}", e.getMessage());
        }
    }

    // ---- сборка сущности проекта ----

    private Project buildProjectEntity(UUID userId, CreateProjectRequest req) {
        Project.Mode mode = "FROM_CRITERIA".equals(req.mode())
                ? Project.Mode.FROM_CRITERIA : Project.Mode.FROM_REFERENCE;

        String subject;
        Integer grade;
        String topic;
        Integer difficulty;
        String taskType;
        if (mode == Project.Mode.FROM_CRITERIA) {
            var c = req.criteria();
            subject = c.subject();
            grade = c.grade();
            topic = c.topic();
            difficulty = c.difficulty();
            taskType = c.taskType();
        } else {
            var a = req.analysis();
            subject = a != null ? a.subject() : null;
            grade = a != null ? a.grade() : null;
            topic = a != null ? a.topic() : null;
            difficulty = a != null ? a.difficulty() : null;
            taskType = a != null ? a.taskType() : null;
        }

        String gradation = req.params() != null ? req.params().difficultyGradation() : null;
        String customPrompt = req.params() != null ? req.params().customPrompt() : null;

        return Project.builder()
                .userId(userId)
                .title(buildTitle(mode, subject, grade, topic))
                .mode(mode)
                .subject(subject)
                .grade(grade)
                .topic(topic)
                .taskType(parseTaskType(taskType))
                .targetDifficulty(difficulty)
                .difficultyGradation(parseGradation(gradation))
                .customPrompt(customPrompt)
                .status(Project.Status.GENERATING)
                .referenceText(req.referenceText())
                .paramsJson(req.params() != null ? objectMapper.valueToTree(req.params()) : null)
                .build();
    }

    private String buildTitle(Project.Mode mode, String subject, Integer grade, String topic) {
        String modeLabel = mode == Project.Mode.FROM_CRITERIA ? "Контрольная" : "Варианты";
        String subjectLabel = subject != null ? subjectLabel(subject) : "предмет";
        String gradeLabel = grade != null ? grade + " класс" : "";
        String topicLabel = topic != null && !topic.isBlank() ? ": " + topic : "";
        return "%s по %s %s%s".formatted(modeLabel, subjectLabel, gradeLabel, topicLabel).trim();
    }

    private String subjectLabel(String s) {
        return switch (s) {
            case "math" -> "математике";
            case "physics" -> "физике";
            case "chemistry" -> "химии";
            case "biology" -> "биологии";
            case "russian" -> "русскому языку";
            case "literature" -> "литературе";
            case "english" -> "английскому языку";
            case "history" -> "истории";
            case "social_studies" -> "обществознанию";
            case "geography" -> "географии";
            case "informatics" -> "информатике";
            default -> s;
        };
    }

    private Integer resolveTotalMinutes(GeneratedModels.GeneratedVariant gv) {
        if (gv.totalEstimatedMinutes() != null) return gv.totalEstimatedMinutes();
        if (gv.tasks() == null) return null;
        return gv.tasks().stream()
                .map(GeneratedModels.GeneratedTask::estimatedMinutes)
                .filter(java.util.Objects::nonNull)
                .reduce(0, Integer::sum);
    }

    /** Собирает metadata_json из GeneratedTask: wrapper с figure, expectedAnswer, answerHint. */
    com.fasterxml.jackson.databind.JsonNode buildMetadataJson(GeneratedModels.GeneratedTask gt) {
        com.fasterxml.jackson.databind.node.ObjectNode node = objectMapper.createObjectNode();
        if (gt.figure() != null && !gt.figure().isEmpty()) {
            node.set("figure", objectMapper.valueToTree(gt.figure()));
        }
        if (gt.expectedAnswer() != null && !gt.expectedAnswer().isBlank()) {
            node.put("expectedAnswer", gt.expectedAnswer().trim());
        }
        if (gt.answerHint() != null && !gt.answerHint().isBlank()) {
            node.put("answerHint", gt.answerHint().trim());
        }
        return node.size() == 0 ? null : node;
    }

    /** Читает figure из metadataJson с поддержкой старого формата (прямой объект) и нового (wrapper). */
    private java.util.Map<String, Object> readFigureFromMetadata(Task t) {
        com.fasterxml.jackson.databind.JsonNode node = t.getMetadataJson();
        if (node == null || node.isNull()) return null;
        try {
            if (node.has("figure") || node.has("expectedAnswer") || node.has("answerHint")) {
                // Новый формат — wrapper; figure хранится под ключом "figure"
                com.fasterxml.jackson.databind.JsonNode figNode = node.get("figure");
                if (figNode == null || figNode.isNull()) return null;
                return objectMapper.convertValue(figNode,
                        new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            } else {
                // Старый формат — весь объект является figure
                return objectMapper.convertValue(node,
                        new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            }
        } catch (Exception e) {
            log.debug("Не удалось десериализовать figure задания {}: {}", t.getId(), e.getMessage());
            return null;
        }
    }

    private Project.TaskType parseTaskType(String s) {
        if (s == null || s.isBlank()) return Project.TaskType.PROBLEM;
        try {
            return Project.TaskType.valueOf(s);
        } catch (IllegalArgumentException e) {
            return Project.TaskType.PROBLEM;
        }
    }

    private Project.DifficultyGradation parseGradation(String s) {
        if (s == null || s.isBlank()) return Project.DifficultyGradation.EQUAL;
        try {
            return Project.DifficultyGradation.valueOf(s);
        } catch (IllegalArgumentException e) {
            return Project.DifficultyGradation.EQUAL;
        }
    }

    /**
     * Убирает типичные артефакты текста GigaChat: Markdown-заголовки, жирное выделение,
     * метки «Задание N:» и пустые плейсхолдеры [Рисунок: ...].
     */
    public static String cleanTaskText(String text) {
        if (text == null) return null;
        // Markdown-заголовки в начале строк: # Задание 1 → Задание 1
        text = text.replaceAll("(?m)^#{1,6}\\s*", "");
        // Жирное выделение **слово** → слово (LaTeX внутри $...$ не затрагивается)
        text = text.replaceAll("\\*\\*(.+?)\\*\\*", "$1");
        // Курсив *слово* → слово (только одиночные *, не ** и не внутри LaTeX)
        text = text.replaceAll("(?<![*$\\\\])\\*([^*\n]+)\\*(?![*$])", "$1");
        // «Задание N:» или «№N.» в самом начале текста
        text = text.replaceAll("^(?:Задание|Задача|Упражнение|№)\\s*\\d+[.:\\s)]+\\s*", "");
        // Удаляем только пустые плейсхолдеры без описания — с описанием отображаем как callout
        text = text.replaceAll("\\[(?:РИСУНОК|Рисунок|ЧЕРТЁЖ|Чертёж|ГРАФИК|График|Рисунок к задаче)\\s*:\\s*\\]", "");
        // Схлопываем тройные переносы и убираем пробелы по краям
        text = text.replaceAll("\n{3,}", "\n\n").trim();
        return text;
    }

    private Recommendation.Type parseRecType(String s) {
        try {
            return Recommendation.Type.valueOf(s);
        } catch (Exception e) {
            return Recommendation.Type.CUSTOM;
        }
    }

    private Recommendation.Severity parseSeverity(String s) {
        try {
            return Recommendation.Severity.valueOf(s);
        } catch (Exception e) {
            return Recommendation.Severity.INFO;
        }
    }

    // ---- маппинг в ответ ----

    public ProjectDetailResponse toDetailResponse(Project project) {
        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(project.getId());
        List<VariantResponse> variantResponses = variants.stream().map(v -> {
            List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(v.getId());
            List<TaskResponse> taskResponses = tasks.stream().map(t -> {
                java.util.Map<String, Object> figure = readFigureFromMetadata(t);
                return new TaskResponse(
                        t.getId().toString(),
                        t.getText(),
                        t.getAnswer(),
                        t.getSteps(),
                        t.getEstimatedMinutes(),
                        t.getDifficulty(),
                        t.getTaskType() != null ? t.getTaskType().name() : null,
                        figure,
                        t.getPhotoUrl()
                );
            }).toList();
            return new VariantResponse(
                    v.getId().toString(),
                    v.getIndexInProject(),
                    v.getDifficulty(),
                    v.getTotalEstimatedMinutes(),
                    taskResponses
            );
        }).toList();

        List<RecommendationResponse> recs = recommendationRepository
                .findByProjectIdAndDismissedFalse(project.getId()).stream()
                .map(r -> new RecommendationResponse(
                        r.getType().name(),
                        r.getVariantIndex(),
                        r.getSeverity().name(),
                        r.getMessage()
                )).toList();

        // Имя исходного загруженного файла (если есть)
        String refFileId = project.getReferenceFileId() != null ? project.getReferenceFileId().toString() : null;
        String refFileName = null;
        if (project.getReferenceFileId() != null) {
            try {
                refFileName = uploadedFileRepository.findById(project.getReferenceFileId())
                        .map(UploadedFile::getFilename).orElse(null);
            } catch (Exception e) {
                log.debug("Не удалось найти имя файла для проекта {}: {}", project.getId(), e.getMessage());
            }
        }

        return new ProjectDetailResponse(
                project.getId().toString(),
                project.getTitle(),
                project.getMode().name(),
                project.getStatus().name(),
                project.getSubject(),
                project.getGrade(),
                project.getTopic(),
                project.getReferenceText(),
                refFileId,
                refFileName,
                project.getCreatedAt().toString(),
                project.getUpdatedAt().toString(),
                variantResponses,
                recs
        );
    }
}
