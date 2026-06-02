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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
        List<String> refTasks = splitReferenceIntoTasks(referenceText);
        int expectedTaskCount = Math.max(1, refTasks.size());
        // Per-task constraint: если в задании эталона есть [ФУНКЦИЯ:…] — во всех вариантах
        // под тем же номером ОБЯЗАН быть маркер графика.
        boolean[] taskHasGraph = detectTaskGraphs(refTasks);
        String graphConstraint = buildGraphConstraint(taskHasGraph);
        log.info("Генерация по эталону: {} вар. (по одному варианту за запрос), ожидаемых заданий: {}, задания с графиком: {}",
                variantsCount, expectedTaskCount, graphConstraint.isBlank() ? "нет" : graphConstraint);

        List<GeneratedModels.GeneratedVariant> variants = new ArrayList<>();
        // Накопленные функции графиков из уже сгенерированных вариантов — чтобы следующий вариант
        // НЕ повторял те же коэффициенты (иначе во всех вариантах рисуется один и тот же график).
        List<String> usedFunctions = new ArrayList<>();

        for (int i = 1; i <= variantsCount; i++) {
            try {
                GeneratedModels.GeneratedVariant v = generateOne(
                        referenceText, analysisData, fullAnalysis, params, i, variantsCount,
                        expectedTaskCount, usedFunctions, graphConstraint);
                if (v != null && v.tasks() != null && !v.tasks().isEmpty()) {
                    variants.add(withIndex(v, i));
                    usedFunctions.addAll(extractFunctions(v));
                    validateGraphPresence(v, taskHasGraph, i);
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

    /** Разбивает эталонный текст на отдельные задания (по абзацам, минимум 10 символов). */
    private List<String> splitReferenceIntoTasks(String text) {
        if (text == null || text.isBlank()) return List.of("");
        List<String> result = Arrays.stream(text.split("\n\\s*\n"))
                .map(String::trim)
                .filter(p -> p.length() > 10)
                .toList();
        return result.isEmpty() ? List.of(text.trim()) : result;
    }

    /** Возвращает массив флагов: true, если соответствующее задание эталона содержит график. */
    private boolean[] detectTaskGraphs(List<String> tasks) {
        boolean[] result = new boolean[tasks.size()];
        for (int i = 0; i < tasks.size(); i++) {
            String t = tasks.get(i);
            result[i] = t.contains("[ФУНКЦИЯ:") || t.contains("[ГРАФИК:") || t.contains("[FUNCTION:");
        }
        return result;
    }

    /**
     * Строит явное требование для промпта: перечисляет, какие задания ОБЯЗАНЫ иметь маркер
     * [ФУНКЦИЯ:] (и какие — НЕ должны), чтобы модель не путала их местами.
     */
    private String buildGraphConstraint(boolean[] taskHasGraph) {
        boolean anyGraph = false;
        for (boolean b : taskHasGraph) if (b) { anyGraph = true; break; }
        if (!anyGraph) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ГРАФИКОВ (строго соблюдай для каждого задания):");
        for (int i = 0; i < taskHasGraph.length; i++) {
            if (taskHasGraph[i]) {
                sb.append("\n  • Задание ").append(i + 1)
                  .append(": ОБЯЗАТЕЛЬНО включи маркер [ФУНКЦИЯ: {\"fn\":\"...\",\"xMin\":...,\"xMax\":...}].")
                  .append(" Без него задание неполное. Выбери новую функцию с целочисленными коэффициентами.");
            } else {
                sb.append("\n  • Задание ").append(i + 1)
                  .append(": график НЕ нужен — НЕ добавляй [ФУНКЦИЯ:].");
            }
        }
        return sb.toString();
    }

    /**
     * Проверяет: если задание №k эталона имеет график — у сгенерированного варианта задание №k
     * тоже должно иметь [ФУНКЦИЯ:…]. Несоответствие логируется, но не прерывает генерацию.
     */
    private void validateGraphPresence(GeneratedModels.GeneratedVariant v,
                                       boolean[] taskHasGraph, int variantIndex) {
        List<GeneratedModels.GeneratedTask> tasks = v.tasks();
        for (int k = 0; k < taskHasGraph.length && k < tasks.size(); k++) {
            boolean expected = taskHasGraph[k];
            String text = tasks.get(k).text();
            boolean actual = text != null && text.contains("[ФУНКЦИЯ:");
            if (expected && !actual) {
                log.warn("Вариант {}: задание {} — ожидался [ФУНКЦИЯ:], но модель его не сгенерировала",
                        variantIndex, k + 1);
            }
        }
    }

    @SuppressWarnings("unused") // оставлен для обратной совместимости
    private int countTasksInReference(String text) {
        return splitReferenceIntoTasks(text).size();
    }

    private GeneratedModels.GeneratedVariant generateOne(String referenceText,
                                                          CreateProjectRequest.AnalysisData analysisData,
                                                          AnalysisResponse fullAnalysis,
                                                          CreateProjectRequest.ParamsData params,
                                                          int variantIndex,
                                                          int totalVariants,
                                                          int expectedTaskCount,
                                                          List<String> usedFunctions,
                                                          String graphConstraint) {
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
        String variationInstructions = buildVariationInstructions(params.variationTypes());
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
        vars.put("variation_instructions", variationInstructions);
        vars.put("fixed_elements", fixedElements);
        vars.put("gradation_mode", "EQUAL");
        vars.put("difficulty_levels", "");

        String customPrompt = params.customPrompt() != null ? params.customPrompt() : "";
        // Жёсткое требование по графикам — какие задания обязаны иметь [ФУНКЦИЯ:], а какие нет.
        if (!graphConstraint.isBlank()) {
            customPrompt = customPrompt.isBlank() ? graphConstraint : customPrompt + "\n" + graphConstraint;
        }
        if (!usedFunctions.isEmpty()) {
            // Перечисляем функции из предыдущих вариантов, чтобы график этого варианта отличался.
            String avoid = usedFunctions.stream().distinct().limit(12).collect(Collectors.joining("; "));
            String hint = "УЖЕ ИСПОЛЬЗОВАННЫЕ ФУНКЦИИ (НЕ повторять): [" + avoid +
                    "]. Для каждого задания с графиком в ЭТОМ варианте выбери ДРУГУЮ функцию " +
                    "с другими целочисленными коэффициентами.";
            customPrompt = customPrompt.isBlank() ? hint : customPrompt + "\n" + hint;
        }
        vars.put("custom_prompt", customPrompt);

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

    private static final java.util.regex.Pattern FN_IN_MARKER =
            java.util.regex.Pattern.compile("\\[ФУНКЦИЯ:[^\\]]*\"fn\"\\s*:\\s*\"([^\"]+)\"");

    /** Достаёт строки функций (fn) из маркеров [ФУНКЦИЯ:{...}] всех заданий варианта. */
    private List<String> extractFunctions(GeneratedModels.GeneratedVariant v) {
        List<String> result = new ArrayList<>();
        if (v.tasks() == null) return result;
        for (GeneratedModels.GeneratedTask t : v.tasks()) {
            for (String field : new String[]{t.text(), t.answer()}) {
                if (field == null) continue;
                var m = FN_IN_MARKER.matcher(field);
                while (m.find()) result.add(m.group(1).trim());
            }
        }
        return result;
    }

    /** Человекочитаемые описания измерений вариации (порядок важен для вывода). */
    private static final LinkedHashMap<String, String> VARIATION_LABELS = new LinkedHashMap<>();
    static {
        VARIATION_LABELS.put("NUMBERS", "числовые данные: числа, величины, коэффициенты, единицы измерения");
        VARIATION_LABELS.put("NAMES", "имена людей и собственные/географические названия");
        VARIATION_LABELS.put("CONTEXT", "сюжет и ситуацию задачи (объекты, обстоятельства), СОХРАНЯЯ её смысл, тип и структуру");
        VARIATION_LABELS.put("ORDER", "порядок данных и подпунктов внутри условия");
        VARIATION_LABELS.put("LEXIS", "формулировки и лексику — перефразируй ключевые части условия");
    }

    /**
     * Превращает выбранные учителем измерения вариации в чёткие инструкции «что менять / что
     * строго сохранять». Это критично: без явного списка «не трогать» модель либо меняет лишнее
     * (когда выбраны только числа), либо почти не меняет (когда выбрана полная вариация).
     */
    private String buildVariationInstructions(List<String> types) {
        Set<String> selected = (types == null || types.isEmpty())
                ? new HashSet<>(List.of("NUMBERS", "CONTEXT"))
                : new HashSet<>(types);
        StringBuilder change = new StringBuilder();
        StringBuilder keep = new StringBuilder();
        for (Map.Entry<String, String> e : VARIATION_LABELS.entrySet()) {
            if (selected.contains(e.getKey())) change.append("\n  • ").append(e.getValue());
            else keep.append("\n  • ").append(e.getValue());
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ОБЯЗАТЕЛЬНО меняй в каждом варианте (так, чтобы варианты заметно отличались и числовые ответы были разными):")
          .append(change);
        if (keep.length() > 0) {
            sb.append("\nСТРОГО СОХРАНЯЙ как в эталоне — НЕ трогай (оставляй дословно/без изменений):")
              .append(keep);
        } else {
            sb.append("\nРазрешено менять ВСЁ перечисленное — делай варианты максимально непохожими друг на друга.");
        }
        return sb.toString();
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
