package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.UploadedFile;

import java.util.Optional;
import java.util.UUID;

public interface UploadedFileRepository extends JpaRepository<UploadedFile, UUID> {
    Optional<UploadedFile> findByIdAndUserId(UUID id, UUID userId);
}
