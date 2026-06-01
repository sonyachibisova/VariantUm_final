-- Удаляем глобальный UNIQUE-constraint на email, если он ещё существует.
-- Достаточно частичного индекса idx_users_email (WHERE deleted_at IS NULL).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_name = 'users_email_key'
          AND constraint_type = 'UNIQUE'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_email_key;
    END IF;
END $$;
