package ru.variantum.service.ratelimit;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import ru.variantum.service.llm.GeneratedModels;

import java.util.List;

/**
 * Расчёт стоимости обращений к нейросети в процентах дневного лимита (100%/день).
 *
 * Модель стоимости (по решению продукта):
 *  - парсинг файла — фиксированно {@link #PARSE_PER_FILE}% за файл;
 *  - одно задание — от {@link #TASK_BASE}% до {@link #TASK_GRAPH}% в зависимости от содержимого:
 *      базовое — текст; дороже — есть формулы (LaTeX); максимум — есть график/чертёж;
 *  - генерация комплекта — сумма стоимостей всех сгенерированных заданий;
 *  - правка (одного варианта / добавление / перегенерация) — сумма стоимостей заданий варианта;
 *  - правка всего комплекта — сумма стоимостей заданий всех вариантов.
 *
 * Оценка ДО действия (для подсказки пользователю) использует средний вес {@link #TASK_AVG}%,
 * потому что до генерации неизвестно, будут ли в заданиях формулы и графики.
 */
@Service
public class LlmCostService {

    /** Полный дневной лимит. */
    public static final double DAILY_LIMIT = 100.0;

    /** Стоимость парсинга одного файла. */
    public static final double PARSE_PER_FILE = 2.0;

    /** Базовая стоимость задания (только текст). */
    public static final double TASK_BASE = 0.2;
    /** Стоимость задания с формулами (LaTeX). */
    public static final double TASK_FORMULA = 0.35;
    /** Стоимость задания с графиком/чертежом. */
    public static final double TASK_GRAPH = 0.5;
    /** Средний вес задания — для предварительной оценки до генерации. */
    public static final double TASK_AVG = 0.35;

    /** Стоимость одного задания по его тексту и наличию фигуры/графика. */
    public double taskCost(String text, boolean hasFigure) {
        String t = text == null ? "" : text;
        boolean hasGraph = hasFigure
                || t.contains("[ФУНКЦИЯ")
                || t.contains("[ГРАФИК") || t.contains("[График");
        if (hasGraph) return TASK_GRAPH;
        boolean hasFormula = t.contains("$");
        if (hasFormula) return TASK_FORMULA;
        return TASK_BASE;
    }

    /** Стоимость одного задания из persisted-сущности (JsonNode фигуры из metadata_json). */
    public double taskCost(String text, JsonNode figureJson) {
        boolean hasFigure = figureJson != null && !figureJson.isNull() && !figureJson.isEmpty();
        return taskCost(text, hasFigure);
    }

    /** Стоимость одного сгенерированного варианта (сумма по заданиям). */
    public double variantCost(GeneratedModels.GeneratedVariant gv) {
        if (gv == null || gv.tasks() == null) return 0;
        return gv.tasks().stream()
                .mapToDouble(gt -> taskCost(gt.text(), gt.figure() != null && !gt.figure().isEmpty()))
                .sum();
    }

    /** Стоимость комплекта (сумма по всем вариантам и заданиям). */
    public double setCost(GeneratedModels.GeneratedSet set) {
        if (set == null || set.variants() == null) return 0;
        return set.variants().stream().mapToDouble(this::variantCost).sum();
    }

    /** Стоимость набора persisted-заданий (для правок, когда есть Task-сущности). */
    public double tasksCost(List<TaskCostView> tasks) {
        if (tasks == null) return 0;
        return tasks.stream().mapToDouble(t -> taskCost(t.text(), t.figureJson())).sum();
    }

    /** Предварительная оценка стоимости генерации/правки по числу вариантов и заданий. */
    public double estimate(int variantsCount, int tasksPerVariant) {
        return Math.max(1, variantsCount) * Math.max(1, tasksPerVariant) * TASK_AVG;
    }

    /** Лёгкая проекция задания для расчёта стоимости (текст + JSON фигуры). */
    public record TaskCostView(String text, JsonNode figureJson) {}
}
