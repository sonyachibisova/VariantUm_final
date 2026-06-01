package ru.variantum.service.storage;

import io.minio.*;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;

import java.io.InputStream;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
@RequiredArgsConstructor
public class MinioStorageService {

    private final MinioClient minioClient;
    private final AppProperties appProperties;

    private String bucket() {
        return appProperties.minio().bucket();
    }

    public String buildFileKey(UUID userId, String fileUuid) {
        return "user_%s/files/%s".formatted(userId, fileUuid);
    }

    public String buildExportKey(UUID userId, String fileUuid) {
        return "user_%s/exports/%s".formatted(userId, fileUuid);
    }

    public String put(String key, InputStream content, long size, String mimeType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket())
                    .object(key)
                    .stream(content, size, -1)
                    .contentType(mimeType)
                    .build());
            log.debug("MinIO stored: {}", key);
            return key;
        } catch (Exception e) {
            throw new RuntimeException("MinIO put failed for key " + key, e);
        }
    }

    public InputStream getStream(String key) {
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(bucket())
                    .object(key)
                    .build());
        } catch (Exception e) {
            throw new RuntimeException("MinIO get failed for key " + key, e);
        }
    }

    public String presignedUrl(String key) {
        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucket())
                    .object(key)
                    .expiry(appProperties.minio().presignedUrlTtlMinutes(), TimeUnit.MINUTES)
                    .build());
        } catch (Exception e) {
            throw new RuntimeException("MinIO presign failed for key " + key, e);
        }
    }

    public void delete(String key) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket())
                    .object(key)
                    .build());
            log.debug("MinIO deleted: {}", key);
        } catch (Exception e) {
            log.warn("MinIO delete failed for {}: {}", key, e.getMessage());
        }
    }
}
