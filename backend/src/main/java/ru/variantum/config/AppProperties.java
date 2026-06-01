package ru.variantum.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Типизированная привязка к секции `app.*` в application.yml.
 * Сюда стекаются ВСЕ кастомные настройки сервиса.
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String baseUrl,
        String frontendBaseUrl,
        Jwt jwt,
        RateLimit rateLimit,
        Minio minio,
        GigaChat gigachat,
        Ocr ocr,
        Cors cors
) {
    public record Jwt(
            String secret,
            long accessTokenTtlSeconds,
            long refreshTokenTtlSeconds,
            String cookieNameAccess,
            String cookieNameRefresh
    ) {}

    public record RateLimit(
            int llmPerHour,
            int uploadPerHour
    ) {}

    public record Minio(
            String endpoint,
            String publicEndpoint,
            String accessKey,
            String secretKey,
            String bucket,
            int presignedUrlTtlMinutes
    ) {}

    public record GigaChat(
            String apiUrl,
            String authUrl,
            String clientId,
            String clientSecret,
            String scope,
            /** Основная модель (Pro) — генерация, правка, валидация */
            String model,
            /** Лёгкая модель (Lite) — анализ, очистка текста, рекомендации */
            String modelLite,
            /** Максимальная модель (Max) — задачи повышенной сложности по математике/физике */
            String modelMax,
            int timeoutSeconds,
            double temperatureGenerate,
            double temperatureValidate,
            double topP,
            int maxTokens
    ) {}

    public record Ocr(
            String tessdataPath,
            String language
    ) {}

    public record Cors(
            List<String> allowedOrigins
    ) {}
}
