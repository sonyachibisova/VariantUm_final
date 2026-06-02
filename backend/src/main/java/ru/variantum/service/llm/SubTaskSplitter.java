package ru.variantum.service.llm;

import ru.variantum.dto.response.TaskSplitResponse;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Разбивает задания с подпунктами (строчные а), б), в)) на отдельные задания.
 * Тестовые задания с вариантами ответа (заглавные А), Б), В), Г)) не затрагиваются.
 */
public final class SubTaskSplitter {

    private SubTaskSplitter() {}

    // Строчные кириллические а-д в начале строки (после trim)
    private static final Pattern SUB_POINT_RE = Pattern.compile(
            "^[а-д]\\)\\s*.+",
            Pattern.UNICODE_CHARACTER_CLASS | Pattern.DOTALL
    );

    /**
     * Разбивает список сгенерированных задач: задачи с подпунктами а)/б) → несколько задач.
     * Возвращает новый список с пересчитанными индексами (1, 2, 3...).
     */
    public static List<GeneratedModels.GeneratedTask> splitGeneratedTasks(
            List<GeneratedModels.GeneratedTask> tasks) {
        if (tasks == null) return List.of();

        List<GeneratedModels.GeneratedTask> expanded = new ArrayList<>();
        for (GeneratedModels.GeneratedTask task : tasks) {
            expanded.addAll(splitGenerated(task));
        }

        List<GeneratedModels.GeneratedTask> result = new ArrayList<>(expanded.size());
        for (int i = 0; i < expanded.size(); i++) {
            GeneratedModels.GeneratedTask t = expanded.get(i);
            result.add(new GeneratedModels.GeneratedTask(
                    i + 1, t.text(), t.answer(), t.expectedAnswer(), t.answerHint(),
                    t.steps(), t.estimatedMinutes(), t.difficulty(), t.taskType(), t.figure()
            ));
        }
        return result;
    }

    /**
     * Разбивает список задач от TaskSplitService.
     */
    public static List<TaskSplitResponse.SplitTask> splitSplitTasks(
            List<TaskSplitResponse.SplitTask> tasks) {
        if (tasks == null) return List.of();

        List<TaskSplitResponse.SplitTask> result = new ArrayList<>();
        for (TaskSplitResponse.SplitTask task : tasks) {
            List<String> parts = detectAndSplit(task.text());
            if (parts.size() <= 1) {
                result.add(task);
            } else {
                for (String part : parts) {
                    // answer одинаков для всех подпунктов (полный ответ не разбиваем)
                    result.add(new TaskSplitResponse.SplitTask(part, task.answer()));
                }
            }
        }
        return result;
    }

    // ── Внутренние методы ─────────────────────────────────────────────────────

    private static List<GeneratedModels.GeneratedTask> splitGenerated(
            GeneratedModels.GeneratedTask task) {
        if (task.text() == null) return List.of(task);
        if ("TEST".equalsIgnoreCase(task.taskType())) return List.of(task);

        List<String> parts = detectAndSplit(task.text());
        if (parts.size() <= 1) return List.of(task);

        String[] expectedAnswers = trySplitAnswer(task.expectedAnswer(), parts.size());
        Integer minsEach = task.estimatedMinutes() != null
                ? Math.max(1, task.estimatedMinutes() / parts.size()) : null;

        List<GeneratedModels.GeneratedTask> result = new ArrayList<>(parts.size());
        for (int i = 0; i < parts.size(); i++) {
            result.add(new GeneratedModels.GeneratedTask(
                    task.index(),   // пересчитается в splitGeneratedTasks
                    parts.get(i),
                    task.answer(),  // полный ответ одинаков для всех подпунктов
                    expectedAnswers != null ? expectedAnswers[i] : null,
                    task.answerHint(),
                    task.steps(),
                    minsEach,
                    task.difficulty(),
                    task.taskType(),
                    task.figure()
            ));
        }
        return result;
    }

    /**
     * Если в тексте есть 2+ подпункта а)/б)/в) — возвращает список текстов (по одному на подпункт).
     * Иначе — список из одного исходного текста.
     */
    static List<String> detectAndSplit(String text) {
        if (text == null || text.isBlank()) return List.of(text == null ? "" : text);

        String[] lines = text.split("\n", -1);
        List<Integer> spIdx = new ArrayList<>();

        for (int i = 0; i < lines.length; i++) {
            if (SUB_POINT_RE.matcher(lines[i].trim()).matches()) {
                spIdx.add(i);
            }
        }

        if (spIdx.size() < 2) return List.of(text);

        // Вводная часть — строки до первого подпункта
        String intro = String.join("\n", Arrays.copyOfRange(lines, 0, spIdx.get(0))).trim();

        List<String> parts = new ArrayList<>(spIdx.size());
        for (int i = 0; i < spIdx.size(); i++) {
            int from = spIdx.get(i);
            int to = (i + 1 < spIdx.size()) ? spIdx.get(i + 1) : lines.length;
            String subPart = String.join("\n", Arrays.copyOfRange(lines, from, to)).trim();
            parts.add(intro.isEmpty() ? subPart : intro + "\n" + subPart);
        }
        return parts;
    }

    /** Разбивает "12; 3.5" на ["12", "3.5"]. Возвращает null если количество не совпадает. */
    private static String[] trySplitAnswer(String expected, int count) {
        if (expected == null || expected.isBlank()) return null;
        String[] parts = expected.split("\\s*;\\s*");
        return parts.length == count ? parts : null;
    }
}
