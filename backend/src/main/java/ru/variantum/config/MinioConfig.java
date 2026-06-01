package ru.variantum.config;

import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@RequiredArgsConstructor
public class MinioConfig {

    private final AppProperties appProperties;

    @Bean
    public MinioClient minioClient() {
        AppProperties.Minio m = appProperties.minio();
        return MinioClient.builder()
                .endpoint(m.endpoint())
                .credentials(m.accessKey(), m.secretKey())
                .build();
    }
}
