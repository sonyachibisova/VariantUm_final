package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.variantum.dto.response.LimitsResponse;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.ratelimit.LlmCostService;
import ru.variantum.service.ratelimit.RateLimitService;

@RestController
@RequestMapping("/limits")
@RequiredArgsConstructor
@Tag(name = "Limits")
public class LimitsController {

    private final RateLimitService rateLimitService;

    @GetMapping("/me")
    public LimitsResponse getMyLimits() {
        RateLimitService.LimitsSnapshot snap = rateLimitService.snapshot(CurrentUser.requireId());
        return new LimitsResponse(
                snap.percentRemaining(),
                snap.percentUsed(),
                snap.limit(),
                snap.resetAt(),
                new LimitsResponse.Costs(
                        LlmCostService.PARSE_PER_FILE,
                        LlmCostService.TASK_BASE,
                        LlmCostService.TASK_FORMULA,
                        LlmCostService.TASK_GRAPH,
                        LlmCostService.TASK_AVG
                )
        );
    }
}
