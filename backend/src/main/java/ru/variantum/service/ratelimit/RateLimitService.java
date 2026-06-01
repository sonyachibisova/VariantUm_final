package ru.variantum.service.ratelimit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.variantum.domain.User;
import ru.variantum.exception.RateLimitException;
import ru.variantum.repository.UserRepository;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;

/**
 * Дневной лимит обращений к нейросети в процентах (старт 100%/день).
 * Каждое обращение (парсинг файла, генерация, правка) списывает проценты согласно
 * {@link LlmCostService}. Лимит автоматически обновляется ежедневно.
 */
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final UserRepository userRepository;

    /** Часовой пояс для определения «нового дня» при сбросе лимита. */
    private static final ZoneId ZONE = ZoneId.of("Europe/Moscow");

    /** Проверяет, что у пользователя ещё остались проценты дневного лимита. */
    @Transactional
    public void requireQuota(UUID userId) {
        User user = loadAndReset(userId);
        if (remaining(user) <= 0) {
            throw new RateLimitException(
                    "Дневной лимит обращений к нейросети исчерпан. Обновится завтра.",
                    secondsUntilReset());
        }
    }

    /** Списывает указанное количество процентов с дневного лимита пользователя. */
    @Transactional
    public void deductPercent(UUID userId, double percent) {
        if (percent <= 0) return;
        User user = loadAndReset(userId);
        double used = Math.min(LlmCostService.DAILY_LIMIT, user.getDailyPercentUsed() + percent);
        user.setDailyPercentUsed(used);
        userRepository.save(user);
    }

    /** Текущий снимок лимитов пользователя для отображения на фронте. */
    @Transactional
    public LimitsSnapshot snapshot(UUID userId) {
        User user = loadAndReset(userId);
        return new LimitsSnapshot(
                round(remaining(user)),
                round(user.getDailyPercentUsed()),
                LlmCostService.DAILY_LIMIT,
                resetAtIso());
    }

    // ---- внутреннее ----

    /** Загружает пользователя и при необходимости сбрасывает лимит на новый день. */
    private User loadAndReset(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Пользователь не найден: " + userId));
        LocalDate today = LocalDate.now(ZONE);
        if (user.getLimitResetDate() == null || user.getLimitResetDate().isBefore(today)) {
            user.setDailyPercentUsed(0);
            user.setLimitResetDate(today);
            userRepository.save(user);
        }
        return user;
    }

    private double remaining(User user) {
        return Math.max(0, LlmCostService.DAILY_LIMIT - user.getDailyPercentUsed());
    }

    private long secondsUntilReset() {
        ZonedDateTime now = ZonedDateTime.now(ZONE);
        ZonedDateTime nextMidnight = now.toLocalDate().plusDays(1).atStartOfDay(ZONE);
        return Math.max(0, java.time.Duration.between(now, nextMidnight).getSeconds());
    }

    private String resetAtIso() {
        ZonedDateTime nextMidnight = ZonedDateTime.now(ZONE).toLocalDate().plusDays(1).atStartOfDay(ZONE);
        return nextMidnight.toOffsetDateTime().toString();
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /** Снимок дневного лимита: остаток %, израсходовано %, полный лимит, время сброса (ISO). */
    public record LimitsSnapshot(double percentRemaining, double percentUsed, double limit, String resetAt) {}
}
