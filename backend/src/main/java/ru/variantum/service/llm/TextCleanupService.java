package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;

import java.util.Map;

/**
 * Прогон распознанного/извлечённого текста через GigaChat для исправления ошибок OCR/парсинга
 * и нормализации формул в LaTeX. Некритичен: при любой ошибке возвращает исходный текст.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TextCleanupService {

    private static final int MIN_LEN = 20;
    private static final int MAX_LEN = 20_000;

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final AppProperties appProperties;

    /**
     * Комплексная нормализация текста после GigaChat Lite:
     * — Literal \n → реальный перенос строки
     * — \r\n и \r → \n
     * — Убираем Markdown-артефакты
     * — Нормализуем пробелы (не трогаем LaTeX и маркеры)
     */
    public static String normalizeText(String text) {
        if (text == null) return null;
        // Literal \n и \t (буквенные escape-последовательности от GigaChat) → реальные
        text = text.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "");
        // Windows-переносы → Unix
        text = text.replace("\r\n", "\n").replace("\r", "\n");
        // Убираем Markdown-артефакты
        text = stripMarkdown(text);
        return text.trim();
    }

    /**
     * Убирает Markdown-артефакты, которые GigaChat Lite добавляет к тексту несмотря на запрет.
     * Таблицы (| col | col |) оставляем — они нужны для RichText.
     */
    public static String stripMarkdown(String text) {
        if (text == null) return null;
        // ## Заголовки → просто текст
        text = text.replaceAll("(?m)^#{1,6}\\s*", "");
        // **жирный** → жирный
        text = text.replaceAll("\\*\\*([^*\n]+)\\*\\*", "$1");
        // *курсив* → курсив (не трогаем LaTeX и ** уже разобраны)
        text = text.replaceAll("(?<![*$\\\\])\\*([^*\n]+)\\*(?![*$])", "$1");
        // Тройные+ переносы → двойной
        text = text.replaceAll("\n{3,}", "\n\n");
        return text.trim();
    }

    /** Возвращает исправленный текст. Если текст пустой/слишком длинный или LLM недоступен — исходный. */
    public String cleanup(String rawText) {
        if (rawText == null) return null;
        // Базовая нормализация переносов всегда, даже если LLM-очистка пропускается
        rawText = rawText.replace("\r\n", "\n").replace("\r", "\n");
        String trimmed = rawText.trim();
        if (trimmed.length() < MIN_LEN || trimmed.length() > MAX_LEN) {
            return rawText;
        }
        try {
            String prompt = promptBuilder.build(PromptBuilder.CLEANUP_TEXT, Map.of("raw_text", trimmed));
            // Очистка текста — простая задача, достаточно Lite
            String cleaned = gigaChatClient
                    .completion(prompt, appProperties.gigachat().temperatureValidate(),
                            appProperties.gigachat().modelLite())
                    .block();
            if (cleaned != null && !cleaned.isBlank()) {
                cleaned = normalizeText(cleaned);
                log.info("Текст очищен: {} → {} символов", trimmed.length(), cleaned.length());
                return cleaned.trim();
            }
        } catch (Exception e) {
            log.warn("Очистка текста не удалась (возвращаю исходный): {}", e.getMessage());
        }
        return rawText;
    }
}
