package ru.variantum.service.llm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;

import java.util.List;
import java.util.Map;

/**
 * Промпт 8 — рекомендатор. Анализирует готовый комплект и предлагает улучшения.
 * Не критичен для генерации: при любой ошибке возвращает пустой список,
 * чтобы не «ронять» сохранение проекта.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RecommenderService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    public List<RecommendationItem> recommend(String projectJson) {
        try {
            String prompt = promptBuilder.build(PromptBuilder.RECOMMEND, Map.of("project_json", projectJson));
            // Рекомендатор — проверка по правилам, достаточно Lite
            String raw = gigaChatClient
                    .completion(prompt, appProperties.gigachat().temperatureValidate(),
                            appProperties.gigachat().modelLite())
                    .block();
            RecommendationResult result = llmJsonUtil.parse(raw, RecommendationResult.class);
            return result.recommendations() != null ? result.recommendations() : List.of();
        } catch (Exception e) {
            log.warn("Рекомендации не получены (некритично): {}", e.getMessage());
            return List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RecommendationResult(List<RecommendationItem> recommendations) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RecommendationItem(
            String type,
            Integer variantIndex,
            String severity,
            String message
    ) {}
}
