package ru.variantum.dto.response;

import java.util.Map;

/**
 * DTO задания. Поле {@code figure} содержит структурированные данные геометрической фигуры
 * или графика функции (если задание такой чертёж содержит) — для SVG-рендера на фронте.
 * Поддерживаемые типы (ключ "type"): triangle, quadrilateral, circle, coordinatePlane, numberLine.
 */
public record TaskResponse(
        String taskId,
        String text,
        String answer,
        Integer steps,
        Integer estimatedMinutes,
        Integer difficulty,
        String taskType,
        Map<String, Object> figure,
        /** URL или base64 data-URL прикреплённого изображения (null = нет фото). */
        String photoUrl
) {}
