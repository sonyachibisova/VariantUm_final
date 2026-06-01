-- ============================================================
-- V2: Отключаем Row-Level Security для упрощения на хакатоне.
-- Изоляция данных по user_id обеспечивается на уровне приложения
-- (через ProjectRepository.findByIdAndUserId и проверки в сервисах).
--
-- В prod нужно вернуть RLS + реализовать JdbcInterceptor,
-- который перед каждой транзакцией выставляет
--   SET LOCAL app.current_user_id = '<uuid>'
-- ============================================================

ALTER TABLE projects        DISABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files  DISABLE ROW LEVEL SECURITY;
ALTER TABLE llm_request_log DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_user_isolation ON projects;
DROP POLICY IF EXISTS files_user_isolation    ON uploaded_files;
DROP POLICY IF EXISTS llm_log_user_isolation  ON llm_request_log;
