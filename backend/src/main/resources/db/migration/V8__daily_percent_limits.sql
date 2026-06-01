-- Дневной лимит обращений к нейросети в процентах (старт 100%/день, ежедневный сброс).
-- Заменяет учёт по числу задач (tasks_used/tasks_limit оставлены для обратной совместимости).
ALTER TABLE users
    ADD COLUMN daily_percent_used DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN limit_reset_date   DATE;
