package ru.variantum.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.variantum.service.llm.GigaChatClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/diagnostic")
@RequiredArgsConstructor
@Slf4j
public class DiagnosticController {

    private final GigaChatClient gigaChatClient;

    @GetMapping("/gigachat")
    public Map<String, Object> testGigaChat() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("timestamp", Instant.now().toString());

        long start = System.currentTimeMillis();
        try {
            String response = gigaChatClient
                    .completion("Ответь одним словом: ты работаешь? Верни только JSON: {\"status\": \"ok\"}", 0.0)
                    .block();
            result.put("status", "OK");
            result.put("responseMs", System.currentTimeMillis() - start);
            result.put("responsePreview", response == null ? null
                    : response.substring(0, Math.min(500, response.length())));
        } catch (Exception e) {
            result.put("status", "ERROR");
            result.put("responseMs", System.currentTimeMillis() - start);
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            log.error("GigaChat diagnostic failed", e);
        }
        return result;
    }
}
