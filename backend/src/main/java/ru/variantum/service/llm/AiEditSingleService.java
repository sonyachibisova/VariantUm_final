package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;
import ru.variantum.exception.LlmFailureException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Промпт 6 — точечная правка одного варианта по указанию учителя.
 * На вход подаётся JSON одного варианта (с массивом tasks), на выход — он же, обновлённый.
 *
 * Надёжный парсинг: GigaChat иногда возвращает GeneratedSet ({variants:[...]})
 * вместо GeneratedVariant ({tasks:[...]}). Сервис пробует оба формата.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AiEditSingleService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    /**
     * Перегенерация одного задания: принимает JSON одного задания, возвращает новое задание
     * в той же структуре с другими числами/сюжетом но той же сложностью и типом.
     */
    public GeneratedModels.GeneratedTask regenerateTask(String taskJson,
                                                        String subject,
                                                        Integer grade) {
        Map<String, String> vars = new HashMap<>();
        vars.put("task_json", taskJson);
        vars.put("subject", subject != null ? subject : "");
        vars.put("grade", grade != null ? String.valueOf(grade) : "");

        String prompt = promptBuilder.build(PromptBuilder.REGENERATE_TASK, vars);
        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureGenerate())
                .block();

        return parseSingleTask(raw);
    }

    /**
     * Разбирает ответ GigaChat как одно задание.
     * Стратегии:
     * 1. Прямой парсинг как GeneratedTask.
     * 2. Если не получилось — парсим как GeneratedVariant и берём первое задание.
     */
    private GeneratedModels.GeneratedTask parseSingleTask(String raw) {
        try {
            GeneratedModels.GeneratedTask t = llmJsonUtil.parse(raw, GeneratedModels.GeneratedTask.class);
            if (t.text() != null && !t.text().isBlank()) {
                log.debug("RegenerateTask: разобран как GeneratedTask");
                return t;
            }
        } catch (Exception e) {
            log.warn("RegenerateTask: не удалось разобрать как GeneratedTask ({}), пробуем GeneratedVariant", e.getMessage());
        }

        try {
            GeneratedModels.GeneratedVariant v = llmJsonUtil.parse(raw, GeneratedModels.GeneratedVariant.class);
            if (v.tasks() != null && !v.tasks().isEmpty()) {
                GeneratedModels.GeneratedTask first = v.tasks().get(0);
                if (first.text() != null && !first.text().isBlank()) {
                    log.info("RegenerateTask: GigaChat вернул GeneratedVariant — берём tasks[0]");
                    return first;
                }
            }
        } catch (Exception e) {
            log.warn("RegenerateTask: не удалось разобрать как GeneratedVariant: {}", e.getMessage());
        }

        throw new LlmFailureException("GigaChat вернул задание без текста. Попробуйте ещё раз.", false);
    }

    public GeneratedModels.GeneratedVariant edit(String variantJson,
                                                 String userPrompt,
                                                 String subject,
                                                 Integer grade,
                                                 String topic,
                                                 Integer difficulty,
                                                 Integer stepsCount) {
        Map<String, String> vars = new HashMap<>();
        vars.put("variant_json", variantJson);
        vars.put("user_prompt", userPrompt != null ? userPrompt : "");
        vars.put("subject", subject != null ? subject : "");
        vars.put("grade", grade != null ? String.valueOf(grade) : "");
        vars.put("topic", topic != null ? topic : "");
        vars.put("difficulty", difficulty != null ? String.valueOf(difficulty) : "");
        vars.put("steps_count", stepsCount != null ? String.valueOf(stepsCount) : "");

        String prompt = promptBuilder.build(PromptBuilder.AI_EDIT_SINGLE, vars);
        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureGenerate())
                .block();

        return parseVariant(raw);
    }

    /**
     * Пробует разобрать ответ GigaChat как один вариант.
     * Стратегия:
     * 1. Прямой парсинг как GeneratedVariant ({index, difficulty, tasks:[...]}).
     * 2. Если tasks оказался пустым/null — парсим как GeneratedSet и берём первый вариант.
     *    (GigaChat-Pro иногда оборачивает ответ в {variants:[...]})
     */
    private GeneratedModels.GeneratedVariant parseVariant(String raw) {
        // Попытка 1: прямой формат
        try {
            GeneratedModels.GeneratedVariant v = llmJsonUtil.parse(raw, GeneratedModels.GeneratedVariant.class);
            if (v.tasks() != null && !v.tasks().isEmpty()) {
                log.debug("AiEditSingle: разобран как GeneratedVariant, {} заданий", v.tasks().size());
                return v;
            }
            log.warn("AiEditSingle: GeneratedVariant.tasks пуст — пробуем GeneratedSet");
        } catch (Exception e) {
            log.warn("AiEditSingle: не удалось разобрать как GeneratedVariant ({}), пробуем GeneratedSet", e.getMessage());
        }

        // Попытка 2: GigaChat завернул ответ в {"variants":[...]}
        try {
            GeneratedModels.GeneratedSet set = llmJsonUtil.parse(raw, GeneratedModels.GeneratedSet.class);
            List<GeneratedModels.GeneratedVariant> variants = set.variants();
            if (variants != null && !variants.isEmpty()) {
                GeneratedModels.GeneratedVariant first = variants.get(0);
                if (first.tasks() != null && !first.tasks().isEmpty()) {
                    log.info("AiEditSingle: GigaChat вернул GeneratedSet — берём variants[0], {} заданий",
                            first.tasks().size());
                    return first;
                }
            }
        } catch (Exception e) {
            log.warn("AiEditSingle: не удалось разобрать как GeneratedSet: {}", e.getMessage());
        }

        throw new LlmFailureException(
                "GigaChat вернул ответ без заданий. Попробуйте переформулировать запрос.", false);
    }
}
