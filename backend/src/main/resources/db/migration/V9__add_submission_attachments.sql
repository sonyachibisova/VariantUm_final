-- Вложения к работам учеников (фото, PDF) — до 3 файлов на работу

CREATE TABLE student_submission_attachments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID        NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    file_name     VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    file_size     INTEGER     NOT NULL,
    file_data     BYTEA       NOT NULL,
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submission_attachments_submission ON student_submission_attachments(submission_id);
