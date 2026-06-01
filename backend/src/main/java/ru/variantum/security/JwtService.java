package ru.variantum.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Issuing и валидация JWT.
 * Использует HS256 поверх симметричного секрета из app.jwt.secret.
 */
@Service
@RequiredArgsConstructor
public class JwtService {

    public static final String TOKEN_TYPE_CLAIM = "tt";
    public static final String TOKEN_TYPE_ACCESS = "access";
    public static final String TOKEN_TYPE_REFRESH = "refresh";

    private final AppProperties appProperties;

    private SecretKey key() {
        byte[] bytes = appProperties.jwt().secret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(bytes);
    }

    public String issueAccessToken(UUID userId, String email) {
        long ttl = appProperties.jwt().accessTokenTtlSeconds();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("email", email)
                .claim(TOKEN_TYPE_CLAIM, TOKEN_TYPE_ACCESS)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(ttl)))
                .signWith(key())
                .compact();
    }

    public String issueRefreshToken(UUID userId) {
        long ttl = appProperties.jwt().refreshTokenTtlSeconds();
        return Jwts.builder()
                .subject(userId.toString())
                .claim(TOKEN_TYPE_CLAIM, TOKEN_TYPE_REFRESH)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(ttl)))
                .signWith(key())
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public UUID extractUserId(String token) {
        return UUID.fromString(parse(token).getSubject());
    }
}
