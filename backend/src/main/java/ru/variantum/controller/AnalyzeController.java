package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import ru.variantum.dto.response.AnalysisResponse;
import ru.variantum.dto.response.TaskSplitResponse;
import ru.variantum.service.llm.AnalyzeService;
import ru.variantum.service.llm.TaskSplitService;

@RestController
@RequestMapping("/analyze")
@RequiredArgsConstructor
@Tag(name = "Analyze")
public class AnalyzeController {

    private final AnalyzeService analyzeService;
    private final TaskSplitService taskSplitService;

    @PostMapping("/task")
    public AnalysisResponse analyzeTask(@RequestBody AnalyzeRequest req) {
        return analyzeService.analyze(req.text(), req.hintSubject());
    }

    /**
     * Разбивает «сырой» текст (склейку из файлов + ручной ввод) на отдельные задания.
     * Варианты ответа теста и подпункты остаются внутри своего задания, ответы отделяются.
     */
    @PostMapping("/split")
    public TaskSplitResponse splitTasks(@RequestBody SplitRequest req) {
        return taskSplitService.split(req.text());
    }

    public record AnalyzeRequest(String text, String hintSubject) {}

    public record SplitRequest(String text) {}
}
