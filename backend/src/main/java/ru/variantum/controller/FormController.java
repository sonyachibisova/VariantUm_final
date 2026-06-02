package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import ru.variantum.dto.request.*;
import ru.variantum.dto.response.*;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.project.FormService;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Forms")
public class FormController {

    private final FormService formService;

    // ── Публичные endpoints (без авторизации) ─────────────────────────────────

    @GetMapping("/form/{token}")
    public FormTokenInfoResponse getFormInfo(@PathVariable String token) {
        return formService.resolveAnyToken(token);
    }

    @PostMapping("/form/{token}/resolve-name")
    public ResolvedVariantResponse resolveName(
            @PathVariable String token,
            @Valid @RequestBody ResolveNameRequest req) {
        return formService.resolveName(token, req.name());
    }

    @PostMapping("/form/{token}/submit")
    public SubmissionResponse submit(
            @PathVariable String token,
            @Valid @RequestBody SubmitAnswersRequest req) {
        return formService.submitAnswers(token, req);
    }

    /** Загрузка вложения от ученика — до 3 файлов на работу. */
    @PostMapping("/form/{token}/submissions/{submissionId}/attachments")
    public AttachmentInfoResponse uploadAttachment(
            @PathVariable String token,
            @PathVariable UUID submissionId,
            @RequestParam("file") MultipartFile file) {
        return formService.uploadAttachment(token, submissionId, file);
    }

    // ── Приватные endpoints (JWT) ─────────────────────────────────────────────

    @GetMapping("/submissions/{submissionId}/attachments/{attachmentId}")
    public ResponseEntity<byte[]> getAttachment(
            @PathVariable UUID submissionId,
            @PathVariable UUID attachmentId) {
        return formService.getAttachment(submissionId, attachmentId, CurrentUser.requireId());
    }

    @PostMapping("/projects/{projectId}/forms")
    public ResponseEntity<FormAssignmentResponse> createAssignment(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreateFormAssignmentRequest req) {
        UUID userId = CurrentUser.requireId();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(formService.createAssignment(projectId, userId, req));
    }

    @GetMapping("/projects/{projectId}/forms")
    public List<FormAssignmentResponse> listAssignments(@PathVariable UUID projectId) {
        return formService.listAssignments(projectId, CurrentUser.requireId());
    }

    @PatchMapping("/forms/{assignmentId}/students")
    public FormAssignmentResponse updateStudents(
            @PathVariable UUID assignmentId,
            @RequestBody UpdateStudentsRequest req) {
        return formService.addStudents(assignmentId, CurrentUser.requireId(), req);
    }

    @GetMapping("/projects/{projectId}/submissions")
    public List<SubmissionResponse> listSubmissions(@PathVariable UUID projectId) {
        return formService.listSubmissions(projectId, CurrentUser.requireId());
    }

    @GetMapping("/submissions/{submissionId}")
    public SubmissionResponse getSubmission(@PathVariable UUID submissionId) {
        return formService.getSubmission(submissionId, CurrentUser.requireId());
    }

    @PatchMapping("/submissions/{submissionId}/review")
    public SubmissionResponse saveReview(
            @PathVariable UUID submissionId,
            @RequestBody TeacherReviewRequest req) {
        return formService.saveReview(submissionId, CurrentUser.requireId(), req);
    }
}
