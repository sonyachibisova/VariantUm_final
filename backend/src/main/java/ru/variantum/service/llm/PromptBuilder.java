package ru.variantum.service.llm;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Загружает шаблоны промптов из classpath:/prompts/*.txt и подставляет переменные {var}.
 * Все промпты предзагружаются при старте приложения.
 *
 * Использование:
 *     promptBuilder.build("analyze", Map.of("task_text", text, "hint_subject", "math"));
 */
@Component
@Slf4j
public class PromptBuilder {

    public static final String ANALYZE = "analyze";
    public static final String GENERATE_FROM_REFERENCE = "generate_from_reference";
    public static final String GENERATE_FROM_CRITERIA = "generate_from_criteria";
    public static final String VALIDATE = "validate";
    public static final String AI_EDIT_SINGLE = "ai_edit_single";
    public static final String AI_EDIT_ALL = "ai_edit_all";
    public static final String ESTIMATE_TIME = "estimate_time";
    public static final String RECOMMEND = "recommend";
    public static final String EXTRACT_FROM_IMAGE = "extract_from_image";
    public static final String CLEANUP_TEXT = "cleanup_text";
    public static final String SPLIT_TASKS = "split_tasks";
    public static final String REGENERATE_TASK = "regenerate_task";

    private static final String[] ALL_TEMPLATES = {
            ANALYZE, GENERATE_FROM_REFERENCE, GENERATE_FROM_CRITERIA, VALIDATE,
            AI_EDIT_SINGLE, AI_EDIT_ALL, ESTIMATE_TIME, RECOMMEND,
            EXTRACT_FROM_IMAGE, CLEANUP_TEXT, SPLIT_TASKS, REGENERATE_TASK
    };

    private final Map<String, String> templates = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadAll() throws IOException {
        for (String name : ALL_TEMPLATES) {
            String path = "prompts/" + name + ".txt";
            try (var is = new ClassPathResource(path).getInputStream()) {
                String content = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
                templates.put(name, content);
                log.debug("Промпт загружен: {} ({} символов)", name, content.length());
            }
        }
        log.info("Загружено {} промптов", templates.size());
    }

    public String build(String templateName, Map<String, ?> variables) {
        String template = templates.get(templateName);
        if (template == null) {
            throw new IllegalArgumentException("Неизвестный промпт: " + templateName);
        }
        String result = template;
        Map<String, String> rendered = renderValues(variables);
        for (Map.Entry<String, String> e : rendered.entrySet()) {
            result = result.replace("{" + e.getKey() + "}", e.getValue());
        }
        return result;
    }

    private Map<String, String> renderValues(Map<String, ?> variables) {
        Map<String, String> out = new HashMap<>();
        if (variables == null) return out;
        for (Map.Entry<String, ?> e : variables.entrySet()) {
            Object v = e.getValue();
            out.put(e.getKey(), v == null ? "" : v.toString());
        }
        return out;
    }
}
