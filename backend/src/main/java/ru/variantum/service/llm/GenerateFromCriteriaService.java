package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;
import ru.variantum.dto.request.CreateProjectRequest;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class GenerateFromCriteriaService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    /**
     * Генерирует комплект ПО ОДНОМУ ВАРИАНТУ ЗА ЗАПРОС.
     * Первый вариант — «образец»: из него извлекается шаблон структуры (типы и формат каждого задания).
     * Все последующие варианты генерируются с указанием этого шаблона → единая структура.
     */
    public GeneratedModels.GeneratedSet generate(CreateProjectRequest.CriteriaData criteria,
                                                 CreateProjectRequest.ParamsData params) {
        int variantsCount = Math.max(1, params.variantsCount());
        log.info("Генерация по критериям: {} кл.{}, {} вар. (по одному варианту за запрос)",
                criteria.subject(), criteria.grade(), variantsCount);

        List<GeneratedModels.GeneratedVariant> variants = new ArrayList<>();

        // Шаблон структуры — строится после первого варианта и передаётся в остальные
        String structureTemplate = null;

        for (int i = 1; i <= variantsCount; i++) {
            if (i > 1) {
                try { Thread.sleep(3000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
            try {
                GeneratedModels.GeneratedVariant v = generateOne(criteria, params, i, structureTemplate);
                if (v != null && v.tasks() != null && !v.tasks().isEmpty()) {
                    variants.add(withIndex(v, i));
                    // После первого успешного варианта строим шаблон структуры
                    if (structureTemplate == null) {
                        structureTemplate = buildStructureTemplate(v);
                        log.debug("Структурный шаблон: {}", structureTemplate);
                    }
                } else {
                    log.warn("Вариант {}/{}: GigaChat вернул пустой вариант", i, variantsCount);
                }
            } catch (Exception e) {
                log.warn("Вариант {}/{} не сгенерирован: {}", i, variantsCount, e.getMessage());
            }
        }

        if (variants.isEmpty()) {
            throw new IllegalStateException("GigaChat не сгенерировал ни одного варианта по критериям");
        }
        return new GeneratedModels.GeneratedSet(variants, null);
    }

    /**
     * Строит текстовый шаблон структуры из первого сгенерированного варианта.
     * Пример: "Задание 1: PROBLEM (вычисление), Задание 2: PROBLEM (текстовая задача), ..."
     */
    private String buildStructureTemplate(GeneratedModels.GeneratedVariant variant) {
        if (variant.tasks() == null || variant.tasks().isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < variant.tasks().size(); i++) {
            GeneratedModels.GeneratedTask t = variant.tasks().get(i);
            if (sb.length() > 0) sb.append("; ");
            sb.append("Задание ").append(i + 1).append(": ")
              .append(t.taskType() != null ? t.taskType() : "PROBLEM");
            // Добавляем первые 8 слов текста как подсказку о структуре
            if (t.text() != null) {
                String[] words = t.text().replaceAll("\\$[^$]*\\$", "").trim().split("\\s+");
                int take = Math.min(8, words.length);
                sb.append(" (").append(String.join(" ", Arrays.copyOf(words, take))).append("...)");
            }
        }
        return sb.toString();
    }

    /** Один вариант (variants_count=1) — компактный ответ, не упирается в лимит токенов. */
    private GeneratedModels.GeneratedVariant generateOne(CreateProjectRequest.CriteriaData criteria,
                                                         CreateProjectRequest.ParamsData params,
                                                         int variantIndex,
                                                         String structureTemplate) {
        String gradationMode = params.difficultyGradation() != null ? params.difficultyGradation() : "EQUAL";
        int difficulty = resolveDifficulty(criteria, params, variantIndex);

        // Если есть шаблон структуры — добавляем его в customPrompt
        String effectiveCustomPrompt = params.customPrompt() != null ? params.customPrompt() : "";
        if (structureTemplate != null && !structureTemplate.isBlank()) {
            String structureHint = "ВАЖНО: используй ТОЧНО ТАКУЮ ЖЕ СТРУКТУРУ заданий, как шаблон: " + structureTemplate
                    + ". Тип и форма каждого задания должны совпадать с шаблоном — меняй только конкретные данные.";
            effectiveCustomPrompt = effectiveCustomPrompt.isBlank()
                    ? structureHint : effectiveCustomPrompt + "\n" + structureHint;
        }

        Map<String, String> vars = new HashMap<>();
        vars.put("subject", criteria.subject());
        vars.put("grade", String.valueOf(criteria.grade()));
        vars.put("topic", criteria.topic());
        vars.put("task_type", criteria.taskType() != null ? criteria.taskType() : "PROBLEM");
        vars.put("variants_count", "1");
        vars.put("tasks_per_variant", String.valueOf(criteria.tasksPerVariant()));
        vars.put("target_time_minutes", String.valueOf(criteria.targetTimeMinutes()));
        vars.put("difficulty", String.valueOf(difficulty));
        vars.put("gradation_mode", gradationMode);
        vars.put("difficulty_levels", "");
        vars.put("custom_prompt", effectiveCustomPrompt);

        String prompt = promptBuilder.build(PromptBuilder.GENERATE_FROM_CRITERIA, vars);
        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureGenerate())
                .block();

        GeneratedModels.GeneratedSet set = llmJsonUtil.parse(raw, GeneratedModels.GeneratedSet.class);
        if (set == null || set.variants() == null || set.variants().isEmpty()) return null;
        GeneratedModels.GeneratedVariant v = set.variants().get(0);

        int expected = criteria.tasksPerVariant();

        // Пробуем разбить объединённые задания (GigaChat иногда кладёт несколько в одно поле text)
        List<GeneratedModels.GeneratedTask> normalized = splitMergedTasks(v.tasks(), expected);
        if (normalized.size() != v.tasks().size()) {
            log.info("Вариант {}: разбито объединённых заданий: {} → {}", variantIndex, v.tasks().size(), normalized.size());
            v = new GeneratedModels.GeneratedVariant(v.index(), v.difficulty(), v.totalEstimatedMinutes(), normalized);
        }

        if (v.tasks() != null && v.tasks().size() != expected) {
            log.warn("Вариант {}: GigaChat сгенерировал {} заданий вместо {}",
                    variantIndex, v.tasks().size(), expected);
            if (v.tasks().size() > expected) {
                v = new GeneratedModels.GeneratedVariant(
                        v.index(), v.difficulty(), v.totalEstimatedMinutes(),
                        List.copyOf(v.tasks().subList(0, expected)));
            }
        }
        return v;
    }

    /** Сложность конкретного варианта: CUSTOM-уровни / равномерный рост при ASCENDING / иначе целевая. */
    private int resolveDifficulty(CreateProjectRequest.CriteriaData criteria,
                                  CreateProjectRequest.ParamsData params, int variantIndex) {
        List<Integer> levels = params.difficultyLevels();
        if ("CUSTOM".equals(params.difficultyGradation()) && levels != null && levels.size() >= variantIndex) {
            return clamp(levels.get(variantIndex - 1));
        }
        if ("ASCENDING".equals(params.difficultyGradation())) {
            int total = Math.max(1, params.variantsCount());
            int step = total <= 1 ? 0 : (int) Math.round((variantIndex - 1) * 4.0 / (total - 1));
            return clamp(1 + step);
        }
        return clamp(criteria.difficulty());
    }

    private int clamp(int d) {
        return Math.min(5, Math.max(1, d));
    }

    private GeneratedModels.GeneratedVariant withIndex(GeneratedModels.GeneratedVariant v, int index) {
        return new GeneratedModels.GeneratedVariant(index, v.difficulty(), v.totalEstimatedMinutes(), v.tasks());
    }

    /**
     * Разбивает объединённые задания: GigaChat иногда кладёт M заданий в поле text одного объекта.
     * Ищет нумерацию "1. Текст... 2. Текст..." и разбивает на отдельные GeneratedTask.
     * Применяется только если tasks.size() < expectedCount и исходный текст содержит нумерацию.
     */
    private List<GeneratedModels.GeneratedTask> splitMergedTasks(
            List<GeneratedModels.GeneratedTask> tasks, int expectedCount) {
        if (tasks == null || tasks.isEmpty() || tasks.size() >= expectedCount) return tasks;

        List<GeneratedModels.GeneratedTask> result = new ArrayList<>();
        for (GeneratedModels.GeneratedTask task : tasks) {
            // Не разбиваем TEST-задания — там нумерация варантов ответа А)/Б)/В)/Г)
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

        // Переиндексируем
        List<GeneratedModels.GeneratedTask> reindexed = new ArrayList<>();
        for (int i = 0; i < result.size(); i++) {
            GeneratedModels.GeneratedTask t = result.get(i);
            reindexed.add(new GeneratedModels.GeneratedTask(
                    i + 1, t.text(), t.answer(), t.expectedAnswer(), t.answerHint(),
                    t.steps(), t.estimatedMinutes(), t.difficulty(), t.taskType(), t.figure()));
        }
        return reindexed;
    }

    /**
     * Разбивает текст вида "1. Задание А\n2. Задание Б\n3. Задание В" на отдельные части.
     * Возвращает список из одного элемента, если нумерация не обнаружена.
     */
    private List<String> extractNumberedParts(String text) {
        if (text == null || text.isBlank()) return text != null ? List.of(text) : List.of();

        String[] lines = text.split("\n");
        List<String> parts = new ArrayList<>();
        StringBuilder buf = new StringBuilder();

        for (String line : lines) {
            String stripped = line.stripLeading();
            // Строка начинает новое задание: цифра + точка/скобка + пробел + текст от 15 символов
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

        // Убираем ведущую нумерацию из каждой части
        return parts.stream()
                .map(p -> p.replaceFirst("^\\d+[.)]\\s+", "").trim())
                .filter(p -> p.length() >= 10)
                .toList();
    }
}
