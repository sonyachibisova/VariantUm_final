package ru.variantum.service.project;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Главный координатор генерации комплекта вариантов.
 *
 * Поток (Режим A — FROM_REFERENCE):
 *   1. analyze(referenceText) → analysis
 *   2. generateFromReference(analysis, params) → variants
 *   3. validate(variants, target) → если shouldRegenerate not empty, перегенерируем эти варианты
 *   4. estimateTime(variants) → totalEstimatedMinutes
 *   5. recommend(variants) → recommendations
 *   6. сохранить Project + Variants + Tasks + Recommendations + ProjectVersion("GENERATED")
 *   7. слать SSE: progress → variant_ready (×N) → complete
 *
 * Поток (Режим B — FROM_CRITERIA): шаги 1 пропускается, остальное идентично.
 *
 * TODO (Sonnet): реализовать. Зависимости — все *Service из service/llm/*.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class GenerationOrchestrator {

    public UUID startGeneration(UUID userId /*, CreateProjectRequest req */) {
        throw new UnsupportedOperationException("TODO: реализовать в Sonnet");
    }
}
