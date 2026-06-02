package ru.variantum.service.llm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;
import ru.variantum.config.AppProperties;
import ru.variantum.exception.LlmFailureException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

@Component
@Slf4j
public class GigaChatClient {

    private final WebClient apiClient;
    private final WebClient authClient;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final AtomicReference<CachedToken> tokenCache = new AtomicReference<>();

    public GigaChatClient(
            @Qualifier("gigachatWebClient") WebClient apiClient,
            @Qualifier("gigachatAuthWebClient") WebClient authClient,
            AppProperties appProperties,
            ObjectMapper objectMapper) {
        this.apiClient = apiClient;
        this.authClient = authClient;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * Completion с моделью по умолчанию (Pro — из конфига {@code app.gigachat.model}).
     * <ul>
     *   <li>При 402 (квота Pro исчерпана) — автофолбэк на Lite.</li>
     *   <li>При 429 (rate-limit) — тоже фолбэк на Lite (у Lite отдельная квота).</li>
     * </ul>
     */
    public Mono<String> completion(String prompt, double temperature) {
        String primary  = appProperties.gigachat().model();
        String fallback = appProperties.gigachat().modelLite();
        return completion(prompt, temperature, primary)
                .onErrorResume(ex -> {
                    if (ex instanceof LlmFailureException lfe
                            && lfe.getMessage() != null
                            && !primary.equals(fallback)) {
                        String msg = lfe.getMessage();
                        if (msg.contains("402")) {
                            log.warn("GigaChat {} → 402 (квота исчерпана), фолбэк на {}", primary, fallback);
                            return completion(prompt, temperature, fallback);
                        }
                        if (msg.contains("429")) {
                            log.warn("GigaChat {} → 429 (rate-limit), фолбэк на {}", primary, fallback);
                            return completion(prompt, temperature, fallback);
                        }
                    }
                    return Mono.error(ex);
                });
    }

    /**
     * Completion с явным указанием модели.
     * <ul>
     *   <li>{@code modelLite} — анализ, очистка, рекомендации (дешевле, быстрее)</li>
     *   <li>{@code model} (Pro) — генерация, правка, валидация</li>
     *   <li>{@code modelMax} — сложные задачи по математике/физике</li>
     * </ul>
     * Сетевые исключения (таймаут, обрыв) оборачиваются в ретраябельный {@link LlmFailureException},
     * чтобы backoff-retry мог их обработать.
     */
    public Mono<String> completion(String prompt, double temperature, String model) {
        log.info("GigaChat: completion [{}], промпт {} символов", model, prompt.length());
        return getAccessToken()
                .flatMap(token -> callCompletion(token, prompt, temperature, null, model))
                .onErrorMap(ex -> wrapNetworkException(ex, "completion [" + model + "]"))
                .retryWhen(Retry.backoff(2, Duration.ofSeconds(3))
                        .filter(ex -> ex instanceof LlmFailureException lfe && lfe.isRetryable()))
                .doOnError(e -> log.error("GigaChat completion [{}] итоговая ошибка: {} - {}",
                        model, e.getClass().getSimpleName(), e.getMessage()));
    }

    /**
     * Completion с прикреплённым изображением (vision), основная модель (Pro).
     * GigaChat-Pro распознаёт текст, формулы, графики и таблицы.
     */
    public Mono<String> completionWithAttachment(String prompt, String fileId, double temperature) {
        return completionWithAttachment(prompt, fileId, temperature, appProperties.gigachat().model());
    }

    /**
     * Completion с прикреплённым изображением, явная модель.
     */
    public Mono<String> completionWithAttachment(String prompt, String fileId, double temperature, String model) {
        log.info("GigaChat vision [{}]: completion с файлом {}", model, fileId);
        return getAccessToken()
                .flatMap(token -> callCompletion(token, prompt, temperature, List.of(fileId), model))
                .onErrorMap(ex -> wrapNetworkException(ex, "vision [" + model + "]"))
                .retryWhen(Retry.backoff(2, Duration.ofSeconds(3))
                        .filter(ex -> ex instanceof LlmFailureException lfe && lfe.isRetryable()))
                .doOnError(e -> log.error("GigaChat vision [{}] ошибка: {} - {}",
                        model, e.getClass().getSimpleName(), e.getMessage()));
    }

    /**
     * Оборачивает сетевые/IO-исключения (таймаут, обрыв соединения) в ретраябельный
     * {@link LlmFailureException}. Уже являющиеся {@code LlmFailureException} — не трогает.
     */
    private Throwable wrapNetworkException(Throwable ex, String context) {
        if (ex instanceof LlmFailureException) return ex;
        String name = ex.getClass().getSimpleName();
        boolean likelyTimeout = name.contains("Timeout") || name.contains("ReadTimeout")
                || name.contains("ConnectTimeout") || name.contains("PrematureClose")
                || name.contains("ClosedChannel");
        log.warn("GigaChat {}: сетевая ошибка [{}]: {}", context, name, ex.getMessage());
        return new LlmFailureException(
                "GigaChat " + context + " сетевая ошибка (" + name + "): " + ex.getMessage(),
                likelyTimeout  // ретраябельно только если это именно таймаут/обрыв
        );
    }

    /**
     * Загружает файл (изображение) в хранилище GigaChat и возвращает его id.
     * Поддержка: JPEG, PNG, TIFF, BMP, до 15 Мб.
     */
    public Mono<String> uploadFile(byte[] bytes, String filename, String mimeType) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename != null ? filename : "upload";
            }
        }).contentType(MediaType.parseMediaType(mimeType));
        builder.part("purpose", "general");

        return getAccessToken().flatMap(token -> apiClient.post()
                .uri("/files")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .accept(MediaType.APPLICATION_JSON)
                .body(BodyInserters.fromMultipartData(builder.build()))
                .exchangeToMono(response -> {
                    int statusCode = response.statusCode().value();
                    return response.bodyToMono(String.class).defaultIfEmpty("")
                            .flatMap(rawBody -> {
                                log.info("GigaChat upload файла: HTTP {} тело: {}", statusCode,
                                        rawBody.substring(0, Math.min(200, rawBody.length())));
                                if (statusCode >= 400 || rawBody.isBlank()) {
                                    return Mono.error(new LlmFailureException(
                                            "GigaChat upload HTTP " + statusCode + ": " + rawBody, statusCode >= 500));
                                }
                                try {
                                    FileUploadResp resp = objectMapper.readValue(rawBody, FileUploadResp.class);
                                    if (resp.id() == null || resp.id().isBlank()) {
                                        return Mono.error(new LlmFailureException("GigaChat upload: пустой id файла", false));
                                    }
                                    return Mono.just(resp.id());
                                } catch (Exception e) {
                                    return Mono.error(new LlmFailureException(
                                            "Ошибка парсинга ответа upload: " + e.getMessage(), false));
                                }
                            });
                }));
    }

    private Mono<String> callCompletion(String token, String prompt, double temperature,
                                        List<String> attachments, String model) {
        AppProperties.GigaChat g = appProperties.gigachat();
        log.info("GigaChat: отправляем запрос [{}] к {}", model, g.apiUrl());

        var request = new CompletionRequest(
                model,
                List.of(new Message("user", prompt, attachments)),
                temperature,
                g.topP(),
                g.maxTokens(),
                false
        );

        return apiClient.post()
                .uri("/chat/completions")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .exchangeToMono(response -> {
                    int statusCode = response.statusCode().value();
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("")
                            .flatMap(rawBody -> {
                                log.info("GigaChat completion ответ: HTTP {} тело({} символов): {}",
                                        statusCode,
                                        rawBody.length(),
                                        rawBody.substring(0, Math.min(300, rawBody.length())).replace("\n", "↵"));

                                if (statusCode >= 400) {
                                    // 429 — rate-limit, ретраябельно (backoff поможет)
                                    // 5xx — серверная ошибка, ретраябельно
                                    // 402/4xx — нет смысла ретрировать, нужен фолбэк на Lite
                                    boolean retryable = statusCode >= 500 || statusCode == 429;
                                    return Mono.error(new LlmFailureException(
                                            "GigaChat HTTP " + statusCode + ": " + rawBody, retryable));
                                }
                                if (rawBody.isBlank()) {
                                    return Mono.error(new LlmFailureException("GigaChat вернул пустое тело", true));
                                }
                                try {
                                    CompletionResponse resp = objectMapper.readValue(rawBody, CompletionResponse.class);
                                    if (resp.choices() == null || resp.choices().isEmpty()) {
                                        return Mono.error(new LlmFailureException(
                                                "GigaChat: пустой список choices. Ответ: " + rawBody.substring(0, Math.min(200, rawBody.length())), false));
                                    }
                                    Choice choice = resp.choices().get(0);
                                    String content = choice.message().content();
                                    if (content == null || content.isBlank()) {
                                        return Mono.error(new LlmFailureException(
                                                "GigaChat: пустой content в choices[0]", false));
                                    }
                                    // GigaChat пишет LaTeX-команды одиночным слэшем в JSON (\frac, \begin и т.п.).
                                    // Jackson превращает \f → form-feed (0x0C), \b → backspace (0x08).
                                    // Восстанавливаем: если за control char идёт буква — это была LaTeX-команда.
                                    content = restoreLatexBackslashes(content);
                                    // Предупреждение об обрезании ответа по лимиту токенов
                                    if ("length".equals(choice.finishReason())) {
                                        log.warn("GigaChat [{}]: finish_reason=length — ответ обрезан! " +
                                                 "max_tokens={}, контент {} символов. " +
                                                 "LlmJsonUtil попробует восстановить JSON.",
                                                model, appProperties.gigachat().maxTokens(), content.length());
                                    }
                                    log.info("GigaChat [{}]: получен контент {} символов, finish_reason={}",
                                            model, content.length(), choice.finishReason());
                                    return Mono.just(content);
                                } catch (Exception e) {
                                    return Mono.error(new LlmFailureException(
                                            "Ошибка парсинга ответа GigaChat: " + e.getMessage(), false));
                                }
                            });
                });
    }

    private Mono<String> getAccessToken() {
        CachedToken cached = tokenCache.get();
        if (cached != null && cached.validUntil().isAfter(Instant.now())) {
            log.debug("GigaChat: используем кэшированный токен, действителен до {}", cached.validUntil());
            return Mono.just(cached.token());
        }
        return fetchNewToken();
    }

    private Mono<String> fetchNewToken() {
        AppProperties.GigaChat g = appProperties.gigachat();
        log.info("GigaChat: запрашиваем новый токен. clientId={}..., scope={}, url={}",
                g.clientId().substring(0, Math.min(8, g.clientId().length())),
                g.scope(),
                g.authUrl());

        String basicAuth = java.util.Base64.getEncoder().encodeToString(
                (g.clientId() + ":" + g.clientSecret()).getBytes());

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("scope", g.scope());

        return authClient.post()
                .uri(g.authUrl())
                .header("Authorization", "Basic " + basicAuth)
                .header("RqUID", UUID.randomUUID().toString())
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData(form))
                .exchangeToMono(response -> {
                    int statusCode = response.statusCode().value();
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("")
                            .flatMap(rawBody -> {
                                log.info("GigaChat auth ответ: HTTP {} тело: {}",
                                        statusCode,
                                        rawBody.substring(0, Math.min(300, rawBody.length())));

                                if (statusCode >= 400) {
                                    return Mono.error(new LlmFailureException(
                                            "GigaChat auth HTTP " + statusCode + ": " + rawBody, false));
                                }
                                if (rawBody.isBlank()) {
                                    return Mono.error(new LlmFailureException(
                                            "GigaChat auth вернул пустое тело", false));
                                }
                                try {
                                    TokenResponse tokenResp = objectMapper.readValue(rawBody, TokenResponse.class);
                                    if (tokenResp.accessToken() == null || tokenResp.accessToken().isBlank()) {
                                        return Mono.error(new LlmFailureException(
                                                "GigaChat auth: access_token пустой. Ответ: " + rawBody, false));
                                    }
                                    Instant validUntil = tokenResp.expiresAt() > 0
                                            ? Instant.ofEpochMilli(tokenResp.expiresAt()).minusSeconds(60)
                                            : Instant.now().plusSeconds(1740); // 29 минут если нет expires_at
                                    tokenCache.set(new CachedToken(tokenResp.accessToken(), validUntil));
                                    log.info("GigaChat: токен получен, действителен до {}", validUntil);
                                    return Mono.just(tokenResp.accessToken());
                                } catch (Exception e) {
                                    return Mono.error(new LlmFailureException(
                                            "Ошибка парсинга токена GigaChat: " + e.getMessage() + ". Тело: " + rawBody, false));
                                }
                            });
                });
    }

    /**
     * Восстанавливает LaTeX-команды, испорченные парсингом JSON.
     * GigaChat пишет \frac, \begin, \bar и т.п. без удвоения слэша в JSON-строках.
     * Jackson превращает \f → form-feed (0x0C), \b → backspace (0x08).
     * Если за этими control-символами идёт буква — это была LaTeX-команда: восстанавливаем слэш.
     * form-feed (0x0C) и backspace (0x08) никогда не нужны в текстах учебных заданий.
     */
    private String restoreLatexBackslashes(String text) {
        if (text == null || text.isEmpty()) return text;
        boolean hasBad = false;
        for (int i = 0; i < text.length() - 1; i++) {
            char c = text.charAt(i);
            if ((c == '\f' || c == '\b') && Character.isLetter(text.charAt(i + 1))) {
                hasBad = true;
                break;
            }
        }
        if (!hasBad) return text;
        StringBuilder sb = new StringBuilder(text.length() + 16);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            char next = (i + 1 < text.length()) ? text.charAt(i + 1) : '\0';
            if (c == '\f' && Character.isLetter(next)) {
                sb.append('\\').append('f');
            } else if (c == '\b' && Character.isLetter(next)) {
                sb.append('\\').append('b');
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    // ---- DTOs ----

    private record CachedToken(String token, Instant validUntil) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_at") long expiresAt) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record FileUploadResp(@JsonProperty("id") String id) {}

    private record CompletionRequest(
            String model,
            List<Message> messages,
            double temperature,
            @JsonProperty("top_p") double topP,
            @JsonProperty("max_tokens") int maxTokens,
            boolean stream) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Message(String role, String content, List<String> attachments) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record CompletionResponse(List<Choice> choices) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Choice(
            Message message,
            @JsonProperty("finish_reason") String finishReason) {}
}
