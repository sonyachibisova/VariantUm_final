package ru.variantum.service.llm;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import ru.variantum.exception.LlmFailureException;

@Component
@Slf4j
@RequiredArgsConstructor
public class LlmJsonUtil {

    private final ObjectMapper objectMapper;

    /**
     * Снисходительный маппер только для ответов LLM. Слабые модели (бесплатный GigaChat)
     * любят добавлять в JSON то, что спецификация запрещает: комментарии {@code // ...},
     * висячие запятые, одинарные кавычки. Глобальный бин при этом остаётся строгим.
     */
    private ObjectMapper lenientMapper;

    @PostConstruct
    void initLenientMapper() {
        this.lenientMapper = objectMapper.copy()
                .enable(JsonParser.Feature.ALLOW_COMMENTS)            // // ... и /* ... */
                .enable(JsonParser.Feature.ALLOW_TRAILING_COMMA)      // [1, 2, 3,]
                .enable(JsonParser.Feature.ALLOW_SINGLE_QUOTES)       // 'key'
                .enable(JsonParser.Feature.ALLOW_UNQUOTED_FIELD_NAMES);
    }

    public <T> T parse(String rawText, Class<T> type) {
        String json = extractJson(rawText);
        try {
            return lenientMapper.readValue(json, type);
        } catch (Exception first) {
            // Слабые модели (базовый GigaChat) часто ломают JSON одиночными обратными
            // слэшами из LaTeX (\frac, \begin) или буквальными переводами строк.
            // Пробуем автоматически починить экранирование и распарсить ещё раз.
            try {
                String fixed = sanitizeJsonEscapes(json);
                T result = lenientMapper.readValue(fixed, type);
                log.info("JSON от LLM успешно распознан после починки экранирования");
                return result;
            } catch (Exception second) {
                log.error("Не удалось разобрать JSON от LLM (даже после починки escape'ов).\n" +
                          "Первая ошибка: {}\nВторая ошибка: {}\nПервые 800 символов JSON:\n{}",
                        first.getMessage(), second.getMessage(),
                        json.substring(0, Math.min(800, json.length())));
                throw new LlmFailureException("LLM вернул невалидный JSON: " + second.getMessage(), false);
            }
        }
    }

    private String extractJson(String text) {
        if (text == null) throw new LlmFailureException("LLM вернул пустой ответ", false);
        String s = text.trim();
        // убираем markdown code block
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```(?:json)?\\r?\\n?", "");
            s = s.replaceFirst("\\r?\\n?```$", "").trim();
        }
        // находим первый {
        int start = s.indexOf('{');
        if (start < 0) {
            throw new LlmFailureException(
                    "LLM не вернул JSON-объект: " + s.substring(0, Math.min(300, s.length())), false);
        }
        // Balanced-bracket поиск закрывающей } корневого объекта.
        // lastIndexOf('}') ненадёжен: при обрезанном ответе (finish_reason=length)
        // последняя } принадлежит вложенному объекту, а не корню.
        int end = findMatchingBrace(s, start);
        if (end < 0) {
            // JSON обрезан — пробуем всё равно отдать на парсинг: lenient-маппер
            // иногда переживает нехватку закрывающих скобок (например ALLOW_TRAILING_COMMA
            // даёт шанс); также после sanitize можно добраться до частичного результата.
            end = s.lastIndexOf('}');
            if (end <= start) {
                throw new LlmFailureException(
                        "LLM не вернул JSON-объект: " + s.substring(0, Math.min(300, s.length())), false);
            }
            log.warn("JSON от LLM обрезан (нет балансированной закрывающей скобки). " +
                     "finish_reason=length? Используем lastIndexOf '}' для восстановления. " +
                     "Распознано {} символов JSON.", end - start + 1);
        }
        return s.substring(start, end + 1);
    }

    /**
     * Находит позицию закрывающей {@code }}, соответствующей открывающей {@code {} на позиции {@code openAt}.
     * Учитывает вложенность и не считает скобки внутри JSON-строк.
     * Возвращает -1, если JSON обрезан (нет балансированной закрывающей скобки).
     */
    private int findMatchingBrace(String s, int openAt) {
        int depth = 0;
        boolean inString = false;
        for (int i = openAt; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inString) {
                if (c == '\\') { i++; continue; }  // escaped char — пропускаем следующий
                if (c == '"') inString = false;
            } else {
                switch (c) {
                    case '"' -> inString = true;
                    case '{' -> depth++;
                    case '}' -> {
                        depth--;
                        if (depth == 0) return i;   // нашли закрывающую скобку корня
                    }
                }
            }
        }
        return -1;  // JSON обрезан
    }

    /**
     * Чинит частые ошибки JSON от слабых моделей внутри строковых значений:
     *  • одиночные обратные слэши, не образующие валидный escape (LaTeX вроде {@code \frac},
     *    {@code \begin}, {@code \ }), удваиваются в {@code \\};
     *  • буквальные переводы строк / табуляции экранируются в {@code \n}, {@code \r}, {@code \t}.
     * Конечный автомат отслеживает, находимся ли мы внутри строки, поэтому структура JSON
     * (кавычки, скобки) не затрагивается.
     */
    private String sanitizeJsonEscapes(String json) {
        StringBuilder sb = new StringBuilder(json.length() + 64);
        boolean inString = false;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (!inString) {
                sb.append(c);
                if (c == '"') inString = true;
                continue;
            }
            switch (c) {
                case '"' -> {
                    sb.append(c);
                    inString = false;
                }
                case '\\' -> {
                    char next = (i + 1 < json.length()) ? json.charAt(i + 1) : '\0';
                    if (next == '"' || next == '\\' || next == '/') {
                        // однозначно валидный JSON escape
                        sb.append(c).append(next);
                        i++;
                    } else if (next == 'u' && isHex(json, i + 2, 4)) {
                        // валидный unicode-escape вида backslash-u + 4 hex
                        sb.append(c).append(next);
                        i++;
                    } else if (next == 'b' || next == 'f' || next == 'n' || next == 'r' || next == 't') {
                        // \b, \f, \n, \r, \t — может быть JSON control escape ИЛИ LaTeX-команда.
                        // GigaChat часто пишет \frac, \begin, \not, \right, \text без удвоения слэша.
                        // Если после escape-буквы идёт ещё буква — это LaTeX-команда, удваиваем слэш.
                        char afterNext = (i + 2 < json.length()) ? json.charAt(i + 2) : '\0';
                        if (Character.isLetter(afterNext)) {
                            // LaTeX: \begin, \frac, \not, \right, \text, \newline, \tanh и т.п.
                            sb.append('\\').append('\\');
                        } else {
                            // Реальный JSON control escape (\n, \t перед пробелом/кавычкой/концом)
                            sb.append(c).append(next);
                            i++;
                        }
                    } else {
                        // невалидный escape (LaTeX \cdot, \alpha, \leq и т.п.) — удваиваем слэш
                        sb.append('\\').append('\\');
                    }
                }
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    private boolean isHex(String s, int from, int len) {
        if (from + len > s.length()) return false;
        for (int i = from; i < from + len; i++) {
            char c = s.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!hex) return false;
        }
        return true;
    }
}
