package ru.variantum.dto.response;

import java.util.UUID;

public record UserResponse(
        UUID userId,
        String email,
        String fullName,
        String role
) {}
