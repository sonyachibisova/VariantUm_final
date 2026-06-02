package ru.variantum.service.project;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import ru.variantum.domain.*;
import ru.variantum.dto.request.CreateFormAssignmentRequest;
import ru.variantum.dto.request.SubmitAnswersRequest;
import ru.variantum.dto.request.TeacherReviewRequest;
import ru.variantum.dto.request.UpdateStudentsRequest;
import ru.variantum.dto.response.*;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.repository.*;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class FormService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int MAX_ATTACHMENTS = 3;

    private final FormAssignmentRepository formAssignmentRepository;
    private final FormStudentRepository formStudentRepository;
    private final FormVariantTokenRepository formVariantTokenRepository;
    private final StudentSubmissionRepository studentSubmissionRepository;
    private final StudentSubmissionAttachmentRepository attachmentRepository;
    private final ProjectRepository projectRepository;
    private final VariantRepository variantRepository;
    private final TaskRepository taskRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public FormAssignmentResponse createAssignment(UUID projectId, UUID userId, CreateFormAssignmentRequest req) {
        Project project = projectRepository.findById(projectId)
                .filter(p -> p.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));

        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(projectId);
        if (variants.isEmpty()) {
            throw new IllegalStateException("Нет вариантов для создания задания");
        }

        FormAssignment.FormAssignmentBuilder builder = FormAssignment.builder()
                .projectId(projectId)
                .userId(userId)
                .mode(req.mode());

        List<FormStudentResponse> studentResponses = new ArrayList<>();
        List<FormVariantTokenResponse> tokenResponses = new ArrayList<>();

        if ("CLASS_LIST".equals(req.mode())) {
            builder.accessToken(generateToken());
        }

        FormAssignment assignment = formAssignmentRepository.save(builder.build());

        if ("CLASS_LIST".equals(req.mode())) {
            List<String> students = req.students() != null ? req.students() : List.of();
            studentResponses = addStudentsInternal(assignment.getId(), students, variants);
        } else {
            for (Variant variant : variants) {
                FormVariantToken vt = FormVariantToken.builder()
                        .assignmentId(assignment.getId())
                        .variantId(variant.getId())
                        .accessToken(generateToken())
                        .build();
                formVariantTokenRepository.save(vt);
                tokenResponses.add(new FormVariantTokenResponse(
                        vt.getId(), variant.getId(), variant.getIndexInProject(), vt.getAccessToken()));
            }
        }

        return new FormAssignmentResponse(
                assignment.getId(), projectId, req.mode(),
                assignment.getAccessToken(), assignment.getCreatedAt(),
                studentResponses, tokenResponses);
    }

    @Transactional
    public FormAssignmentResponse addStudents(UUID assignmentId, UUID userId, UpdateStudentsRequest req) {
        FormAssignment assignment = formAssignmentRepository.findById(assignmentId)
                .filter(a -> a.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Задание не найдено"));

        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(assignment.getProjectId());
        List<FormStudent> existing = formStudentRepository.findByAssignmentId(assignmentId);

        List<String> toAdd = req.addStudents() != null ? req.addStudents() : List.of();
        List<FormStudentResponse> added = addStudentsInternal(assignmentId, toAdd, variants);

        List<FormStudentResponse> allStudents = new ArrayList<>();
        for (FormStudent s : existing) {
            int idx = variants.stream().filter(v -> v.getId().equals(s.getVariantId()))
                    .findFirst().map(Variant::getIndexInProject).orElse(0);
            allStudents.add(new FormStudentResponse(s.getId(), s.getFullName(), s.getVariantId(), idx, s.getAccessToken()));
        }
        allStudents.addAll(added);

        return new FormAssignmentResponse(
                assignment.getId(), assignment.getProjectId(), assignment.getMode(),
                assignment.getAccessToken(), assignment.getCreatedAt(), allStudents, List.of());
    }

    private List<FormStudentResponse> addStudentsInternal(UUID assignmentId, List<String> names, List<Variant> variants) {
        int offset = (int) formStudentRepository.countByAssignmentId(assignmentId);
        List<FormStudentResponse> responses = new ArrayList<>();
        int added = 0;
        for (String raw : names) {
            String name = raw.trim();
            if (name.isEmpty()) continue;
            Variant variant = variants.get((offset + added) % variants.size());
            FormStudent student = FormStudent.builder()
                    .assignmentId(assignmentId)
                    .fullName(name)
                    .variantId(variant.getId())
                    .accessToken(generateToken())
                    .build();
            formStudentRepository.save(student);
            responses.add(new FormStudentResponse(
                    student.getId(), name, variant.getId(), variant.getIndexInProject(), student.getAccessToken()));
            added++;
        }
        return responses;
    }

    @Transactional(readOnly = true)
    public FormTokenInfoResponse resolveAnyToken(String token) {
        Optional<FormAssignment> assignmentOpt = formAssignmentRepository.findByAccessToken(token);
        if (assignmentOpt.isPresent()) {
            FormAssignment a = assignmentOpt.get();
            Project project = projectRepository.findById(a.getProjectId()).orElseThrow();
            return new FormTokenInfoResponse("CLASS_LIST", a.getId(), project.getTitle(), null, null);
        }

        Optional<FormStudent> studentOpt = formStudentRepository.findByAccessToken(token);
        if (studentOpt.isPresent()) {
            return buildVariantResponse(studentOpt.get().getAssignmentId(),
                    studentOpt.get().getVariantId());
        }

        Optional<FormVariantToken> vtOpt = formVariantTokenRepository.findByAccessToken(token);
        if (vtOpt.isPresent()) {
            return buildVariantResponse(vtOpt.get().getAssignmentId(), vtOpt.get().getVariantId());
        }

        throw new ResourceNotFoundException("Ссылка недействительна или устарела");
    }

    @Transactional(readOnly = true)
    public ResolvedVariantResponse resolveName(String assignmentToken, String name) {
        FormAssignment assignment = formAssignmentRepository.findByAccessToken(assignmentToken)
                .orElseThrow(() -> new ResourceNotFoundException("Ссылка недействительна"));

        List<FormStudent> matches = formStudentRepository
                .findByAssignmentIdAndFullNameIgnoreCase(assignment.getId(), name.trim());
        if (matches.isEmpty()) {
            throw new ResourceNotFoundException("Фамилия не найдена, попробуйте ещё раз");
        }
        FormStudent student = matches.get(0);
        Variant variant = variantRepository.findById(student.getVariantId())
                .orElseThrow(() -> new ResourceNotFoundException("Вариант не найден"));
        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(student.getVariantId());
        boolean alreadySubmitted = studentSubmissionRepository
                .existsByAssignmentIdAndStudentName(assignment.getId(), student.getFullName());
        return new ResolvedVariantResponse(
                student.getId(), student.getFullName(), student.getVariantId(),
                variant.getIndexInProject(), toPublicTasks(tasks), student.getAccessToken(),
                alreadySubmitted);
    }

    @Transactional
    public SubmissionResponse submitAnswers(String token, SubmitAnswersRequest req) {
        UUID variantId;
        UUID assignmentId;

        Optional<FormStudent> studentOpt = formStudentRepository.findByAccessToken(token);
        if (studentOpt.isPresent()) {
            FormStudent formStudent = studentOpt.get();
            if (studentSubmissionRepository.existsByAssignmentIdAndStudentName(
                    formStudent.getAssignmentId(), formStudent.getFullName())) {
                throw new ru.variantum.exception.ForbiddenException("Работа уже сдана");
            }
            variantId = formStudent.getVariantId();
            assignmentId = formStudent.getAssignmentId();
        } else {
            FormVariantToken vt = formVariantTokenRepository.findByAccessToken(token)
                    .orElseThrow(() -> new ResourceNotFoundException("Ссылка недействительна"));
            variantId = vt.getVariantId();
            assignmentId = vt.getAssignmentId();
        }

        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variantId);
        Variant variant = variantRepository.findById(variantId).orElseThrow();

        StudentSubmission submission = StudentSubmission.builder()
                .assignmentId(assignmentId)
                .variantId(variantId)
                .studentName(req.studentName())
                .answersJson(toJson(req.answers()))
                .autoScore(processAutoScore(tasks, req.answers()))
                .build();
        submission = studentSubmissionRepository.save(submission);
        return toSubmissionResponse(submission, variant.getIndexInProject(), tasks);
    }

    // ── Вложения (публичный эндпоинт, валидируется по токену) ────────────────

    @Transactional
    public AttachmentInfoResponse uploadAttachment(String token, UUID submissionId, MultipartFile file) {
        StudentSubmission submission = studentSubmissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Работа не найдена"));
        validateTokenOwnsSubmission(token, submission);

        if (attachmentRepository.countBySubmissionId(submissionId) >= MAX_ATTACHMENTS) {
            throw new IllegalStateException("Максимум " + MAX_ATTACHMENTS + " файла на работу");
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
        String mimeType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        try {
            StudentSubmissionAttachment attachment = StudentSubmissionAttachment.builder()
                    .submissionId(submissionId)
                    .fileName(fileName)
                    .mimeType(mimeType)
                    .fileSize((int) file.getSize())
                    .fileData(file.getBytes())
                    .build();
            attachment = attachmentRepository.save(attachment);
            return new AttachmentInfoResponse(attachment.getId(), attachment.getFileName(),
                    attachment.getMimeType(), attachment.getFileSize());
        } catch (IOException e) {
            throw new RuntimeException("Не удалось загрузить файл", e);
        }
    }

    /** Отдаёт байты вложения учителю (требует JWT, проверяет владение проектом). */
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> getAttachment(UUID submissionId, UUID attachmentId, UUID userId) {
        StudentSubmission submission = studentSubmissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Работа не найдена"));
        FormAssignment assignment = formAssignmentRepository.findById(submission.getAssignmentId()).orElseThrow();
        if (!assignment.getUserId().equals(userId)) throw new ResourceNotFoundException("Работа не найдена");

        StudentSubmissionAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> a.getSubmissionId().equals(submissionId))
                .orElseThrow(() -> new ResourceNotFoundException("Файл не найден"));

        String disposition = "inline; filename=\"" + attachment.getFileName() + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, attachment.getMimeType())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(attachment.getFileData());
    }

    private void validateTokenOwnsSubmission(String token, StudentSubmission submission) {
        UUID assignmentId = submission.getAssignmentId();
        if (formStudentRepository.findByAccessToken(token)
                .map(s -> s.getAssignmentId().equals(assignmentId)).orElse(false)) return;
        if (formVariantTokenRepository.findByAccessToken(token)
                .map(vt -> vt.getAssignmentId().equals(assignmentId)).orElse(false)) return;
        if (formAssignmentRepository.findByAccessToken(token)
                .map(a -> a.getId().equals(assignmentId)).orElse(false)) return;
        throw new ResourceNotFoundException("Токен не соответствует работе");
    }

    // ── Учительские эндпоинты ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<SubmissionResponse> listSubmissions(UUID projectId, UUID userId) {
        projectRepository.findById(projectId)
                .filter(p -> p.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        List<FormAssignment> assignments = formAssignmentRepository.findByProjectIdAndUserId(projectId, userId);
        List<SubmissionResponse> result = new ArrayList<>();
        for (FormAssignment a : assignments) {
            for (StudentSubmission s : studentSubmissionRepository.findByAssignmentId(a.getId())) {
                Variant v = variantRepository.findById(s.getVariantId()).orElse(null);
                List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(s.getVariantId());
                result.add(toSubmissionResponse(s, v != null ? v.getIndexInProject() : 0, tasks));
            }
        }
        return result;
    }

    @Transactional(readOnly = true)
    public SubmissionResponse getSubmission(UUID submissionId, UUID userId) {
        StudentSubmission sub = studentSubmissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Работа не найдена"));
        FormAssignment assignment = formAssignmentRepository.findById(sub.getAssignmentId()).orElseThrow();
        if (!assignment.getUserId().equals(userId)) throw new ResourceNotFoundException("Работа не найдена");
        Variant v = variantRepository.findById(sub.getVariantId()).orElse(null);
        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(sub.getVariantId());
        return toSubmissionResponse(sub, v != null ? v.getIndexInProject() : 0, tasks);
    }

    @Transactional
    public SubmissionResponse saveReview(UUID submissionId, UUID userId, TeacherReviewRequest req) {
        StudentSubmission sub = studentSubmissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Работа не найдена"));
        FormAssignment assignment = formAssignmentRepository.findById(sub.getAssignmentId()).orElseThrow();
        if (!assignment.getUserId().equals(userId)) throw new ResourceNotFoundException("Работа не найдена");
        sub.setTeacherReview(toJson(req.taskReviews()));
        studentSubmissionRepository.save(sub);
        Variant v = variantRepository.findById(sub.getVariantId()).orElse(null);
        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(sub.getVariantId());
        return toSubmissionResponse(sub, v != null ? v.getIndexInProject() : 0, tasks);
    }

    @Transactional(readOnly = true)
    public List<FormAssignmentResponse> listAssignments(UUID projectId, UUID userId) {
        projectRepository.findById(projectId)
                .filter(p -> p.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Проект не найден"));
        return formAssignmentRepository.findByProjectIdAndUserId(projectId, userId)
                .stream().map(this::buildAssignmentResponse).collect(Collectors.toList());
    }

    // ── Приватные хелперы ─────────────────────────────────────────────────────

    private FormTokenInfoResponse buildVariantResponse(UUID assignmentId, UUID variantId) {
        FormAssignment assignment = formAssignmentRepository.findById(assignmentId).orElseThrow();
        Project project = projectRepository.findById(assignment.getProjectId()).orElseThrow();
        Variant variant = variantRepository.findById(variantId).orElseThrow();
        List<Task> tasks = taskRepository.findByVariantIdOrderByIndexInVariantAsc(variantId);
        return new FormTokenInfoResponse("VARIANT", assignment.getId(), project.getTitle(),
                variant.getIndexInProject(), toPublicTasks(tasks));
    }

    private FormAssignmentResponse buildAssignmentResponse(FormAssignment assignment) {
        List<Variant> variants = variantRepository.findByProjectIdOrderByIndexInProjectAsc(assignment.getProjectId());
        List<FormStudentResponse> students = formStudentRepository.findByAssignmentId(assignment.getId())
                .stream().map(s -> {
                    int idx = variants.stream().filter(v -> v.getId().equals(s.getVariantId()))
                            .findFirst().map(Variant::getIndexInProject).orElse(0);
                    return new FormStudentResponse(s.getId(), s.getFullName(), s.getVariantId(), idx, s.getAccessToken());
                }).collect(Collectors.toList());
        List<FormVariantTokenResponse> tokens = formVariantTokenRepository.findByAssignmentId(assignment.getId())
                .stream().map(vt -> {
                    int idx = variants.stream().filter(v -> v.getId().equals(vt.getVariantId()))
                            .findFirst().map(Variant::getIndexInProject).orElse(0);
                    return new FormVariantTokenResponse(vt.getId(), vt.getVariantId(), idx, vt.getAccessToken());
                }).collect(Collectors.toList());
        return new FormAssignmentResponse(assignment.getId(), assignment.getProjectId(),
                assignment.getMode(), assignment.getAccessToken(), assignment.getCreatedAt(),
                students, tokens);
    }

    private String processAutoScore(List<Task> tasks, List<SubmitAnswersRequest.TaskAnswer> answers) {
        Map<UUID, SubmitAnswersRequest.TaskAnswer> answerMap = answers.stream()
                .filter(a -> a.taskId() != null)
                .collect(Collectors.toMap(SubmitAnswersRequest.TaskAnswer::taskId, a -> a, (a, b) -> a));
        List<Map<String, Object>> scores = new ArrayList<>();
        for (Task task : tasks) {
            Map<String, Object> score = new LinkedHashMap<>();
            score.put("taskId", task.getId().toString());
            SubmitAnswersRequest.TaskAnswer given = answerMap.get(task.getId());
            String givenText = given != null ? given.answer() : null;
            String storedAnswer = getExpectedAnswer(task);
            if (storedAnswer == null || storedAnswer.isBlank()) {
                storedAnswer = task.getAnswer();
            }
            if (task.getTaskType() == Project.TaskType.OPEN_QUESTION || storedAnswer == null || storedAnswer.isBlank()) {
                score.put("correct", null);
            } else if (givenText == null || givenText.isBlank()) {
                score.put("correct", false);
            } else {
                score.put("correct", answersMatch(task.getTaskType(), storedAnswer, givenText));
            }
            scores.add(score);
        }
        return toJson(scores);
    }

    private String getExpectedAnswer(Task task) {
        com.fasterxml.jackson.databind.JsonNode node = task.getMetadataJson();
        if (node == null || node.isNull()) return null;
        com.fasterxml.jackson.databind.JsonNode ea = node.get("expectedAnswer");
        if (ea == null || ea.isNull()) return null;
        String v = ea.asText(null);
        return (v != null && !v.isBlank()) ? v.trim() : null;
    }

    private boolean answersMatch(Project.TaskType taskType, String stored, String given) {
        String s = stored.trim();
        String g = given.trim();
        if (taskType == Project.TaskType.TEST) {
            String sLetter = extractTestLetter(s);
            String gLetter = extractTestLetter(g);
            if (!sLetter.isEmpty() && !gLetter.isEmpty()) {
                return sLetter.equalsIgnoreCase(gLetter);
            }
        }
        // Многочастные ответы через "; "
        if (s.contains(";")) {
            String[] storedParts = s.split(";");
            String[] givenParts = g.split(";");
            if (storedParts.length != givenParts.length) return false;
            for (int i = 0; i < storedParts.length; i++) {
                if (!normalizeAnswer(storedParts[i].trim()).equalsIgnoreCase(normalizeAnswer(givenParts[i].trim()))) {
                    return false;
                }
            }
            return true;
        }
        return normalizeAnswer(s).equalsIgnoreCase(normalizeAnswer(g));
    }

    private String extractTestLetter(String text) {
        if (text.isEmpty()) return "";
        char first = text.charAt(0);
        if ("АБВГабвг".indexOf(first) >= 0) return String.valueOf(Character.toUpperCase(first));
        if ("ABCDabcd".indexOf(first) >= 0) return String.valueOf(Character.toUpperCase(first));
        return "";
    }

    private String normalizeAnswer(String text) {
        String t = text.toLowerCase().trim();
        // Снимаем обёртку LaTeX-долларов: $3$ → 3, $$2.5$$ → 2.5
        t = t.replaceAll("^\\$+(.*?)\\$+$", "$1").trim();
        // LaTeX-запятая как разделитель дроби: 2{,}32 → 2,32
        t = t.replace("{,}", ",").replace("{.}", ".");
        // Убираем хвостовую пунктуацию
        t = t.replaceAll("[.!?,;]+$", "");
        // Запятая и точка как десятичный разделитель взаимозаменяемы
        String normalized = t.replace(',', '.');
        try {
            double d = Double.parseDouble(normalized);
            if (d == Math.floor(d) && !Double.isInfinite(d) && Math.abs(d) < 1e15) {
                return String.valueOf((long) d);
            }
            return String.valueOf(d);
        } catch (NumberFormatException e) {
            return t;
        }
    }

    private List<FormTokenInfoResponse.PublicTaskResponse> toPublicTasks(List<Task> tasks) {
        return tasks.stream().map(t -> {
            String answerHint = null;
            com.fasterxml.jackson.databind.JsonNode meta = t.getMetadataJson();
            if (meta != null && !meta.isNull() && meta.has("answerHint")) {
                String v = meta.get("answerHint").asText(null);
                if (v != null && !v.isBlank()) answerHint = v;
            }
            return new FormTokenInfoResponse.PublicTaskResponse(
                    t.getId(), t.getText(),
                    t.getTaskType() != null ? t.getTaskType().name() : null,
                    t.getEstimatedMinutes(),
                    answerHint
            );
        }).collect(Collectors.toList());
    }

    private SubmissionResponse toSubmissionResponse(StudentSubmission s, int variantIndex, List<Task> tasks) {
        List<AttachmentInfoResponse> attachments = attachmentRepository.findMetadataBySubmissionId(s.getId());
        return new SubmissionResponse(
                s.getId(), s.getAssignmentId(), s.getVariantId(),
                variantIndex, s.getStudentName(), s.getAnswersJson(),
                s.getAutoScore(), s.getTeacherReview(), s.getSubmittedAt(),
                buildCorrectAnswersJson(tasks),
                buildTasksJson(tasks),
                toJson(attachments)
        );
    }

    private String buildTasksJson(List<Task> tasks) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Task task : tasks) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("taskId", task.getId().toString());
            entry.put("text", task.getText());
            entry.put("taskType", task.getTaskType() != null ? task.getTaskType().name() : "EXERCISE");
            entry.put("index", task.getIndexInVariant());
            list.add(entry);
        }
        return toJson(list);
    }

    private String buildCorrectAnswersJson(List<Task> tasks) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Task task : tasks) {
            if (task.getTaskType() == Project.TaskType.OPEN_QUESTION) continue;
            String expected = getExpectedAnswer(task);
            if (expected == null || expected.isBlank()) expected = task.getAnswer();
            if (expected == null || expected.isBlank()) continue;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("taskId", task.getId().toString());
            entry.put("expectedAnswer", expected);
            list.add(entry);
        }
        return toJson(list);
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder sb = new StringBuilder(64);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }
}
