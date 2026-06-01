package ru.variantum.service.parser;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
public class TxtParser implements FileParser {

    @Override
    public boolean supports(String mimeType) {
        return mimeType != null && (mimeType.startsWith("text/") || mimeType.equals("application/json"));
    }

    @Override
    public String parse(MultipartFile file) {
        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Не удалось прочитать текстовый файл: " + file.getOriginalFilename(), e);
        }
    }

    @Override
    public String name() {
        return "txt";
    }
}
