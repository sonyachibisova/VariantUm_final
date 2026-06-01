# Промпт: Экспорт вариантов как интерактивная форма для учеников (StudentExams)

## 1. Цель

Добавить в ВариантУм возможность экспортировать варианты в виде **интерактивной веб-формы**, на которой ученики заполняют ответы:
- Учитель выбирает экспорт в формат "Форма для учеников"
- Система предлагает выбор: либо распределить варианты по списку учеников (одна ссылка), либо получить список прямых ссылок
- Форма встроена на сайте (при экспорте с сервера) и доступна ученикам по ссылке
- Работы автоматически попадают в личный кабинет учителя, хранятся в библиотеке
- Простые ответы и тесты проверяются автоматически, развёрнутые — учитель проверяет вручную

## 2. Архитектура решения

### 2.1 Backend сущности (добавить в `domain/`)

```
ExamSession (экзаменационная сессия)
├── id: UUID (PK)
├── project_id: UUID (FK → projects) — исходный комплект с вариантами
├── user_id: UUID (FK → users) — учитель, создавший сессию
├── session_token: VARCHAR(64) — уникальный токен для публичной ссылки
├── distribution_type: ENUM (SHARED_LINK | DIRECT_LINKS)
│   SHARED_LINK = одна ссылка со списком учеников (форма просит фамилию)
│   DIRECT_LINKS = каждому ученику своя прямая ссылка на его вариант
├── status: ENUM (ACTIVE | CLOSED | ARCHIVED)
├── created_at: TIMESTAMPTZ
├── expires_at: TIMESTAMPTZ (опционально, если сессия на ограниченное время)

StudentAssignment (распределение варианта ученику)
├── id: UUID (PK)
├── session_id: UUID (FK → exam_sessions)
├── student_surname: VARCHAR(255) — фамилия ученика (для поиска при SHARED_LINK)
├── student_full_name: VARCHAR(500) — полное имя (для отчёта)
├── variant_id: UUID (FK → variants) — какой вариант назначен
├── assignment_token: VARCHAR(64) — персональный токен (для DIRECT_LINKS)
├── created_at: TIMESTAMPTZ

StudentSubmission (ответы ученика)
├── id: UUID (PK)
├── assignment_id: UUID (FK → student_assignments)
├── task_id: UUID (FK → tasks)
├── submitted_answer: TEXT — то, что ввёл ученик
├── answer_type: ENUM (CHOICE | SHORT | EXTENDED)
├── is_correct: BOOLEAN (null если EXTENDED, т.е. не проверена)
│   true = совпадает с правильным ответом (для CHOICE/SHORT)
│   false = не совпадает
│   null = требует проверки учителя (EXTENDED)
├── submitted_at: TIMESTAMPTZ
├── checked_by_teacher: BOOLEAN DEFAULT FALSE
├── teacher_feedback: TEXT (опционально)

SessionStudentList (список учеников для SHARED_LINK — на случай редактирования)
├── id: UUID (PK)
├── session_id: UUID (FK → exam_sessions)
├── list_json: JSONB = [{ "surname": "Иванов", "full_name": "Иван Иванович", "variant_index": 1 }, ...]
├── updated_at: TIMESTAMPTZ
```

### 2.2 REST API endpoints (Backend)

**POST `/projects/{projectId}/export/exam-session`** (новый)
Создание сессии экзамена. Выбор типа распределения и список учеников.

Request:
```json
{
  "distributionType": "SHARED_LINK",  // или "DIRECT_LINKS"
  "students": [
    { "surname": "Иванов", "full_name": "Иван Иванович" },
    { "surname": "Петрова", "full_name": "Петрова Мария" }
  ],
  "expiresAt": "2026-06-15T23:59:59Z"  // опционально
}
```

Response 201:
```json
{
  "sessionId": "uuid-...",
  "projectId": "uuid-...",
  "distributionType": "SHARED_LINK",
  "shareLink": "https://api.variantum.ru/exam/{sessionToken}/form",
  "studentAssignments": [
    {
      "studentSurname": "Иванов",
      "studentFullName": "Иван Иванович",
      "variantIndex": 1,
      "directLink": "https://api.variantum.ru/exam/{assignmentToken}/form"  // для DIRECT_LINKS
    }
  ]
}
```

**GET `/exam/{sessionToken}/form`** (публичный, без JWT)
Рендер HTML-формы для ученика (если SHARED_LINK, форма запрашивает фамилию; если DIRECT_LINKS, переадресует на персональную).

Response 200: HTML с вложенным React-приложением (или простая HTML-форма).

**GET `/exam/{sessionToken}/data`** (публичный JSON)
Получить данные варианта для конкретного ученика (если фамилия передана и совпадает). Используется фронтом после проверки фамилии.

Request query: `?surname=Иванов`
Response 200: { project, variant, tasks[] }

**GET `/exam/{assignmentToken}/data`** (публичный JSON, для DIRECT_LINKS)
Получить данные варианта по персональному токену.

Response 200: { project, variant, tasks[] }

**POST `/exam/{sessionToken}/submit`** (публичный)
Ученик отправляет заполненную форму.

Request:
```json
{
  "surname": "Иванов",
  "submissions": [
    { "taskId": "uuid-...", "answer": "Б)" },
    { "taskId": "uuid-...", "answer": "45" },
    { "taskId": "uuid-...", "answer": "Сурья — индийское божество солнца..." }
  ]
}
```

Response 201: { submissionId, feedback: { correct: N, incorrect: M, pending: K } }

**GET `/projects/{projectId}/exam-results`** (защищено JWT)
Просмотр результатов всех работ по проекту (для учителя).

Response 200:
```json
{
  "sessions": [
    {
      "sessionId": "uuid-...",
      "distributionType": "SHARED_LINK",
      "createdAt": "2026-05-28T10:00:00Z",
      "submissions": [
        {
          "studentFullName": "Иван Иванович",
          "variantIndex": 1,
          "totalTasks": 5,
          "correctAnswers": 3,
          "incorrectAnswers": 1,
          "pendingReview": 1,
          "submittedAt": "2026-05-28T15:30:00Z"
        }
      ]
    }
  ]
}
```

**PATCH `/exam-sessions/{sessionId}/students`** (защищено JWT)
Редактирование списка учеников: добавить новую фамилию → система распределит вариант.

Request:
```json
{
  "students": [
    { "surname": "Иванов", "full_name": "Иван Иванович" },
    { "surname": "Петрова", "full_name": "Петрова Мария" },
    { "surname": "Сидоров", "full_name": "Сидоров Сергей" }  // новый
  ]
}
```

Response 200: обновлённые assignments + новые direct_links.

**GET `/exam-sessions/{sessionId}/submissions`** (защищено JWT)
Просмотр всех работ по конкретной сессии (для учителя).

Response 200: массив работ с результатами и текстом ответов.

**PATCH `/exam-sessions/{sessionId}/submissions/{submissionId}`** (защищено JWT)
Учитель проверяет развёрнутый ответ.

Request:
```json
{
  "is_correct": true,  // или false
  "teacher_feedback": "Хорошо объяснено, но найди ошибку в формулировке"
}
```

Response 200: обновлённая submission.

---

## 3. Frontend компоненты

### 3.1 ExamExportDialog.tsx (новый)
Модалка при выборе экспорта в формат "Форма для учеников".

Шаги:
1. Выбор типа распределения (radio: SHARED_LINK / DIRECT_LINKS)
2. Если SHARED_LINK: textarea/таблица со списком учеников (surname, full_name)
3. Кнопка "Создать сессию"
4. Результат: ссылка для копирования + таблица студентов с их прямыми ссылками (для DIRECT_LINKS)

### 3.2 StudentExamForm.tsx (новый)
Публичная форма для ученика. Встраивается на странице `GET /exam/{token}/form`.

Компоненты:
- Если SHARED_LINK: поле ввода фамилии + кнопка "Начать" → загрузка данных через GET /exam/{sessionToken}/data?surname=...
- Если задача совпадает с ответом (заголовок варианта или вверху): показать его
- Для каждого задания:
  - Если TEST: чекбоксы A), Б), В), Г) (или radio-кнопки по типу)
  - Если SHORT: input поле
  - Если EXTENDED: textarea
- Внизу: кнопка "Отправить работу"
- При отправке: POST /exam/{sessionToken}/submit (или {assignmentToken} для DIRECT_LINKS)
- Показать результат: сколько верных, сколько неверных, сколько на проверку

### 3.3 ExamResultsView.tsx (новый)
В библиотеке (LibraryPage.tsx) добавить: при клике на проект из библиотеки — выпадающее меню с выбором:
- "Работать с комплектом" (текущее поведение: генерировать, редактировать, экспортировать)
- "Посмотреть результаты работ" (если есть сессии)

Результаты показывают:
- Список сессий (когда созданы, статус ACTIVE/CLOSED)
- По каждой сессии: студентов и их результаты (правильно/неправильно/на проверку)
- Клик на студента → просмотр его полной работы с ответами

### 3.4 SubmissionReviewPanel.tsx (новый)
Для учителя: просмотр одной работы, редактирование статусов развёрнутых ответов.

---

## 4. Логика распределения вариантов

При создании `ExamSession` с `distributionType: SHARED_LINK` и списком N студентов:
- Система распределяет варианты **round-robin** по имеющимся вариантам в проекте (если вариантов меньше, чем студентов, некоторые варианты повторяются)
- Создаёт M записей в `StudentAssignment`, где M = количество студентов
- Каждому StudentAssignment назначается variant_id и создаётся уникальный assignment_token

При редактировании списка студентов (добавлена новая фамилия):
- Система определяет, какой вариант был последним распределён
- Следующему студенту назначает следующий вариант по round-robin

---

## 5. Проверка ответов (Backend)

При `POST /exam/{sessionToken}/submit`:
- Для каждого `submission` смотрим `task.taskType`
- Если **TEST** или **SHORT**: сравниваем `submitted_answer` с `task.answer` (простое текстовое совпадение или нормализованное совпадение)
  - Установить `is_correct = true/false`
- Если **EXTENDED**: установить `is_correct = null`, `checked_by_teacher = false`
- Сохранить в `StudentSubmission`
- Вернуть пользователю feedback: "Вы ответили правильно на 3 из 5, 1 ответ неправильный, 1 ожидает проверки учителя"

---

## 6. Integration с существующей архитектурой

1. **В контроллерах:**
   - `ProjectController` → добавить POST endpoint для создания сессии (делегировать в ExamService)
   - Новый `ExamController` для публичных endpoints (GET /exam/{token}/form и т.д.)

2. **В сервисах:**
   - Новый `ExamSessionService` → создание сессии, распределение вариантов, управление списком студентов
   - Новый `ExamSubmissionService` → обработка ответов, проверка, сохранение

3. **В Frontend:**
   - В `ExportDialog.tsx` добавить ещё один formат: "Форма для учеников" (кнопка/tab наравне с PDF/DOCX)
   - Клик → открывает `ExamExportDialog.tsx`
   - В LibraryPage.tsx: у каждого проекта добавить контекстное меню с опцией "Посмотреть результаты" (если есть сессии)

4. **В БД (Flyway-миграция):**
   - Создать таблицы: `exam_sessions`, `student_assignments`, `student_submissions`, `session_student_lists`
   - Индексы на session_token, assignment_token, user_id

---

## 7. Примечания по UX (простота для учителя)

1. **На этапе создания сессии:** большие кнопки, простой выбор типа распределения, явный ввод фамилий
2. **При отправке работы ученика:** четкое сообщение "Работа отправлена, результат записан", не техничные ошибки
3. **В кабинете учителя:** при просмотре результатов показывать наглядную таблицу со статусом каждого ученика (зелёный/красный/жёлтый)
4. **Редактирование списка:** простая форма "Добавить ещё одного ученика", система сама распределит вариант

---

## 8. Стек и инструменты

- **Backend:** Java 21, Spring Boot 3.2, JPA, PostgreSQL
- **Frontend:** React, TypeScript, Tailwind CSS, TanStack Query
- **Парсинг ответов:** простое текстовое совпадение для SHORT/TEST; EXTENDED требует ручной проверки

---

## 9. Порядок реализации (phase)

1. **Backend Phase 1:** БД (миграция), entity, repositories
2. **Backend Phase 2:** Services (ExamSessionService, ExamSubmissionService), контроллеры
3. **Frontend Phase 1:** ExamExportDialog.tsx, логика создания сессии
4. **Frontend Phase 2:** StudentExamForm.tsx, форма для ученика, отправка результатов
5. **Frontend Phase 3:** ExamResultsView.tsx, просмотр результатов в кабинете
6. **Backend Phase 3:** PATCH для редактирования списка студентов, review-endpoints
7. **Frontend Phase 4:** SubmissionReviewPanel.tsx, проверка учителем развёрнутых ответов

---

## 10. Критерии приёмки

- ✅ Учитель может выбрать экспорт в формате "Форма для учеников"
- ✅ Учитель может выбрать тип распределения (SHARED_LINK / DIRECT_LINKS)
- ✅ При SHARED_LINK: одна ссылка, ученик вводит фамилию, форма подбирает его вариант
- ✅ При DIRECT_LINKS: учитель получает список прямых ссылок на варианты
- ✅ Ученик заполняет форму (выбор, ввод, textarea в зависимости от типа)
- ✅ Система автоматически проверяет SHORT и TEST ответы
- ✅ Работа отправляется в кабинет учителя, хранится в библиотеке рядом с комплектом
- ✅ Учитель видит результаты (правильно/неправильно/на проверку) по каждому ученику
- ✅ Учитель может вручную проверить развёрнутые ответы и добавить feedback
- ✅ Учитель может редактировать список учеников (добавлять), система переназначает варианты

---

## 11. Файлы для создания/изменения

**Backend (Java):**
- `domain/ExamSession.java` (новая entity)
- `domain/StudentAssignment.java` (новая entity)
- `domain/StudentSubmission.java` (новая entity)
- `domain/SessionStudentList.java` (новая entity)
- `repository/ExamSessionRepository.java`
- `repository/StudentAssignmentRepository.java`
- `repository/StudentSubmissionRepository.java`
- `service/ExamSessionService.java` (новый)
- `service/ExamSubmissionService.java` (новый)
- `controller/ExamController.java` (новый)
- `dto/request/CreateExamSessionRequest.java`
- `dto/response/ExamSessionResponse.java`
- `dto/response/StudentSubmissionResponse.java`
- `resources/db/migration/V3__add_exam_tables.sql` (Flyway миграция)

**Frontend (React/TypeScript):**
- `features/exporter/ExamExportDialog.tsx` (новый)
- `components/StudentExamForm.tsx` (новый)
- `features/library/ExamResultsView.tsx` (новый)
- `components/SubmissionReviewPanel.tsx` (новый)
- `api/exam.api.ts` (новый файл с API-методами)
- Обновить `ExportDialog.tsx` → добавить кнопку "Форма для учеников"
- Обновить `LibraryPage.tsx` → добавить меню "Посмотреть результаты"
- Обновить `types/api.ts` → добавить типы ExamSession, StudentSubmission и т.д.

---

## Итоговый UX-сценарий

1. Учитель генерирует 10 вариантов комплекта по эталону или критериям
2. Нажимает "Экспорт" → выбирает "Форма для учеников"
3. Выбирает: "Распределить по списку учеников" (SHARED_LINK) или "Прямые ссылки" (DIRECT_LINKS)
4. **Вариант SHARED_LINK:** вводит список фамилий (Иванов, Петрова, Сидоров, ...) → система распределяет варианты 1, 2, 3, ... → получает одну ссылку
5. Учитель отправляет эту ссылку ученикам (в чат, по email)
6. **Ученик переходит по ссылке:**
   - Видит форму "Введите фамилию"
   - Вводит "Иванов"
   - Система проверяет, находит, открывает вариант 1
   - Ученик видит задания, заполняет ответы
   - Нажимает "Отправить"
   - Система сразу показывает: "Вы ответили правильно на 3 вопроса, неправильно на 1, 1 требует проверки учителя"
7. **В кабинете учителя:**
   - В библиотеке появляется либо новый пункт, либо меню к существующему комплекту
   - Клик "Посмотреть результаты" → таблица учеников и их оценок
   - Клик на ученика → его полная работа, учитель видит его ответы
   - Для развёрнутых ответов: кнопка "Проверить", введение оценки/комментария
8. **Редактирование списка:** если добавился новый ученик, учитель вводит его фамилию, система распределит следующий вариант
