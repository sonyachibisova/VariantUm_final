-- ============================================================
-- ВариантУм — начальная схема БД
-- Документ-источник: docs/06_Схема_БД_и_структура_проекта.md
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- GIN-индекс по тексту темы

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'TEACHER',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- uploaded_files (объявляем раньше projects — на неё ссылается FK)
-- ------------------------------------------------------------
CREATE TABLE uploaded_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename        VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      BIGINT       NOT NULL,
    storage_key     VARCHAR(500) NOT NULL,
    parsed_text     TEXT,
    parser_used     VARCHAR(50),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_files_user ON uploaded_files(user_id);

-- ------------------------------------------------------------
-- projects — комплекты вариантов
-- ------------------------------------------------------------
CREATE TABLE projects (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                VARCHAR(500) NOT NULL,
    mode                 VARCHAR(50)  NOT NULL,
        -- 'FROM_REFERENCE' | 'FROM_CRITERIA'
    subject              VARCHAR(100),
    grade                INT,
    topic                VARCHAR(500),
    task_type            VARCHAR(50),
        -- 'PROBLEM' | 'TEST' | 'EXERCISE' | 'OPEN_QUESTION'
    target_difficulty    INT,                 -- 1..5
    difficulty_gradation VARCHAR(50),
        -- 'EQUAL' | 'ASCENDING' | 'CUSTOM'
    custom_prompt        TEXT,
    reference_text       TEXT,
    reference_file_id    UUID REFERENCES uploaded_files(id) ON DELETE SET NULL,
    params_json          JSONB,
    status               VARCHAR(50) NOT NULL DEFAULT 'GENERATING',
        -- 'GENERATING' | 'READY' | 'FAILED'
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,

    CONSTRAINT projects_grade_range CHECK (grade IS NULL OR (grade BETWEEN 1 AND 11)),
    CONSTRAINT projects_difficulty_range CHECK (target_difficulty IS NULL OR (target_difficulty BETWEEN 1 AND 5))
);
CREATE INDEX idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_search ON projects(user_id, subject, grade) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_topic_trgm ON projects USING GIN (topic gin_trgm_ops);

-- ------------------------------------------------------------
-- variants
-- ------------------------------------------------------------
CREATE TABLE variants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    index_in_project        INT  NOT NULL,
    difficulty              INT,
    total_estimated_minutes INT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, index_in_project),
    CONSTRAINT variants_difficulty_range CHECK (difficulty IS NULL OR (difficulty BETWEEN 1 AND 5))
);
CREATE INDEX idx_variants_project ON variants(project_id);

-- ------------------------------------------------------------
-- tasks (отдельные задания внутри варианта)
-- ------------------------------------------------------------
CREATE TABLE tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id        UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    index_in_variant  INT  NOT NULL,
    text              TEXT NOT NULL,
    answer            TEXT,
    steps             INT,
    estimated_minutes INT,
    difficulty        INT,
    task_type         VARCHAR(50),
    metadata_json     JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (variant_id, index_in_variant),
    CONSTRAINT tasks_difficulty_range CHECK (difficulty IS NULL OR (difficulty BETWEEN 1 AND 5))
);
CREATE INDEX idx_tasks_variant ON tasks(variant_id);

-- ------------------------------------------------------------
-- project_versions (история для отката)
-- ------------------------------------------------------------
CREATE TABLE project_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action        VARCHAR(50) NOT NULL,
        -- 'GENERATED' | 'MANUAL_EDIT' | 'AI_EDIT_SINGLE'
        -- 'AI_EDIT_ALL' | 'REGENERATED' | 'VARIANT_ADDED' | 'VARIANT_DELETED'
    description   VARCHAR(500),
    snapshot_json JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_versions_project ON project_versions(project_id, created_at DESC);

-- ------------------------------------------------------------
-- recommendations
-- ------------------------------------------------------------
CREATE TABLE recommendations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type          VARCHAR(50) NOT NULL,
        -- 'DIFFICULTY_OUTLIER' | 'DUPLICATE_ANSWER'
        -- 'TIME_MISMATCH' | 'ADD_VARIATION' | 'CUSTOM'
    variant_index INT,
    severity      VARCHAR(20),
        -- 'INFO' | 'WARNING' | 'CRITICAL'
    message       TEXT NOT NULL,
    dismissed     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_recs_project ON recommendations(project_id) WHERE dismissed = FALSE;

-- ------------------------------------------------------------
-- llm_request_log — журнал запросов к GigaChat (rate limit + аудит)
-- ------------------------------------------------------------
CREATE TABLE llm_request_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
    prompt_type   VARCHAR(50) NOT NULL,
        -- 'ANALYZE' | 'GENERATE_REF' | 'GENERATE_CRIT'
        -- 'VALIDATE' | 'AI_EDIT_SINGLE' | 'AI_EDIT_ALL'
        -- 'RECOMMEND' | 'TIME_ESTIMATE'
    tokens_used   INT,
    duration_ms   INT,
    success       BOOLEAN NOT NULL,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llm_log_user_time ON llm_request_log(user_id, created_at DESC);

-- ------------------------------------------------------------
-- refresh_tokens (для JWT refresh-flow, ротация)
-- ------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id) WHERE revoked = FALSE;

-- ------------------------------------------------------------
-- Триггер: автообновление updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER projects_updated_at   BEFORE UPDATE ON projects   FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER variants_updated_at   BEFORE UPDATE ON variants   FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ------------------------------------------------------------
-- Row-Level Security
-- Включается, но политики используют GUC app.current_user_id,
-- который Spring выставляет на каждый запрос (JdbcInterceptor).
-- В application-dev.yml можно отключить через FORCE NO ROW SECURITY на роли.
-- ------------------------------------------------------------
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_user_isolation ON projects
    USING (user_id::text = current_setting('app.current_user_id', TRUE));

CREATE POLICY files_user_isolation ON uploaded_files
    USING (user_id::text = current_setting('app.current_user_id', TRUE));

CREATE POLICY llm_log_user_isolation ON llm_request_log
    USING (user_id::text = current_setting('app.current_user_id', TRUE));
