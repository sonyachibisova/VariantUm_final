package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;
import ru.variantum.dto.request.CreateProjectRequest;
import ru.variantum.dto.response.AnalysisResponse;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class GenerateFromReferenceService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    /**
     * Генерация вариантов по эталону. Генерирует по ОДНОМУ варианту за запрос (как FROM_CRITERIA),
     * чтобы избежать обрезания JSON при большом числе вариантов.
     */
    public GeneratedModels.GeneratedSet generate(String referenceText,
                                                 CreateProjectRequest.AnalysisData analysisData,
                                                 AnalysisResponse fullAnalysis,
                                                 CreateProjectRequest.ParamsData params) {
        int variantsCount = Math.max(1, params.variantsCount());
        int expectedTaskCount = countTasksInReference(referenceText);
        log.info("Генерация по эталону: {} вар. (по одному варианту за запрос), ожидаемых заданий: {}",
                variantsCount, expectedTaskCount);

        List<GeneratedModels.GeneratedVariant> variants = new ArrayList<>();

        for (int i = 1; i <= variantsCount; i++) {
            if (i > 1) {
                try { Thread.sleep(3000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
            try {
                GeneratedModels.GeneratedVariant v = generateOne(
                        referenceText, analysisData, fullAnalysis, params, i, variantsCount, expectedTaskCount);
                if (v != null && v.tasks() != null && !v.tasks().isEmpty()) {
                    variants.add(withIndex(v, i));
                } else {
                    log.warn("Вариант {}/{}: GigaChat вернул пустой вариант", i, variantsCount);
                }
            } catch (Exception e) {
                log.warn("Вариант {}/{} не сгенерирован: {}", i, variantsCount, e.getMessage());
            }
        }

        if (variants.isEmpty()) {
            throw new IllegalStateException("GigaChat не сгенерировал ни одного варианта по эталону");
        }
        return new GeneratedModels.GeneratedSet(variants, null);
    }

    private int countTasksInReference(String text) {
        if (text == null || text.isBlank()) return 1;
        long count = Arrays.stream(text.split("\n\\s*\n"))
                .filter(p -> p.trim().length() > 10)
                .count();
        return (int) Math.max(1, count);
    }

    private GeneratedModels.GeneratedVariant generateOne(String referenceText,
                                                          CreateProjectRequest.AnalysisData analysisData,
                                                          AnalysisResponse fullAnalysis,
                                                          CreateProjectRequest.ParamsData params,
                                                          int variantIndex,
                                                          int totalVariants,
                                                          int expectedTaskCount) {
        String invariants = "";
        String variableElements = "";
        int stepsCount = 2;
        if (fullAnalysis != null) {
            if (fullAnalysis.invariants() != null) invariants = String.join(", ", fullAnalysis.invariants());
            if (fullAnalysis.variableElements() != null) {
                variableElements = fullAnalysis.variableElements().stream()
                        .map(v -> v.type() + ": " + v.examples())
                        .collect(Collectors.joining("; "));
            }
            if (fullAnalysis.stepsCount() != null) stepsCount = fullAnalysis.stepsCount();
        }

        String variationTypes = params.variationTypes() != null
                ? String.join(", ", params.variationTypes()) : "NUMBERS, CONTEXT";
        String fixedElements = params.fixedElements() != null
                ? String.join(", ", params.fixedElements()) : "";

        int difficulty = resolveDifficulty(analysisData, params, variantIndex, totalVariants);

        Map<String, String> vars = new HashMap<>();
        vars.put("reference_text", referenceText);
        vars.put("subject", safe(analysisData != null ? analysisData.subject() : null));
        vars.put("grade", analysisData != null ? String.valueOf(analysisData.grade()) : "");
        vars.put("topic", safe(analysisData != null ? analysisData.topic() : null));
        vars.put("task_type", analysisData != null && analysisData.taskType() != null ? analysisData.taskType() : "PROBLEM");
        vars.put("difficulty", String.valueOf(difficulty));
        vars.put("steps_count", String.valueOf(stepsCount));
        vars.put("invariants", invariants);
        vars.put("variable_elements", variableElements);
        vars.put("variants_count", "1");
        vars.put("variation_types", variationTypes);
        vars.put("fixed_elements", fixedElements);
        vars.put("gradation_mode", "EQUAL");
        vars.put("difficulty_levels", "");
        vars.put("custom_prompt", params.customPrompt() != null ? params.customPrompt() : "");

        String prompt = promptBuilder.build(PromptBuilder.GENERATE_FROM_REFERENCE, vars);

        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureGenerate())
                .block();

        GeneratedModels.GeneratedSet set = llmJsonUtil.parse(raw, GeneratedModels.GeneratedSet.class);
        if (set == null || set.variants() == null || set.variants().isEmpty()) return null;
        GeneratedModels.GeneratedVariant v = set.variants().get(0);

        // Пробуем разбить объединённые задания
        List<GeneratedModels.GeneratedTask> normalized = splitMergedTasks(v.tasks(), expectedTaskCount);
        if (normalized.size() != v.tasks().size()) {
            log.info("Вариант {}: разбито объединённых заданий: {} → {}", variantIndex, v.tasks().size(), normalized.size());
            v = new GeneratedModels.GeneratedVariant(v.index(), v.difficulty(), v.totalEstimatedMinutes(), normalized);
        }

        if (v.tasks() != null && v.tasks().size() != expectedTaskCount) {
            log.warn("Вариант {}: GigaChat сгенерировал {} заданий вместо {}",
                    variantIndex, v.tasks().size(), expectedTaskCount);
            if (v.tasks().size() > expectedTaskCount) {
                v = new GeneratedModels.GeneratedVariant(
                        v.index(), v.difficulty(), v.totalEstimatedMinutes(),
                        List.copyOf(v.tasks().subList(0, expectedTaskCount)));
            }
        }
        return v;
    }

    private int resolveDifficulty(CreateProjectRequest.AnalysisData analysisData,
                                   CreateProjectRequest.ParamsData params,
                                   int variantIndex, int totalVariants) {
        int baseDifficulty = analysisData != null && analysisData.difficulty() > 0
                ? analysisData.difficulty() : 3;

        List<Integer> levels = params.difficultyLevels();
        if ("CUSTOM".equals(params.difficultyGradation()) && levels != null && levels.size() >= variantIndex) {
            return clamp(levels.get(variantIndex - 1));
        }
        if ("ASCENDING".equals(params.difficultyGradation())) {
            int total = Math.max(1, totalVariants);
            int step = total <= 1 ? 0 : (int) Math.round((variantIndex - 1) * 4.0 / (total - 1));
            return clamp(1 + step);
        }
        return clamp(baseDifficulty);
    }

    private int clamp(int d) {
        return Math.min(5, Math.max(1, d));
    }

    private GeneratedModels.GeneratedVariant withIndex(GeneratedModels.GeneratedVariant v, int index) {
        return new GeneratedModels.GeneratedVariant(index, v.difficulty(), v.totalEstimatedMinutes(), v.tasks());
    }

    private String safe(String s) {
        return s != null ? s : "";
    }

    private List<GeneratedModels.GeneratedTask> splitMergedTasks(
            List<GeneratedModels.GeneratedTask> tasks, int expectedCount) {
        if (tasks == null || tasks.isEmpty() || tasks.size() >= expectedCount) return tasks;

        List<GeneratedModels.GeneratedTask> result = new ArrayList<>();
        for (GeneratedModels.GeneratedTask task : tasks) {
            if ("TEST".equalsIgnoreCase(task.taskType())) {
                result.add(task);
                continue;
            }
            List<String> parts = extractNumberedParts(task.text());
            if (parts.size() >= 2) {
                for (int i = 0; i < parts.size(); i++) {
                    result.add(new GeneratedModels.GeneratedTask(
                            result.size() + 1, parts.get(i),
                            i == 0 ? task.answer() : null,
                            null, null,
                            task.steps(), task.estimatedMinutes(),
                            task.difficulty(), task.taskType(), task.figure()));
                }
            } else {
                result.add(task);
            }
        }

        List<GeneratedModels.GeneratedTask> reindexed = new ArrayList<>();
        for (int i = 0; i < result.size(); i++) {
            GeneratedModels.GeneratedTask t = result.get(i);
            reindexed.add(new GeneratedModels.GeneratedTask(
                    i + 1, t.text(), t.answer(), t.expectedAnswer(), t.answerHint(),
                    t.steps(), t.estimatedMinutes(), t.difficulty(), t.taskType(), t.figure()));
        }
        return reindexed;
    }

    private List<String> extractNumberedParts(String text) {
        if (text == null || text.isBlank()) return text != null ? List.of(text) : List.of();

        String[] lines = text.split("\n");
        List<String> parts = new ArrayList<>();
        StringBuilder buf = new StringBuilder();

        for (String line : lines) {
            String stripped = line.stripLeading();
            boolean isNewTask = stripped.matches("\\d+[.)]\\s+\\S.*") && stripped.length() >= 15;
            if (isNewTask && buf.length() > 5) {
                parts.add(buf.toString().trim());
                buf.setLength(0);
            }
            if (buf.length() > 0) buf.append('\n');
            buf.append(line);
        }
        if (buf.length() > 0) {
            String last = buf.toString().trim();
            if (!last.isEmpty()) parts.add(last);
        }

        if (parts.size() < 2) return List.of(text);

        return parts.stream()
                .map(p -> p.replaceFirst("^\\d+[.)]\\s+", "").trim())
                .filter(p -> p.length() >= 10)
                .toList();
    }
}
