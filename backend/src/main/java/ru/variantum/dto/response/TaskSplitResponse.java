package ru.variantum.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Результат разбиения «сырого» текста (одного или нескольких файлов + ручной ввод) на отдельные задания.
 * Тестовые варианты ответа (А)/Б)/В)/Г) заглавными) остаются внутри text своего задания.
 * Подпункты (а)/б)/в) строчными) разбиваются на отдельные задания через SubTaskSplitter.
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
