package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;
import ru.variantum.exception.LlmFailureException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Промпт 7 — правка всего комплекта одной командой.
 * Обрабатывает каждый вариант ОТДЕЛЬНЫМ ЗАПРОСОМ к GigaChat (как GenerateFromCriteriaService),
 * чтобы не превышать лимит токенов при больших комплектах и избежать таймаутов.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AiEditAllService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    /**
     * @param variantJsonList JSON каждого варианта по отдельности
     */
    public GeneratedModels.GeneratedSet edit(List<String> variantJsonList,
                                             String userPrompt,
                                             String subject,
                                             Integer grade,
                                             String topic,
                                             Integer targetDifficulty,
                                             String gradationMode) {
        List<GeneratedModels.GeneratedVariant> results = new ArrayList<>();

        for (int i = 0; i < variantJsonList.size(); i++) {
            int variantIndex = i + 1;
            String variantJson = variantJsonList.get(i);
            try {
                GeneratedModels.GeneratedVariant edited = editOne(
                        variantJson, variantIndex, userPrompt, subject, grade, topic,
                        targetDifficulty, gradationMode);
                results.add(withIndex(edited, variantIndex));
                log.info("AiEditAll: вариант {}/{} отредактирован", variantIndex, variantJsonList.size());
            } catch (Exception e) {
                log.error("AiEditAll: вариант {}/{} не удалось отредактировать: {}",
                        variantIndex, variantJsonList.size(), e.getMessage());
                // Пропускаем проблемный вариант — он не будет в итоговом списке
            }
        }

        if (results.isEmpty()) {
            throw new LlmFailureException(
                    "GigaChat не смог отредактировать ни один вариант комплекта.", false);
        }
        return new GeneratedModels.GeneratedSet(results, null);
    }

    /** Редактирует один вариант. */
    private GeneratedModels.GeneratedVariant editOne(String variantJson, int variantIndex,
                                                     String userPrompt, String subject, Integer grade,
                                                     String topic, Integer targetDifficulty,
                                                     String gradationMode) {
        // Оборачиваем одиночный вариант в формат {variants:[...]} для промпта
        String projectJson = "{\"variants\":[" + variantJson + "]}";

        Map<String, String> vars = new HashMap<>();
        vars.put("project_json", projectJson);
        vars.put("user_prompt", userPrompt != null ? userPrompt : "");
        vars.put("subject", subject != null ? subject : "");
        vars.put("grade", grade != null ? String.valueOf(grade) : "");
        vars.put("topic", topic != null ? topic : "");
        vars.put("target_difficulty", targetDifficulty != null ? String.valueOf(targetDifficulty) : "");
        vars.put("gradation_mode", gradationMode != null ? gradationMode : "EQUAL");

        String prompt = promptBuilder.build(PromptBuilder.AI_EDIT_ALL, vars);
        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureGenerate())
                .block();

        // Парсим ответ — ожидаем {variants:[{...}]} или просто вариант
        try {
            GeneratedModels.GeneratedSet set = llmJsonUtil.parse(raw, GeneratedModels.GeneratedSet.class);
            if (set.variants() != null && !set.variants().isEmpty()) {
                GeneratedModels.GeneratedVariant v = set.variants().get(0);
                if (v.tasks() != null && !v.tasks().isEmpty()) return v;
            }
        } catch (Exception e) {
            log.debug("AiEditAll one: GeneratedSet parse failed ({}), trying variant", e.getMessage());
        }

        // Fallback: вариант без обёртки
        GeneratedModels.GeneratedVariant v = llmJsonUtil.parse(raw, GeneratedModels.GeneratedVariant.class);
        if (v.tasks() != null && !v.tasks().isEmpty()) return v;

        throw new LlmFailureException(
                "GigaChat вернул пустой ответ для варианта " + variantIndex, false);
    }

    private GeneratedModels.GeneratedVariant withIndex(GeneratedModels.GeneratedVariant v, int index) {
        return new GeneratedModels.GeneratedVariant(index, v.difficulty(), v.totalEstimatedMinutes(), v.tasks());
    }
}
