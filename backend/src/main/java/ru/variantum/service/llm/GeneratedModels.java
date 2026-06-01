package ru.variantum.service.llm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * Единая модель сгенерированного/отредактированного комплекта вариантов.
 * Один формат используют генерация по критериям, генерация по эталону и AI-правка комплекта,
 * чтобы их результаты можно было сохранять и пересохранять одним кодом.
 *
 * Структура: комплект → варианты → задания (каждый вариант содержит массив заданий,
 * даже если задание одно). Это позволяет «по эталону» размножать целую контрольную
 * из нескольких заданий, а не только одиночную задачу.
 */
public final class GeneratedModels {

    private GeneratedModels() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeneratedSet(
            List<GeneratedVariant> variants,
            List<String> warnings
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeneratedVariant(
            int index,
            Integer difficulty,
            Integer totalEstimatedMinutes,
            List<GeneratedTask> tasks
    ) {}

    /**
     * Структурированное описание геометрической фигуры или графика.
     * Ключ "type" определяет тип: "triangle", "quadrilateral", "circle",
     * "coordinatePlane", "numberLine". Остальные ключи — параметры фигуры.
     * Поле может быть null, если задание не содержит чертежа.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeneratedTask(
            int index,
            String text,
            String answer,
            String expectedAnswer,
            String answerHint,
            Integer steps,
            Integer estimatedMinutes,
            Integer difficulty,
            String taskType,
            Map<String, Object> figure
    ) {}
}
