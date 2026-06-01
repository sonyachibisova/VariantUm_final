package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.variantum.dto.request.AiEditRequest;
import ru.variantum.dto.request.UpdateVariantRequest;
import ru.variantum.dto.request.VariantActionRequest;
import ru.variantum.dto.response.ProjectDetailResponse;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.project.VariantService;

import java.util.UUID;

/**
 * Работа с вариантами внутри проекта: ручная и AI-правка, перегенерация,
 * добавление и удаление. Все методы возвращают обновлённый проект целиком.
 */
@RestController
@RequestMapping("/projects/{projectId}")
@RequiredArgsConstructor
@Tag(name = "Variants")
public class VariantController {

    private final VariantService variantService;

    @PatchMapping("/variants/{variantId}")
    public ProjectDetailResponse update(@PathVariable UUID projectId,
                                        @PathVariable UUID variantId,
                                        @RequestBody UpdateVariantRequest req) {
        return variantService.updateVariant(CurrentUser.requireId(), projectId, variantId, req);
    }

    @PostMapping("/variants/{variantId}/regenerate")
    public ProjectDetailResponse regenerate(@PathVariable UUID projectId,
                                            @PathVariable UUID variantId,
                                            @RequestBody(required = false) VariantActionRequest req) {
        return variantService.regenerate(CurrentUser.requireId(), projectId, variantId, req);
    }

    @PostMapping("/variants/{variantId}/ai-edit")
    public ProjectDetailResponse aiEditSingle(@PathVariable UUID projectId,
                                              @PathVariable UUID variantId,
                                              @Valid @RequestBody AiEditRequest req) {
        return variantService.aiEditSingle(CurrentUser.requireId(), projectId, variantId, req.prompt());
    }

    @PostMapping("/ai-edit-all")
    public ProjectDetailResponse aiEditAll(@PathVariable UUID projectId,
                                           @Valid @RequestBody AiEditRequest req) {
        return variantService.aiEditAll(CurrentUser.requireId(), projectId, req.prompt());
    }

    @PostMapping("/variants")
    public ResponseEntity<ProjectDetailResponse> add(@PathVariable UUID projectId,
                                                     @RequestBody(required = false) VariantActionRequest req) {
        ProjectDetailResponse response = variantService.addVariant(CurrentUser.requireId(), projectId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/variants/{variantId}/tasks/{taskId}/regenerate")
    public ProjectDetailResponse regenerateTask(@PathVariable UUID projectId,
                                                @PathVariable UUID variantId,
                                                @PathVariable UUID taskId) {
        return variantService.regenerateTask(CurrentUser.requireId(), projectId, variantId, taskId);
    }

    @DeleteMapping("/variants/{variantId}")
    public ProjectDetailResponse delete(@PathVariable UUID projectId,
                                        @PathVariable UUID variantId) {
        return variantService.deleteVariant(CurrentUser.requireId(), projectId, variantId);
    }
}
