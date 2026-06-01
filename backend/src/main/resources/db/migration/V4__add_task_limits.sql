-- Учёт потреблённых LLM-задач на пользователя
ALTER TABLE users
    ADD COLUMN tasks_used  INT NOT NULL DEFAULT 0,
    ADD COLUMN tasks_limit INT NOT NULL DEFAULT 100;
