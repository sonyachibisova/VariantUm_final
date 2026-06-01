package ru.variantum.security;

import org.springframework.security.core.context.SecurityContextHolder;
import ru.variantum.exception.UnauthorizedException;

import java.util.Optional;
import java.util.UUID;

/**
 * Утилита для получения userId текущего запроса из SecurityContext.
 */
public final class CurrentUser {

    private CurrentUser() {}

    public static UUID requireId() {
        return findId().orElseThrow(() -> new UnauthorizedException("Не авторизован"));
    }

    public static Optional<UUID> findId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return Optional.empty();
        Object principal = auth.getPrincipal();
        if (principal instanceof UUID id) return Optional.of(id);
        return Optional.empty();
    }
}
