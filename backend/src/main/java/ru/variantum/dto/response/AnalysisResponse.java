package ru.variantum.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AnalysisResponse(
        String subject,
        int grade,
        String topic,
        String taskType,
        int difficulty,
        Integer estimatedMinutes,
        Integer stepsCount,
        List<String> invariants,
        List<VariableElement> variableElements
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VariableElement(String type, List<String> examples) {}
}
