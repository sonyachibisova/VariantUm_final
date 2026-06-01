# ВариантУм

http://186.246.10.228 - десктопная и мобильная версия.

**ИИ-генератор вариантов школьных заданий на базе GigaChat.**
Хакатон СберОбразование × Школа 21, кейс №4.

> **Слоган:** Один пример — десять вариантов. Один промпт — целая контрольная.

---

## О проекте

ВариантУм помогает учителю за минуты получить несколько **равносложных** вариантов одного задания
вместо часа ручной работы. Сервис решает не задачу «сгенерировать текст» (это умеет любой LLM), а
методическую: сохранить дидактическую цель и одинаковую сложность вариантов, распознать реальные
школьные материалы (PDF/DOCX/фото) и держать данные учителя изолированно.

**Два режима работы**
- **По эталону** — загрузить готовое задание (текст, PDF, DOCX или фото) → сервис анализирует
  структуру и размножает в N вариантов того же типа и сложности.
- **По критериям** — задать предмет, класс, тему, тип, число вариантов, время и сложность →
  сервис генерирует комплект с нуля.

**Ключевые возможности**
- Дополнительный промпт-пожелание учителя на любом этапе («задачи про космос», «без дробей»).
- Градация сложности: одинаковая / возрастающая / произвольная.
- Три способа правки: ручная (WYSIWYG + формулы), промпт к одному варианту, промпт ко всему комплекту.
- Параллельный просмотр с подсветкой различий, перегенерация и добавление вариантов.
- Распознавание фото и формул через GigaChat Vision (Tesseract OCR — офлайн-фолбэк).
- Экспорт в PDF/DOCX с полями ФИО/класс/дата и отдельным комплектом ответов для учителя.
- Библиотека комплектов с поиском, история версий (снимки в БД).


---

## Стек

| Слой | Технологии |
|---|---|
| **Backend** | Java 21, Spring Boot 3.2 (Web, WebFlux, Security/JWT, Data JPA, Data Redis) |
| **Frontend** | React 18 + TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, Tiptap, KaTeX |
| **БД и хранилище** | PostgreSQL 16 (+ Flyway), Redis 7, MinIO (S3-совместимое) |
| **LLM** | GigaChat (мультимодель: `GigaChat` Lite + `GigaChat-2-Pro`), авто-фолбэк 402 → Lite |
| **Парсинг** | Apache PDFBox, Apache POI, Tess4J (Tesseract OCR, русская модель) |
| **Экспорт** | iText 7 (PDF), docx4j (DOCX) |
| **Инфраструктура** | Docker + docker-compose, Nginx (reverse proxy + статика) |

---

## Структура репозитория

```
variantum/
├── backend/            Spring Boot приложение (Maven, Java 21)
├── frontend/           React + Vite + TypeScript
├── docs/               Проектная документация (01–08) + materials/
├── docker-compose.yml  postgres + redis + minio + backend + frontend
├── .env.example        пример переменных окружения
└── README.md
```

---

## Запуск

### Требования
- **Docker** + **docker compose** (для полного стека).
- Для разработки без Docker — **JDK 21** и **Node.js 20+**.
- **Ключ GigaChat** (Client ID + Client Secret) — получить в
  [GigaChat Studio](https://developers.sber.ru/studio/workspaces/).

### Шаг 1. Настроить переменные окружения

```bash
cp .env.example .env
```

Заполните в `.env` обязательные значения:

| Переменная | Назначение |
|---|---|
| `GIGACHAT_CLIENT_ID` | UUID клиента из GigaChat Studio |
| `GIGACHAT_CLIENT_SECRET` | секрет клиента (UUID, **не** base64-строка) |
| `JWT_SECRET` | длинная случайная строка — `openssl rand -base64 64` |
| `DB_PASSWORD` | пароль PostgreSQL |
| `MINIO_SECRET_KEY` | секрет MinIO |

> **Важно про модели.** Бесплатная (Lite) модель называется именно `GigaChat` —
> `GIGACHAT_MODEL_LITE=GigaChat`. Имя `GigaChat-2-Lite` **не существует** (API вернёт 404).
> Основная модель — `GIGACHAT_MODEL=GigaChat-2-Pro`. См. `docs/08_GigaChat_Модели_и_Токены.md`.

### Шаг 2а. Полный стек одной командой (демо/прод)

```bash
docker compose up --build -d
```

Доступ после старта:
- **Frontend:** http://localhost
- **Backend API:** http://localhost/api
- **Swagger UI:** http://localhost/api/swagger-ui.html
- **MinIO Console:** http://localhost:9001

### Шаг 2б. Только инфраструктура + запуск приложений вручную (для разработки)

```bash
# поднять postgres + redis + minio
docker compose up -d postgres redis minio

# backend → http://localhost:8080/api
cd backend
./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run

# в отдельном терминале — frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

Миграции БД (`V1__init_schema.sql`, Flyway) применяются автоматически при старте backend.
Бакет MinIO создаётся сервисом `minio-init` из `docker-compose.yml`.

### Порты по умолчанию

| Сервис | Порт |
|---|---|
| Frontend (Nginx) | 80 |
| Frontend (Vite dev) | 5173 |
| Backend | 8080 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO S3 / Console | 9000 / 9001 |

### Остановка

```bash
docker compose down           # остановить
docker compose down -v        # остановить и удалить тома (БД, файлы) — данные пропадут
```

---

## Проверка работоспособности

```bash
curl http://localhost:8080/api/health        # → 200 OK
```

Затем откройте фронтенд, зарегистрируйтесь (email + пароль ≥ 8 символов), выберите режим и
сгенерируйте первый комплект.
