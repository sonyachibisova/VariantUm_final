package ru.variantum.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Результат разбиения «сырого» текста (одного или нескольких файлов + ручной ввод)
 * на отдельные задания. Варианты ответа теста и подпункты остаются внутри text своего задания.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskSplitResponse(
        List<SplitTask> tasks
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SplitTask(
            String text,
            String answer
    ) {}
}
