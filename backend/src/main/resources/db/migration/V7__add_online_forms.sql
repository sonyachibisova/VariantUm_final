-- Онлайн-формы для учеников (TASK_online_forms)

CREATE TABLE form_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            VARCHAR(20) NOT NULL, -- 'CLASS_LIST' | 'INDIVIDUAL_LINKS'
    access_token    VARCHAR(64) UNIQUE,   -- CLASS_LIST: единственная ссылка на всё задание
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE form_students (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    access_token    VARCHAR(64) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE form_variant_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    access_token    VARCHAR(64) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    student_name    VARCHAR(255) NOT NULL,
    answers_json    TEXT NOT NULL,  -- JSON: [{"taskId":"uuid","answer":"..."}]
    auto_score      TEXT,           -- JSON: [{"taskId":"uuid","correct":true/false/null}]
    teacher_review  TEXT,           -- JSON: [{"taskId":"uuid","comment":"...","grade":"5"}]
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_form_assignments_project ON form_assignments(project_id);
CREATE INDEX idx_form_assignments_token   ON form_assignments(access_token);
CREATE INDEX idx_form_assignments_user    ON form_assignments(user_id);
CREATE INDEX idx_form_students_assignment ON form_students(assignment_id);
CREATE INDEX idx_form_students_token      ON form_students(access_token);
CREATE INDEX idx_form_variant_tokens_token ON form_variant_tokens(access_token);
CREATE INDEX idx_submissions_assignment   ON student_submissions(assignment_id);
