package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;
import ru.variantum.dto.response.AnalysisResponse;

import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class AnalyzeService {

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final LlmJsonUtil llmJsonUtil;
    private final AppProperties appProperties;

    public AnalysisResponse analyze(String taskText, String hintSubject) {
        log.info("Запуск анализа задания ({} символов)", taskText.length());
        String prompt = promptBuilder.build(PromptBuilder.ANALYZE, Map.of(
                "task_text", taskText,
                "hint_subject", hintSubject != null ? hintSubject : ""
        ));
        String raw = gigaChatClient
                .completion(prompt, appProperties.gigachat().temperatureValidate(),
                        appProperties.gigachat().modelMax())
                .block();
        return llmJsonUtil.parse(raw, AnalysisResponse.class);
    }
}
