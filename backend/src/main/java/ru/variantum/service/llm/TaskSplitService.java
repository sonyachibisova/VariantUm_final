package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.dto.response.TaskSplitResponse;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Разбивает «сырой» текст (склейку из нескольких файлов и/или ручного ввода) на отдельные задания
 * силами GigaChat. LLM, в отличие от регулярок, отличает варианты ответа теста (1) 2) 3) 4))
 * и подпункты от самостоятельных заданий, понимает разную нумерацию и отделяет ответы.
 *
 * При сбое LLM возвращает текст одним заданием — редактор остаётся работоспособным,
 * а у пользователя есть ручная кнопка «разбить».
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TaskSplitService {

    private static final int MIN_LEN = 10;
    private static final double TEMPERATURE_SPLIT = 0.0;
    private static final double TEMPERATURE_RETRY  = 0.3;

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final ru.variantum.config.AppProperties appProperties;

    public TaskSplitResponse split(String rawText) {
        if (rawText == null || rawText.trim().length() < MIN_LEN) {
            return new TaskSplitResponse(List.of());
        }
        String trimmed = rawText.trim();
        log.info("Разбиение текста на задания ({} символов)", trimmed.length());

        int expected = estimateTaskCount(trimmed);
        log.info("Предполагаемое число заданий по маркерам: ~{}", expected);

        try {
            List<TaskSplitResponse.SplitTask> tasks = callLlmSplit(trimmed, TEMPERATURE_SPLIT);
            if (tasks.isEmpty()) {
                log.warn("LLM-разбиение вернуло пустой список — отдаём текст одним заданием");
                return withSubTaskSplit(single(trimmed));
            }
            // Проверяем, не было ли чрезмерного дробления.
            // Условия ретрая не зависят от estimateTaskCount (тот часто возвращает 0):
            //   1. Число задач > 2× от ожидаемого И > 3 (если нумерация найдена)
            //   2. Среди задач есть заведомо неверно выделенные: очень короткие, подпункты, маркеры рисунков
            boolean tooMany = expected > 0 && tasks.size() > Math.max(3, expected * 2);
            boolean suspicious = isOverSplitResult(tasks);
            if (tooMany || suspicious) {
                log.warn("Результат разбиения подозрительный ({} заданий, expected={}, suspicious={}) — ретрай с Lite/temp={}",
                        tasks.size(), expected, suspicious, TEMPERATURE_RETRY);
                try {
                    // Ретрай с Lite-моделью и чуть выше температурой — другой режим, другой результат
                    List<TaskSplitResponse.SplitTask> retry = callLlmSplit(trimmed, TEMPERATURE_RETRY);
                    if (!retry.isEmpty() && retry.size() <= tasks.size() && !isOverSplitResult(retry)) {
                        tasks = retry;
                        log.info("Ретрай успешен: {} заданий", tasks.size());
                    } else if (!retry.isEmpty() && retry.size() < tasks.size()) {
                        tasks = retry;
                        log.info("Ретрай дал меньше заданий: {}", tasks.size());
                    }
                } catch (Exception retryEx) {
                    log.warn("Ретрай разбиения не удался: {}", retryEx.getMessage());
                }
            }
            log.info("Текст разбит на {} заданий", tasks.size());
            return withSubTaskSplit(new TaskSplitResponse(tasks));
        } catch (Exception e) {
            log.warn("LLM-разбиение не удалось ({}), пробуем регекс-разбиение", e.getMessage());
            return withSubTaskSplit(regexSplit(trimmed));
        }
    }

    private List<TaskSplitResponse.SplitTask> callLlmSplit(String trimmed, double temperature) {
        String prompt = promptBuilder.build(PromptBuilder.SPLIT_TASKS, Map.of("raw_text", trimmed));
        // Первый вызов (temp=0) — Pro-модель с фолбэком.
        // Ретрай (temp>0) — явно Lite: другое поведение → другой результат.
        String raw = temperature > 0
                ? gigaChatClient.completion(prompt, temperature, appProperties.gigachat().modelLite()).block()
                : gigaChatClient.completion(prompt, temperature).block();
        TaskSplitResponse parsed = llmJsonUtil.parse(raw, TaskSplitResponse.class);
        return parsed.tasks() == null ? List.of()
                : parsed.tasks().stream()
                    .filter(t -> t != null && t.text() != null && !t.text().isBlank())
                    .map(t -> new TaskSplitResponse.SplitTask(
                            normalizeTaskText(t.text()),
                            t.answer() != null && !t.answer().isBlank() ? normalizeTaskText(t.answer()) : null))
                    .toList();
    }

    /**
     * Проверяет, похоже ли разбиение на чрезмерное дробление.
     * Признаки: очень короткие задания, подпункты (а), б)) как отдельные задания,
     * маркеры рисунков/графиков как отдельные задания.
     */
    private boolean isOverSplitResult(List<TaskSplitResponse.SplitTask> tasks) {
        if (tasks.size() < 2) return false;
        int suspicious = 0;
        for (var t : tasks) {
            String text = t.text().trim();
            // Маркеры рисунков/графиков НИКОГДА не должны быть отдельным заданием
            if (text.startsWith("[РИСУНОК:") || text.startsWith("[ФУНКЦИЯ:") || text.startsWith("[ИЗОБРАЖЕНИЕ:")) {
                return true;
            }
            // Подпункт (а) одно условие — очень короткий, начинается с а)/б)/в)/a)/b)/c)
            if (text.length() < 80 && java.util.regex.Pattern.matches("(?s)^[а-яёa-d][).]\\s.*", text)) {
                suspicious++;
            }
            // Просто очень короткое "задание" (< 30 символов) — почти наверняка кусок
            if (text.length() < 30) {
                suspicious++;
            }
        }
        // Если подозрительных фрагментов больше трети от всех — перебор
        return suspicious > 0 && suspicious >= tasks.size() / 3 + 1;
    }

    /**
     * Нормализует текст задания: конвертирует литеральные \n → реальные переносы,
     * убирает markdown-форматирование (**, ##), которое добавляет GigaChat Lite.
     */
    private static String normalizeTaskText(String text) {
        if (text == null) return null;
        text = TextCleanupService.stripMarkdown(
                text.replace("\\n", "\n").replace("\\t", "\t"));
        return text == null ? "" : text;
    }

    /**
     * Грубая оценка числа заданий по числовым маркерам в тексте.
     * Ищет строки вида «1.», «2.», «№3», «Задание 4» — не заходя в LLM.
     * Используется только для sanity-check результата LLM, не для реального разбиения.
     */
    private int estimateTaskCount(String text) {
        // Считаем только маркеры, которые однозначно являются началом задания,
        // а не вариантами ответа теста.
        // «1) Атом» — это вариант ответа, «1. Задача» — начало задания.
        // Поэтому исключаем «N)» и «N:», оставляем только «N. » и словесные маркеры.
        var numbered = java.util.regex.Pattern.compile(
                "(?m)^\\s*(?:(?:Задание|Задача|Упражнение)\\s+\\d+|[№#]\\s*\\d+|\\d+\\.\\s)",
                java.util.regex.Pattern.UNICODE_CHARACTER_CLASS);
        long count = numbered.matcher(text).results().count();
        // Если явных маркеров нет — не можем оценить, возвращаем 0 (sanity-check отключается)
        return (int) count;
    }

    /**
     * Резервное разбиение без LLM. Стратегии по убыванию надёжности:
     *
     * 1. Явные слова-маркеры («Задание N», «Задача N», «Упражнение N») — самые надёжные,
     *    никогда не используются внутри задания для вариантов ответа.
     * 2. Числовые маркеры «N. текст» в начале строки только если:
     *    а) идут строго последовательно (1, 2, 3...) — значит это нумерация заданий, не вариантов;
     *    б) каждый чанк достаточно длинный (≥60 символов) — варианты ответа короткие.
     * 3. Абзацы через двойной перенос строки — безопасный минимум.
     * 4. Всё одним заданием — крайний резерв.
     */
    private TaskSplitResponse regexSplit(String text) {
        // Убираем шапку (Вариант 1, К-10 В-2, Тема: ...)
        String cleaned = stripDocHeader(text);

        // --- Стратегия 1: явные слова-маркеры ---
        // «Задание 1», «Задача 2.», «Упражнение 3:» — точно начало нового задания
        var wordMarker = java.util.regex.Pattern.compile(
            "(?m)^(?:Задание|Задача|Упражнение)\\s+\\d+[.):\\s]",
            java.util.regex.Pattern.UNICODE_CHARACTER_CLASS
        );
        List<TaskSplitResponse.SplitTask> result = splitByPattern(cleaned, wordMarker, 30);
        if (result.size() >= 2) {
            log.info("Регекс (слова-маркеры) разбил текст на {} заданий", result.size());
            return new TaskSplitResponse(result);
        }

        // --- Стратегия 2: строгая числовая нумерация «N. текст» ---
        // Только если номера идут строго с 1 и последовательно, и каждый чанк ≥ 60 символов
        result = splitBySequentialNumbers(cleaned);
        if (result.size() >= 2) {
            log.info("Регекс (последовательная нумерация) разбил текст на {} заданий", result.size());
            return new TaskSplitResponse(result);
        }

        // --- Стратегия 3: двойные переносы строки ---
        result = splitByParagraphs(cleaned);
        if (result.size() >= 2) {
            log.info("Регекс (абзацы) разбил текст на {} заданий", result.size());
            return new TaskSplitResponse(result);
        }

        log.info("Регекс не смог разбить — отдаём текст одним заданием");
        return single(cleaned.isBlank() ? text : cleaned);
    }

    /** Убирает строки-шапки в начале (Вариант 1, К-10 В-2, Тема: ..., 9 класс). */
    private String stripDocHeader(String text) {
        String[] lines = text.split("\n", -1);
        int start = 0;
        var headerLine = java.util.regex.Pattern.compile(
            "^(?:[КкKk][-–—]\\d+\\s*[Вв][-–—]\\d+" +
            "|(?:Самостоятельная|Проверочная|Диагностическая|Итоговая|Контрольная|Вступительная)\\s+(?:работа|контрольная)?[\\s.:]*[\\d\\w]*" +
            "|(?:Вариант|Контрольная|Работа|Класс|Дата|ФИО|Тема|Предмет|Учитель|Ученик)[\\s.:]*[\\d\\w]*" +
            "|\\d{1,2}\\s*класс|[A-ЯЁ]{1,5}[-–—]\\d+|[\\s—–=_-]{3,})$",
            java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CHARACTER_CLASS
        );
        while (start < Math.min(lines.length, 8)) {
            String trimmed = lines[start].trim();
            if (trimmed.isEmpty() || headerLine.matcher(trimmed).matches()) {
                start++;
            } else {
                break;
            }
        }
        return String.join("\n", Arrays.copyOfRange(lines, start, lines.length)).trim();
    }

    /** Разбивает по паттерну; отфильтровывает чанки короче minLen символов. */
    private List<TaskSplitResponse.SplitTask> splitByPattern(
            String text, java.util.regex.Pattern pattern, int minLen) {
        var m = pattern.matcher(text);
        List<Integer> starts = new ArrayList<>();
        while (m.find()) starts.add(m.start());
        if (starts.size() < 2) return Collections.emptyList();

        List<TaskSplitResponse.SplitTask> tasks = new ArrayList<>();
        for (int i = 0; i < starts.size(); i++) {
            int from = starts.get(i);
            int to = (i + 1 < starts.size()) ? starts.get(i + 1) : text.length();
            String chunk = text.substring(from, to).trim();
            if (chunk.length() >= minLen) {
                tasks.add(new TaskSplitResponse.SplitTask(chunk, null));
            }
        }
        return tasks;
    }

    /**
     * Ищет строки вида «1. ...», «2. ...» строго последовательно с 1.
     * Каждый результирующий чанк должен быть ≥ 60 символов — иначе это варианты ответа.
     */
    private List<TaskSplitResponse.SplitTask> splitBySequentialNumbers(String text) {
        // Паттерн: начало строки, число, точка, пробел — не «1.5», не «а)»
        var numDot = java.util.regex.Pattern.compile(
            "(?m)^(\\d+)\\. (?=\\S)", java.util.regex.Pattern.UNICODE_CHARACTER_CLASS
        );
        var m = numDot.matcher(text);
        List<int[]> hits = new ArrayList<>(); // [start, number]
        while (m.find()) {
            hits.add(new int[]{m.start(), Integer.parseInt(m.group(1))});
        }
        if (hits.size() < 2) return Collections.emptyList();

        // Проверяем строгую последовательность 1,2,3... или хотя бы с шагом 1
        int first = hits.get(0)[1];
        if (first > 2) return Collections.emptyList(); // начинается не с 1 или 2 — подозрительно
        for (int i = 1; i < hits.size(); i++) {
            if (hits.get(i)[1] != hits.get(i - 1)[1] + 1) {
                return Collections.emptyList(); // нарушена последовательность
            }
        }

        // Нарезаем чанки и проверяем минимальную длину
        List<TaskSplitResponse.SplitTask> tasks = new ArrayList<>();
        for (int i = 0; i < hits.size(); i++) {
            int from = hits.get(i)[0];
            int to = (i + 1 < hits.size()) ? hits.get(i + 1)[0] : text.length();
            String chunk = text.substring(from, to).trim();
            if (chunk.length() < 60) return Collections.emptyList(); // слишком короткий — это варианты ответа
            tasks.add(new TaskSplitResponse.SplitTask(chunk, null));
        }
        return tasks;
    }

    /** Разбивает по двойному переносу строки; игнорирует абзацы короче 40 символов. */
    private List<TaskSplitResponse.SplitTask> splitByParagraphs(String text) {
        String[] paragraphs = text.split("\\n\\s*\\n");
        List<TaskSplitResponse.SplitTask> tasks = new ArrayList<>();
        for (String p : paragraphs) {
            String trimmed = p.trim();
            if (trimmed.length() >= 40) {
                tasks.add(new TaskSplitResponse.SplitTask(trimmed, null));
            }
        }
        return tasks;
    }

    private TaskSplitResponse single(String text) {
        return new TaskSplitResponse(List.of(new TaskSplitResponse.SplitTask(text, null)));
    }

    /** Применяет разбиение подпунктов а)/б)/в) к готовому результату. */
    private static TaskSplitResponse withSubTaskSplit(TaskSplitResponse r) {
        if (r.tasks() == null || r.tasks().isEmpty()) return r;
        return new TaskSplitResponse(SubTaskSplitter.splitSplitTasks(r.tasks()));
    }
}
