package ru.variantum.security;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import ru.variantum.config.AppProperties;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Извлекает access_token из httpOnly-cookie, валидирует и кладёт Authentication в SecurityContext.
 * Если cookie нет или токен невалиден — пропускает запрос дальше как анонимный
 * (доступ контролируется в SecurityFilterChain).
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final AppProperties appProperties;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        Optional<String> token = extractAccessToken(request);
        if (token.isPresent() && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                var claims = jwtService.parse(token.get());
                String tokenType = claims.get(JwtService.TOKEN_TYPE_CLAIM, String.class);
                if (!JwtService.TOKEN_TYPE_ACCESS.equals(tokenType)) {
                    throw new JwtException("Expected access token, got: " + tokenType);
                }
                UUID userId = UUID.fromString(claims.getSubject());
                var auth = new UsernamePasswordAuthenticationToken(
                        userId,
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_TEACHER"))
                );
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException ex) {
                log.debug("Невалидный JWT: {}", ex.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }

    private Optional<String> extractAccessToken(HttpServletRequest request) {
        // 1. httpOnly cookie (основной канал)
        String cookieName = appProperties.jwt().cookieNameAccess();
        if (request.getCookies() != null) {
            for (Cookie c : request.getCookies()) {
                if (cookieName.equals(c.getName())) {
                    return Optional.of(c.getValue());
                }
            }
        }
        // 2. Authorization: Bearer ... (fallback для Swagger UI)
        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            return Optional.of(auth.substring(7));
        }
        return Optional.empty();
    }
}
