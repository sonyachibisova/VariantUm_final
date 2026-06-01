package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.variantum.domain.FormVariantToken;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FormVariantTokenRepository extends JpaRepository<FormVariantToken, UUID> {
    Optional<FormVariantToken> findByAccessToken(String token);
    List<FormVariantToken> findByAssignmentId(UUID assignmentId);
}
