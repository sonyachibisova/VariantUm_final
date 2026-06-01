package ru.variantum.dto.response;

/**
 * Дневной лимит обращений к нейросети (в процентах) и расценки действий —
 * чтобы фронт мог показывать остаток и предварительную стоимость каждого действия.
 */
public record LimitsResponse(
        double percentRemaining,
        double percentUsed,
        double limit,
        String resetAt,
        Costs costs
) {
    /** Расценки в процентах дневного лимита (зеркалят LlmCostService для подсказок на фронте). */
    public record Costs(
            double parsePerFile,
            double taskBase,
            double taskFormula,
            double taskGraph,
            double taskAvg
    ) {}
}
