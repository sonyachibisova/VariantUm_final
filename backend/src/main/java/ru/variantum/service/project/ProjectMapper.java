package ru.variantum.service.project;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import ru.variantum.domain.Task;
import ru.variantum.domain.Variant;
import ru.variantum.service.llm.GeneratedModels;

import java.util.List;
import java.util.Map;

/**
 * Конвертация сущностей вариантов/заданий в единую LLM-модель {@link GeneratedModels}
 * и обратно в JSON — для подачи в промпты AI-правки и рекомендаций.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProjectMapper {

    private final ObjectMapper objectMapper;

    public GeneratedModels.GeneratedVariant toGenerated(Variant v, List<Task> tasks) {
        List<GeneratedModels.GeneratedTask> gtasks = tasks.stream()
                .map(t -> {
                    // Читаем figure из metadata_json для включения в AI-промпты правки
                    Map<String, Object> figure = null;
                    if (t.getMetadataJson() != null && !t.getMetadataJson().isNull()) {
                        try {
                            figure = objectMapper.convertValue(t.getMetadataJson(),
                                    new TypeReference<Map<String, Object>>() {});
                        } catch (Exception e) {
                            log.debug("figure ignored: {}", e.getMessage());
                        }
                    }
                    return new GeneratedModels.GeneratedTask(
                            t.getIndexInVariant(),
                            t.getText(),
                            t.getAnswer(),
                            null,
                            null,
                            t.getSteps(),
                            t.getEstimatedMinutes(),
                            t.getDifficulty(),
                            t.getTaskType() != null ? t.getTaskType().name() : null,
                            figure
                    );
                })
                .toList();
        return new GeneratedModels.GeneratedVariant(
                v.getIndexInProject(),
                v.getDifficulty(),
                v.getTotalEstimatedMinutes(),
                gtasks
        );
    }

    public String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Не удалось сериализовать в JSON", e);
        }
    }
}
