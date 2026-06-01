package ru.variantum.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateProjectRequest(
        @NotNull String mode,

        // FROM_CRITERIA
        CriteriaData criteria,

        // FROM_REFERENCE
        String referenceText,
        AnalysisData analysis,

        // common
        ParamsData params
) {
    public record CriteriaData(
            @NotBlank String subject,
            @Min(1) @Max(11) int grade,
            @NotBlank String topic,
            String taskType,
            @Min(1) @Max(20) int tasksPerVariant,
            @Min(5) @Max(180) int targetTimeMinutes,
            @Min(1) @Max(5) int difficulty
    ) {}

    public record AnalysisData(
            String subject,
            int grade,
            String topic,
            String taskType,
            int difficulty
    ) {}

    public record ParamsData(
            @Min(2) @Max(10) int variantsCount,
            List<String> variationTypes,
            List<String> fixedElements,
            String difficultyGradation,
            List<Integer> difficultyLevels,
            String customPrompt
    ) {}
}
