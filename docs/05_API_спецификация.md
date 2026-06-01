# ВариантУм — спецификация REST API

> Контракт между Frontend и Backend. Используется при разработке обеих сторон параллельно.

**Базовый URL:** `https://api.variantum.ru/v1` (локально: `http://localhost:8080/api/v1`)
**Аутентификация:** JWT в httpOnly cookies (`access_token`, `refresh_token`)
**Формат данных:** JSON, UTF-8
**Документация в Swagger UI:** `/swagger-ui.html`

### Статусы реализации

В заголовках разделов проставлены метки:
- ✅ **реализовано** — работает в текущей сборке;
- 🟡 **частично** — есть на бэкенде, но без REST/UI (или наоборот);
- 🔜 **в разработке** — запланировано, контракт может измениться.

> **Принцип продукта.** ВариантУм рассчитан на учителей, которым тяжело даются новые технологии.
> Поэтому API спроектирован на **мягкую деградацию**: вместо технических ошибок сервис старается
> вернуть хоть какой-то полезный результат (см. `/analyze/split`, генерацию с фолбэком моделей).
> Сложные процессы (стриминг, очереди) скрыты — фронт работает по простой схеме «запрос → опрос статуса».

---

## 1. Аутентификация ✅

### POST `/auth/register`
Регистрация нового учителя.

**Request:**
```json
{
  "email": "teacher@school.ru",
  "password": "secure_password_8_chars",
  "fullName": "Иванова Мария Петровна",
  "role": "TEACHER"
}
```

**Response 201:**
```json
{
  "userId": "uuid-...",
  "email": "teacher@school.ru",
  "fullName": "Иванова Мария Петровна"
}
```
Также устанавливает cookies с JWT.

**Errors:** 400 (валидация), 409 (email занят)

### POST `/auth/login`
**Request:** `{ "email": "...", "password": "..." }`
**Response 200:** `{ "userId": "...", "email": "...", "fullName": "..." }` + cookies
**Errors:** 401 (неверный логин/пароль)

### POST `/auth/logout`
**Response 204** + очистка cookies

### POST `/auth/refresh`
Обновление access_token через refresh_token из cookies.
**Response 200** + новые cookies.

### GET `/auth/me`
Текущий пользователь.
**Response 200:** `{ "userId": "...", "email": "...", "fullName": "..." }`

---

## 2. Загрузка и парсинг файлов ✅

### POST `/files/upload`
Загрузка файла (PDF, DOCX, DOC, TXT, RTF, JPG, PNG, GIF, BMP, TIFF, WEBP). Лимит 10 MB.

**Request:** `multipart/form-data` с полем `file`. Необязательный query-параметр `?clean=false`
отключает LLM-очистку текста документов (быстрее, но без исправления ошибок парсинга).

**Логика распознавания:**
- **Изображения** → GigaChat Vision: загрузка в `POST /files` (`purpose=general`) + `attachments`
  в `chat/completions`. Распознаёт текст, формулы (LaTeX), таблицы (Markdown) и описывает графики/чертежи
  блоками `[РИСУНОК: ...]`. При сбое Vision — фолбэк на Tesseract OCR + LLM-очистка.
- **PDF/DOCX/TXT** → парсинг (PDFBox/POI), затем прогон текста через GigaChat для исправления
  ошибок распознавания и нормализации формул в LaTeX.

**Response 200:**
```json
{
  "fileId": "uuid-...",
  "fileName": "task.jpg",
  "mimeType": "image/jpeg",
  "extractedText": "Полный распознанный текст с формулами в LaTeX, таблицами и [РИСУНОК: ...]"
}
```
Поле `parserUsed` сохраняется в БД: `gigachat-vision` | `tesseract+cleanup` | `parser+cleanup` | `parser`.

**Errors:** 400 (неподдерживаемый формат/пустой файл), 413 (превышение размера)

---

## 3. Анализ эталонного задания (Режим A) ✅

### POST `/analyze/task`
Анализ задания через GigaChat.

**Request:**
```json
{
  "text": "Полный текст задания...",
  "hintSubject": "math" // опционально, подсказка от UI
}
```

**Response 200:**
```json
{
  "subject": "math",
  "grade": 7,
  "topic": "Линейные уравнения",
  "taskType": "PROBLEM",
  "difficulty": 3,
  "estimatedMinutes": 4,
  "stepsCount": 3,
  "invariants": ["число операций", "тип ответа", "линейная структура"],
  "variableElements": [
    { "type": "NUMBER", "examples": ["коэффициенты a, b"] },
    { "type": "CONTEXT", "examples": ["сюжет задачи"] }
  ]
}
```

**Errors:** 422 (не удалось проанализировать), 429 (rate limit)

### POST `/analyze/split`
Разбивает «сырой» текст (склейку из нескольких файлов и/или ручного ввода) на отдельные задания
силами GigaChat. В отличие от регулярок, LLM отличает варианты ответа теста (`1) 2) 3) 4)`)
и подпункты от самостоятельных заданий, понимает разную нумерацию (`1.`, `№2`, `Задача 3`)
и отделяет ответы/решения от условия. Используется редактором комплекта (`/editor`) при входе.

**Request:**
```json
{
  "text": "Текст с одним или несколькими заданиями (возможно с шапкой, тестами, ответами)..."
}
```

**Response 200:**
```json
{
  "tasks": [
    {
      "text": "Полный дословный текст задания (с вариантами ответа теста, если это тест)",
      "answer": "Ответ/решение, если он был в исходном тексте, иначе null"
    }
  ]
}
```

> Поведение при сбое LLM (taймаут/невалидный JSON/исчерпана квота): бэкенд возвращает текст
> одним заданием (`tasks` из одного элемента), фронт дополнительно использует запасное
> разбиение по пустым строкам и ручную кнопку «Разбить по абзацам». Endpoint не падает с ошибкой.

**Errors:** 429 (rate limit) — в остальных случаях деградирует до одного задания.

---

## 4. Генерация (центральный endpoint) ✅

### POST `/projects`
Создаёт новый проект (комплект вариантов) и **синхронно** генерирует его через GigaChat.

> **Как это работает на самом деле.** Генерация выполняется внутри одного запроса и возвращает
> уже готовый проект со статусом `READY` (или `FAILED`, если LLM не справился). Промежуточного
> SSE-стриминга нет — это упрощает и фронт, и эксплуатацию. Если генерация затягивается, фронт
> повторно запрашивает `GET /projects/{projectId}` пока `status == "GENERATING"` (опрос раз в 3 сек).
> Модельная стратегия с авто-фолбэком (Pro → при 402-квоте → бесплатная `GigaChat`) и починка
> «грязного» JSON выполняются прозрачно — клиенту не нужно ничего знать о моделях.

**Request (Режим A — по эталону):**
```json
{
  "mode": "FROM_REFERENCE",
  "referenceText": "Текст эталонного задания...",
  "analysis": {
    "subject": "math",
    "grade": 7,
    "topic": "Линейные уравнения",
    "taskType": "PROBLEM",
    "difficulty": 3
  },
  "params": {
    "variantsCount": 4,
    "tasksPerVariant": 1,
    "variationTypes": ["NUMBERS", "CONTEXT", "NAMES"],
    "fixedElements": [],
    "difficultyGradation": "EQUAL",
    "customPrompt": "Избегай отрицательных чисел"
  }
}
```

> `taskType` принимает значения `PROBLEM` | `TEST` | `EXERCISE` | `OPEN_QUESTION` | `MIXED`.
> `MIXED` («Смешанный») — модель сама подбирает сочетание форматов внутри варианта.

**Request (Режим B — с нуля):**
```json
{
  "mode": "FROM_CRITERIA",
  "criteria": {
    "subject": "math",
    "grade": 8,
    "topic": "Квадратные уравнения",
    "taskType": "PROBLEM",
    "tasksPerVariant": 5,
    "targetTimeMinutes": 25,
    "difficulty": 3
  },
  "params": {
    "variantsCount": 3,
    "difficultyGradation": "ASCENDING",
    "difficultyLevels": [2, 3, 4], // если gradation=CUSTOM
    "customPrompt": "Сделай 5-ю задачу с параметром"
  }
}
```

**Response 201 Created:** полный объект проекта (как в `GET /projects/{projectId}` ниже),
обычно уже со `status: "READY"`. При сбое генерации — `status: "FAILED"` (HTTP остаётся 201,
проект создан, но без вариантов; фронт показывает экран «Попробовать снова»).

> 🔜 **SSE-стриминг** (`/projects/{id}/stream`) и асинхронная очередь генерации — в дорожной карте.
> Сейчас генерация синхронная; для долгих комплектов фронт использует опрос (см. ниже).

### GET `/projects/{projectId}` ✅
Получение состояния проекта. Фронт опрашивает этот endpoint, пока `status == "GENERATING"`.

**Response 200:**
```json
{
  "projectId": "uuid-...",
  "title": "Линейные уравнения, 7 класс",
  "mode": "FROM_REFERENCE",
  "status": "READY",
  "subject": "math",
  "grade": 7,
  "topic": "Линейные уравнения",
  "referenceText": "Исходный текст эталона (если режим FROM_REFERENCE)...",
  "referenceFileId": "uuid-...",
  "referenceFileName": "kontrolnaya.pdf",
  "createdAt": "2026-05-21T10:30:00Z",
  "updatedAt": "2026-05-21T10:45:00Z",
  "variants": [
    {
      "variantId": "uuid-...",
      "index": 1,
      "difficulty": 3,
      "tasks": [
        {
          "taskId": "uuid-...",
          "text": "...",
          "answer": "...",
          "steps": 3,
          "estimatedMinutes": 4,
          "difficulty": 3,
          "taskType": "PROBLEM",
          "figure": null,
          "photoUrl": null
        }
      ],
      "totalEstimatedMinutes": 4
    }
  ],
  "recommendations": []
}
```

Поля:
- `status` — `GENERATING` | `READY` | `FAILED`.
- `referenceFileId` / `referenceFileName` — присутствуют, если проект создан из загруженного файла
  (см. `GET /projects/{id}/reference-file` — скачивание оригинала).
- `photoUrl` в задании — URL или base64 data-URL прикреплённого учителем изображения (`null` — нет).
- `figure` — структурированный чертёж/график для SVG-рендера (`null` — нет; форматы — в разделе 12).
- `recommendations` — 🟡 механизм есть, но генерация рекомендаций **временно отключена** ради экономии
  лимитов GigaChat; поле возвращается пустым массивом.

### GET `/projects/{projectId}/reference-file` ✅
Скачивание исходного файла, который учитель загрузил при создании проекта (стрим из MinIO).

**Response 200:** бинарный файл, `Content-Disposition: attachment; filename*=UTF-8''<имя>`.
**Errors:** 404 — у проекта нет привязанного файла либо файл отсутствует в хранилище.

### POST `/projects/{projectId}/reparse-reference` ✅
Повторное распознавание загруженного файла. Перечитывает файл из хранилища и заново прогоняет
через тот же пайплайн (Vision → фолбэк OCR+cleanup для изображений; парсер+LLM-cleanup для PDF/DOCX).
Результат перезаписывает `uploaded_files.parsed_text` и `projects.reference_text`.

**Request:** тело не требуется.  
**Response 200:** обновлённый проект целиком (как `GET /projects/{id}`).  
**Errors:** 404 (проект без файла / файл не найден в хранилище), 500 (ошибка распознавания).

---

## 5. Редактирование вариантов ✅

> Реализация: все методы этого раздела возвращают **обновлённый проект целиком**
> (`ProjectDetailResponse`, как `GET /projects/{id}`) — фронтенду удобно сразу
> перерисовать комплект одним обновлением, без ручной сшивки состояния.

### PATCH `/projects/{projectId}/variants/{variantId}`
Ручное обновление варианта (после правки в редакторе).

**Request:**
```json
{
  "tasks": [
    { "taskId": "uuid-...", "text": "Новый текст", "answer": "Новый ответ", "photoUrl": "data:image/jpeg;base64,..." }
  ]
}
```

`photoUrl` в задании необязателен: строка — добавить/заменить фото, `""` (пустая строка) — удалить
прикреплённое фото, отсутствие поля — не трогать. Поддерживаются и base64 data-URL, и обычные URL.

**Response 200:** обновлённый проект целиком.

### POST `/projects/{projectId}/variants/{variantId}/regenerate`
Перегенерация одного варианта целиком.

**Request:** `{ "customPrompt": "опционально" }`
**Response 200:** новый вариант.

### POST `/projects/{projectId}/variants/{variantId}/ai-edit`
Промпт-правка одного варианта.

**Request:**
```json
{
  "prompt": "Сделай реалистичные числа в задаче 3"
}
```

**Response 200:** обновлённый вариант + новая запись в истории версий.

### POST `/projects/{projectId}/ai-edit-all`
Промпт-правка всего комплекта.

**Request:**
```json
{
  "prompt": "Замени все автомобили на поезда"
}
```

**Response 200:** обновлённый проект + новая запись в истории версий.

### POST `/projects/{projectId}/variants`
Добавить ещё один вариант.

**Request:** `{ "difficulty": 3, "customPrompt": "опционально" }`
**Response 201:** созданный вариант.

### POST `/projects/{projectId}/variants/{variantId}/tasks/{taskId}/regenerate` ✅
Перегенерация одного задания внутри варианта. GigaChat получает весь вариант и инструкцию
заменить только указанное задание, оставив остальные без изменений.

**Request:** тело не требуется.
**Response 200:** обновлённый проект целиком.

### DELETE `/projects/{projectId}/variants/{variantId}`
Удаление варианта.
**Response 204**

---

## 6. История версий ✅

> **Статус.** Бэкенд **сохраняет снимок** комплекта при каждом значимом действии (генерация,
> ручная/AI-правка, перегенерация, добавление/удаление варианта) в таблицу `project_versions`.
> REST-эндпоинты просмотра и отката и UI «История» (кнопка в панели действий «сравнения вариантов»,
> компонент `HistoryPanel.tsx`) — **реализованы**. Откат не списывает лимит нейросети.

### GET `/projects/{projectId}/history` ✅
Список версий комплекта (новые сверху).

**Response 200:**
```json
{
  "versions": [
    {
      "versionId": "uuid-...",
      "action": "GENERATED",
      "description": "Первоначальная генерация",
      "createdAt": "2026-05-21T10:30:00Z"
    },
    {
      "versionId": "uuid-...",
      "action": "AI_EDIT_ALL",
      "description": "Замена контекста на поезда",
      "createdAt": "2026-05-21T10:35:00Z"
    }
  ]
}
```
`action` ∈ `GENERATED | MANUAL_EDIT | AI_EDIT_SINGLE | AI_EDIT_ALL | REGENERATED | VARIANT_ADDED | VARIANT_DELETED | RESTORED`.

### POST `/projects/{projectId}/history/{versionId}/restore` ✅
Откат к указанной версии: восстанавливает варианты/задания из снимка и пишет новую версию `RESTORED`.
**Response 200:** проект целиком в состоянии этой версии (как `GET /projects/{id}`).

---

## 7. Экспорт ✅

Файл отдаётся напрямую как вложение (`Content-Disposition: attachment`), без промежуточного
хранилища и presigned-ссылок — работает офлайн и не зависит от MinIO. Формулы из LaTeX
конвертируются в читаемый Unicode-вид (`x^2` → `x²`, `\frac{a}{b}` → `(a)/(b)`), чертежи `figure`
вставляются как inline-SVG, прикреплённые фото — как изображения.

### POST `/projects/{id}/export/pdf`
### POST `/projects/{id}/export/docx`

**Request (тело необязательно):**
```json
{
  "includeFields": ["studentName", "className", "date", "grade", "parentSignature"],
  "layout": "ONE_PER_PAGE",   // или "CONTINUOUS"
  "includeAnswers": true,      // добавить раздел «Ответы (для учителя)»
  "showDifficulty": false      // подписывать уровень сложности у каждого варианта
}
```

**Response 200:** бинарный файл.
- PDF: `Content-Type: application/pdf`
- DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition: attachment; filename*=UTF-8''<тема>.<ext>`

Поля `includeFields`: `studentName` (Ф.И.О.), `className` (класс), `date` (дата),
`grade` (оценка), `parentSignature` (подпись родителя) — печатаются в шапке каждого варианта.
`showDifficulty: true` добавляет к заголовку варианта метку «базовый/средний/сложный».

> **Экспорт в JPEG** реализован **на стороне фронтенда** (`html2canvas` рендерит блок вариантов
> в картинку и скачивает `.jpg`) — отдельного серверного endpoint нет. Для учителя это «ещё одна
> кнопка формата» в том же окне экспорта, чтобы быстро вставить вариант в чат/презентацию.

---

## 8. Библиотека ✅

### GET `/projects`
Список проектов пользователя.

**Query parameters:** `?subject=math&grade=7&q=уравнения&page=0&size=20`

**Response 200:**
```json
{
  "projects": [
    {
      "projectId": "uuid-...",
      "title": "Линейные уравнения, 7 класс",
      "subject": "math",
      "grade": 7,
      "variantsCount": 4,
      "createdAt": "2026-05-21T10:30:00Z"
    }
  ],
  "totalPages": 5,
  "totalElements": 87
}
```

### DELETE `/projects/{projectId}`
Удаление проекта.
**Response 204**

---

## 9. Системные

### GET `/health` ✅
Health check для мониторинга.
**Response 200:** `{ "status": "UP", "service": "variantum-backend", "version": "0.1.0" }`

### GET `/limits/me` ✅
Дневной лимит обращений к нейросети **в процентах** (старт 100%/день, ежедневный сброс),
плюс расценки действий — чтобы фронт показывал остаток (бейдж `LimitsBadge`) и примерную
стоимость каждого действия (тултипы у кнопок/полей промпта).

**Response 200:**
```json
{
  "percentRemaining": 87.3,
  "percentUsed": 12.7,
  "limit": 100,
  "resetAt": "2026-06-02T00:00:00+03:00",
  "costs": {
    "parsePerFile": 2.0,
    "taskBase": 0.2,
    "taskFormula": 0.35,
    "taskGraph": 0.5,
    "taskAvg": 0.35
  }
}
```

> **Статус.** Реализовано (`RateLimitService` + `LlmCostService`). Лимит **enforced**: при остатке 0%
> любое обращение к нейросети возвращает `429` с человекочитаемым сообщением «Дневной лимит исчерпан,
> обновится завтра». Сброс — ежедневно в 00:00 (Europe/Moscow). Модель стоимости (в % дневного лимита):
> - парсинг файла — `2%` за файл;
> - одно задание — `0.2%` (текст) / `0.35%` (есть формула) / `0.5%` (есть график) — берётся максимум;
> - генерация комплекта — сумма по всем заданиям; правка одного варианта — сумма по его заданиям;
>   правка всего комплекта — сумма по всем вариантам; откат версии — **бесплатно**.

---

## 10. Коды ошибок

| HTTP | Когда | Тело ответа |
|---|---|---|
| 400 | Ошибка валидации запроса | `{ "error": "VALIDATION", "fields": [...] }` |
| 401 | Не авторизован | `{ "error": "UNAUTHORIZED" }` |
| 403 | Доступ запрещён (чужой ресурс) | `{ "error": "FORBIDDEN" }` |
| 404 | Не найдено | `{ "error": "NOT_FOUND" }` |
| 413 | Файл слишком большой | `{ "error": "FILE_TOO_LARGE", "maxSize": 10485760 }` |
| 422 | LLM не справился с задачей | `{ "error": "LLM_FAILURE", "message": "...", "retryable": true }` |
| 429 | Rate limit | `{ "error": "RATE_LIMIT", "retryAfter": 3600 }` |
| 500 | Внутренняя ошибка | `{ "error": "INTERNAL" }` |
| 503 | GigaChat недоступен | `{ "error": "GIGACHAT_UNAVAILABLE" }` |

---

## 11. Лимиты по умолчанию

| Параметр | Значение |
|---|---|
| Размер файла | 10 MB |
| Длина текста эталона | 10 000 символов |
| Длина custom-промпта | 1 000 символов |
| Количество вариантов | 2–10 |
| Заданий в варианте | 1–20 |
| Запросов к LLM | 30 в час на пользователя (🔜 значение настраивается, enforce — в разработке) |
| Размер всех проектов одного пользователя | 100 MB |

> Параметр запросов к LLM задаётся переменной окружения `RATE_LIMIT_LLM_PER_HOUR`. Сейчас он
> используется только для расчёта остатка-заглушки; жёсткое ограничение появится вместе с `/limits/me`.

---

## 12. Контракты — заметки для frontend

- Генерация синхронная: после `POST /projects` опрашивать `GET /projects/{id}` раз в ~3 сек,
  пока `status == "GENERATING"` (SSE — в дорожной карте). Показывать понятный текст ожидания,
  а не «голый» спиннер: «GigaChat подбирает задания, это занимает 10–30 секунд».
- Все timestamp — ISO 8601 в UTC.
- UUID v4 для всех ID.
- Пагинация: `page` (0-based), `size` (default 20), параметры query.
- Сортировка: `?sort=createdAt,desc`.
- Ошибки LLM показывать «по-человечески» с действием (попробовать снова / уменьшить число
  вариантов), а не кодом 422/503 — целевая аудитория не айтишники.

### Поле `figure` в задании (🆕)

Поле `Task.figure` содержит структурированное описание геометрической фигуры или графика.
Если `null` — задание не содержит чертежа. Фронт должен рендерить SVG через `FigureSvg.tsx`.

```json
// Треугольник
"figure": {
  "type": "triangle",
  "labels": ["A", "B", "C"],
  "sides": {"AB": 5, "BC": 12, "AC": 13},
  "angles": {"A": 67, "B": 90, "C": 23}
}

// Координатная плоскость с графиком
"figure": {
  "type": "coordinatePlane",
  "xRange": [-5, 5],
  "yRange": [-5, 5],
  "functions": [{"expr": "2*x+1", "label": "y = 2x+1"}],
  "points": [{"x": 2, "y": 5, "label": "A"}]
}

// Числовая ось
"figure": {
  "type": "numberLine",
  "min": -3, "max": 7,
  "marked": [{"value": 2, "label": "a", "open": false}],
  "segments": [{"from": 2, "to": 6}]
}

// Универсальная геометрия (произвольная фигура из именованных точек)
"figure": {
  "type": "geometry",
  "points": {"A": [0, 0], "B": [4, 0], "C": [4, 3], "D": [0, 3]},
  "segments": ["A-B", "B-C", "C-D", "D-A", "A-C"],
  "rightAngle": ["B"],
  "labels": [{"x": 2, "y": 1.5, "text": "α"}]
}
```

Поддерживаемые типы (6): `triangle`, `quadrilateral`, `circle`, `coordinatePlane`, `numberLine`,
`geometry`. Тип `geometry` — универсальный: произвольные именованные точки, рёбра `"A-B"`, маркеры
прямого угла и доп. метки. Рендер: предпросмотр — `FigureSvg.tsx`, экспорт PDF — `FigureSvgRenderer.java`
(оба рисуют независимо, правятся синхронно). Полное описание форматов — в
`docs/07_Промпты_для_GigaChat.md`, раздел «Структурированные фигуры».

---

## 13. Онлайн-формы для учеников ✅

Позволяет учителю создать ссылку, по которой ученики проходят задание онлайн и сдают ответы.
Два режима: **CLASS_LIST** (одна ссылка, ученик вводит фамилию) и **INDIVIDUAL_LINKS** (отдельная ссылка на каждый вариант).

### Публичные endpoints (без авторизации) — `/form/**`

#### GET `/form/{token}`
Определяет тип токена и возвращает данные для ученика.

**Response 200:**
```json
{
  "tokenType": "CLASS_LIST",   // или "VARIANT"
  "assignmentId": "uuid-...",
  "projectTitle": "Квадратные уравнения, 8 класс",
  // если tokenType = VARIANT:
  "variantIndex": 2,
  "tasks": [
    { "taskId": "uuid-...", "text": "...", "taskType": "PROBLEM", "estimatedMinutes": 5 }
  ]
}
```

- `tokenType = CLASS_LIST` — ученик должен ввести фамилию (шаг 1 на `StudentFormPage`).
- `tokenType = VARIANT` — задания доступны сразу (INDIVIDUAL_LINKS или персональная ссылка ученика).

**Errors:** 404 — токен не найден или истёк.

#### POST `/form/{token}/resolve-name`
Для режима CLASS_LIST: ученик вводит фамилию, система ищет совпадение и возвращает его вариант.

**Request:** `{ "name": "Иванов" }`

**Response 200:**
```json
{
  "studentId": "uuid-...",
  "studentName": "Иванов Иван",
  "variantId": "uuid-...",
  "variantIndex": 1,
  "tasks": [{ "taskId": "uuid-...", "text": "...", "taskType": "TEST", "estimatedMinutes": 3 }]
}
```

Поиск: `LIKE %name%`, case-insensitive. Если не найдено — **404** `"Фамилия не найдена, попробуйте ещё раз"`.

#### POST `/form/{token}/submit`
Сдача работы учеником.

**Request:**
```json
{
  "studentName": "Иванов Иван",
  "studentId": "uuid-...",
  "answers": [
    { "taskId": "uuid-...", "answer": "А)" },
    { "taskId": "uuid-...", "answer": "42" }
  ]
}
```

**Response 200:** объект `StudentSubmission` (см. ниже).

Автопроверка при сохранении:
- `TEST` / `PROBLEM` / `EXERCISE`: `correct = answer.trim().equalsIgnoreCase(tasks.answer.trim())`.
- `OPEN_QUESTION`: `correct = null` (учитель проверяет вручную).
- Поле `auto_score` в БД: `[{"taskId":"...","correct":true/false/null}]`.

---

### Приватные endpoints (JWT) — создание и просмотр заданий

#### POST `/projects/{projectId}/forms`
Создать задание для учеников.

**Request:**
```json
{
  "mode": "CLASS_LIST",         // CLASS_LIST | INDIVIDUAL_LINKS
  "students": ["Иванов Иван", "Петрова Мария"]   // только для CLASS_LIST
}
```

**Response 201:**
```json
{
  "id": "uuid-...",
  "projectId": "uuid-...",
  "mode": "CLASS_LIST",
  "accessToken": "hex64...",    // CLASS_LIST: единственная ссылка; null для INDIVIDUAL_LINKS
  "createdAt": "...",
  "students": [
    { "id": "uuid-...", "fullName": "Иванов Иван", "variantId": "uuid-...", "variantIndex": 1, "accessToken": "hex64..." }
  ],
  "variantTokens": []           // для INDIVIDUAL_LINKS — список токенов по вариантам
}
```

#### GET `/projects/{projectId}/forms`
Список заданий по проекту.
**Response 200:** массив объектов `FormAssignment`.

#### PATCH `/forms/{assignmentId}/students`
Добавить учеников в задание CLASS_LIST.
**Request:** `{ "addStudents": ["Сидоров Алексей"] }`
**Response 200:** обновлённый `FormAssignment`.

#### GET `/projects/{projectId}/submissions`
Список сданных работ по проекту.
**Response 200:**
```json
[
  {
    "id": "uuid-...",
    "assignmentId": "uuid-...",
    "variantId": "uuid-...",
    "variantIndex": 1,
    "studentName": "Иванов Иван",
    "answersJson": "[{\"taskId\":\"...\",\"answer\":\"А)\"}]",
    "autoScore": "[{\"taskId\":\"...\",\"correct\":true}]",
    "teacherReview": null,
    "submittedAt": "2026-05-31T10:00:00Z"
  }
]
```

#### GET `/submissions/{submissionId}`
Детали одной работы.
**Response 200:** объект `StudentSubmission` (как выше).

#### PATCH `/submissions/{submissionId}/review`
Учитель сохраняет комментарии и оценки к открытым вопросам.
**Request:** `{ "taskReviews": [{ "taskId": "uuid-...", "comment": "Хорошо!", "grade": "5" }] }`
**Response 200:** обновлённый `StudentSubmission`.
