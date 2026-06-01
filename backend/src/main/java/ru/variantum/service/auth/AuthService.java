package ru.variantum.service.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.variantum.config.AppProperties;
import ru.variantum.domain.RefreshToken;
import ru.variantum.domain.User;
import ru.variantum.dto.request.LoginRequest;
import ru.variantum.dto.request.RegisterRequest;
import ru.variantum.dto.response.UserResponse;
import ru.variantum.exception.ResourceNotFoundException;
import ru.variantum.exception.UnauthorizedException;
import ru.variantum.repository.RefreshTokenRepository;
import ru.variantum.repository.UserRepository;
import ru.variantum.security.JwtService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AppProperties appProperties;

    @Transactional
    public UserResponse register(RegisterRequest req, HttpServletResponse response) {
        if (userRepository.existsByEmail(req.email())) {
            throw new IllegalStateException("Email уже занят");
        }

        User user = User.builder()
                .email(req.email())
                .passwordHash(passwordEncoder.encode(req.password()))
                .fullName(req.fullName())
                .role(User.Role.TEACHER)
                .build();
        user = userRepository.save(user);

        issueAuthCookies(response, user);
        return toResponse(user);
    }

    @Transactional
    public UserResponse login(LoginRequest req, HttpServletResponse response) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new UnauthorizedException("Неверный логин или пароль"));

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Неверный логин или пароль");
        }

        issueAuthCookies(response, user);
        return toResponse(user);
    }

    public void logout(HttpServletResponse response) {
        clearCookie(response, appProperties.jwt().cookieNameAccess());
        clearCookie(response, appProperties.jwt().cookieNameRefresh());
    }

    @Transactional(readOnly = true)
    public UserResponse me(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Пользователь не найден"));
        return toResponse(user);
    }

    // ---------- helpers ----------

    private void issueAuthCookies(HttpServletResponse response, User user) {
        String access = jwtService.issueAccessToken(user.getId(), user.getEmail());
        String refresh = jwtService.issueRefreshToken(user.getId());

        addCookie(response, appProperties.jwt().cookieNameAccess(),
                access, appProperties.jwt().accessTokenTtlSeconds());
        addCookie(response, appProperties.jwt().cookieNameRefresh(),
                refresh, appProperties.jwt().refreshTokenTtlSeconds());

        saveRefreshTokenHash(user.getId(), refresh,
                OffsetDateTime.now().plusSeconds(appProperties.jwt().refreshTokenTtlSeconds()));
    }

    @Transactional
    public UserResponse refresh(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = extractCookie(request, appProperties.jwt().cookieNameRefresh())
                .orElseThrow(() -> new UnauthorizedException("Refresh token не найден"));

        var claims = jwtService.parse(refreshToken);
        if (!JwtService.TOKEN_TYPE_REFRESH.equals(claims.get(JwtService.TOKEN_TYPE_CLAIM, String.class))) {
            throw new UnauthorizedException("Неверный тип токена");
        }
        UUID userId = UUID.fromString(claims.getSubject());

        // Проверяем в БД (если запись есть — не отозван ли)
        String hash = hashToken(refreshToken);
        refreshTokenRepository.findByTokenHash(hash).ifPresent(rt -> {
            if (rt.getRevoked()) throw new UnauthorizedException("Refresh token отозван");
        });

        // Ротация: отзываем старые, выпускаем новые
        refreshTokenRepository.revokeAllForUser(userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Пользователь не найден"));

        issueAuthCookies(response, user);
        return toResponse(user);
    }

    private void addCookie(HttpServletResponse response, String name, String value, long maxAgeSeconds) {
        ResponseCookie cookie = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(false)               // TODO: true в prod (https)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAgeSeconds)
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private void clearCookie(HttpServletResponse response, String name) {
        ResponseCookie cookie = ResponseCookie.from(name, "")
                .httpOnly(true)
                .path("/")
                .maxAge(0)
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private void saveRefreshTokenHash(UUID userId, String token, OffsetDateTime expiresAt) {
        try {
            refreshTokenRepository.save(RefreshToken.builder()
                    .userId(userId)
                    .tokenHash(hashToken(token))
                    .expiresAt(expiresAt)
                    .build());
        } catch (Exception e) {
            // не блокируем логин при ошибке сохранения
        }
    }

    private java.util.Optional<String> extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return java.util.Optional.empty();
        return Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst();
    }

    private String hashToken(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    private UserResponse toResponse(User u) {
        return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getRole().name());
    }
}
