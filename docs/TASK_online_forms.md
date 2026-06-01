# Задача: экспорт варианта в виде онлайн-формы для учеников

Перед началом прочитай CLAUDE.md и docs/04, docs/05, docs/06.

## Что нужно реализовать

Учитель в `ExportDialog` выбирает новый формат «Онлайн-форма». Ему предлагается два режима:

**Режим A — «Список учеников» (CLASS_LIST):**
- Учитель вводит список учеников (по одному на строку: фамилия и имя)
- Варианты распределяются по кругу (если учеников больше вариантов — варианты повторяются)
- Генерируется одна ссылка вида `/form/{assignmentToken}`
- При переходе ученик вводит фамилию → система ищет совпадение (case-insensitive, trim, contains) → открывает его вариант
- Если не найдено — «Фамилия не найдена, попробуйте ещё раз»
- Учитель может редактировать список учеников после создания (добавлять новых — им автоматически назначается вариант)

**Режим B — «Отдельные ссылки» (INDIVIDUAL_LINKS):**
- Для каждого варианта своя ссылка `/form/{variantToken}`
- Учителю показывается список «Вариант 1: [ссылка]», «Вариант 2: [ссылка]» с кнопкой копирования

---

## Backend

### Flyway-миграция — новый файл `V{следующий номер}__add_online_forms.sql`

```sql
CREATE TABLE form_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            VARCHAR(20) NOT NULL, -- 'CLASS_LIST' | 'INDIVIDUAL_LINKS'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ученики для режима CLASS_LIST
CREATE TABLE form_students (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    access_token    VARCHAR(64) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Токены вариантов для режима INDIVIDUAL_LINKS
CREATE TABLE form_variant_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    access_token    VARCHAR(64) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Сданные работы
CREATE TABLE student_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES form_assignments(id) ON DELETE CASCADE,
    variant_id      UUID NOT NULL REFERENCES variants(id),
    student_name    VARCHAR(255) NOT NULL,
    answers_json    JSONB NOT NULL,  -- [{"taskId": "uuid", "answer": "..."}]
    auto_score      JSONB,           -- [{"taskId": "uuid", "correct": true/false}]
    teacher_review  JSONB,           -- [{"taskId": "uuid", "comment": "...", "grade": "5"}]
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_form_assignments_project ON form_assignments(project_id);
CREATE INDEX idx_form_students_assignment ON form_students(assignment_id);
CREATE INDEX idx_form_students_token ON form_students(access_token);
CREATE INDEX idx_form_variant_tokens_token ON form_variant_tokens(access_token);
CREATE INDEX idx_submissions_assignment ON student_submissions(assignment_id);
```

### Новые entity (в `domain/`)
`FormAssignment`, `FormStudent`, `FormVariantToken`, `StudentSubmission`

### Новые репозитории (в `repository/`)
По одному на каждую entity. В `FormStudentRepository` добавить:
- `findByAccessToken(String token)`
- `findByAssignmentIdAndFullNameContainingIgnoreCase(UUID assignmentId, String name)`

### Новый сервис `FormService` (в `service/project/`)

Логика:
- `createAssignment(projectId, userId, request)` — создаёт `form_assignments` + токены. Токены генерировать через `SecureRandom`: 32 байта → hex-строка 64 символа.
- `addStudents(assignmentId, userId, names)` — добавляет учеников, распределяет варианты по кругу
- `resolveToken(token)` — определяет тип токена (student или variant), возвращает нужные данные
- `resolveName(token, name)` — ищет ученика по имени, возвращает его вариант
- `submitAnswers(token, request)` — сохраняет работу, вызывает автопроверку

Логика **автопроверки** в `processAutoScore()`:
- `TEST`: из текста задания парсим варианты А)/Б)/В)/Г). Сравниваем ответ ученика с `tasks.answer` (trim, ignoreCase).
- `PROBLEM` / `EXERCISE`: сравниваем trim/toLowerCase ответа с `tasks.answer`.
- `OPEN_QUESTION`: `correct = null` (учитель проверяет сам).

### Новый контроллер `FormController` (в `controller/`)

Публичные endpoints (без авторизации):
```
GET  /form/{token}                  — информация о форме (тип токена)
POST /form/{token}/resolve-name     — body: {name} → находит ученика и возвращает его вариант
POST /form/{token}/submit           — body: {studentName, studentId?, answers:[{taskId, answer}]}
```

Приватные endpoints (JWT):
```
POST  /projects/{projectId}/forms               — создать задание
GET   /projects/{projectId}/forms               — список заданий по проекту
PATCH /forms/{assignmentId}/students            — добавить/убрать учеников
GET   /projects/{projectId}/submissions         — список сданных работ
GET   /submissions/{submissionId}               — детали работы
PATCH /submissions/{submissionId}/review        — body: {taskReviews:[{taskId,comment,grade}]}
```

Публичные endpoints добавить в whitelist в `SecurityConfig.java` (permitAll):
`/api/v1/form/**`

---

## Frontend

### Новые файлы

**`src/features/exporter/FormExportDialog.tsx`**
- Выбор режима (CLASS_LIST / INDIVIDUAL_LINKS)
- Для CLASS_LIST: textarea «Список учеников (по одному на строку)»
- Кнопка «Создать задание»
- После создания: показ ссылок с кнопкой копирования (одна или список)
- Для CLASS_LIST дополнительно: блок «Управление учениками» — добавление новых фамилий

**`src/pages/StudentFormPage.tsx`** (роут `/form/:token`, публичный, без авторизации)
- Шаг 1: ввод имени и фамилии (для INDIVIDUAL_LINKS) или только фамилии (для CLASS_LIST)
- Шаг 2: список заданий с правильными полями ввода:
  - `TEST` — radio-кнопки с вариантами А)/Б)/В)/Г) (парсить из текста задания)
  - `PROBLEM` / `EXERCISE` — `<Input>` (одна строка)
  - `OPEN_QUESTION` — `<textarea>` (многострочное)
  - Текст заданий рендерить через `RichText.tsx` (LaTeX + markdown)
- Шаг 3 (после submit): экран «Работа сдана!»
- Header: логотип ВариантУм без навигации и кнопок ЛК

**`src/pages/StudentSubmissionsPage.tsx`** (роут `/projects/:projectId/submissions`)
- Таблица сданных работ: ФИО, вариант, время сдачи
- При клике — детальный вид:
  - Автопроверенные задания: показать ✅/❌
  - OPEN_QUESTION: поле для комментария и оценки учителя, кнопка «Сохранить»

**`src/api/forms.api.ts`** и **`src/api/submissions.api.ts`** — новые API-клиенты

**`src/types/api.ts`** — добавить типы `FormAssignment`, `FormStudent`, `StudentSubmission` и т.д.

### Изменения в существующих файлах

**`src/features/exporter/ExportDialog.tsx`**
Добавить вкладку/кнопку «Онлайн-форма», открывающую `FormExportDialog`.

**`src/pages/LibraryPage.tsx`**
При клике на проект показывать диалог с выбором:
- «Работать с комплектом» → текущее поведение
- «Посмотреть решения учеников» → `/projects/{id}/submissions` (кнопка активна если есть хоть одно активное задание или сданная работа)

**`src/routes.tsx`**
Добавить публичный роут `/form/:token` → `StudentFormPage` вне защищённой зоны.

---

## Документация

После реализации обнови:
- `docs/05_API_спецификация.md` — добавь раздел «13. Онлайн-формы для учеников» со всеми новыми endpoints
- `docs/06_Схема_БД_и_структура_проекта.md` — добавь новые таблицы и новые файлы в дерево структуры
