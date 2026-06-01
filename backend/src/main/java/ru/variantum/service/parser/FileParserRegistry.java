package ru.variantum.service.parser;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Component
@RequiredArgsConstructor
public class FileParserRegistry {

    private final List<FileParser> parsers;

    public String parse(MultipartFile file) {
        String mimeType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        FileParser parser = parsers.stream()
                .filter(p -> p.supports(mimeType))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Неподдерживаемый тип файла: " + mimeType +
                        ". Поддерживаются: text/plain, application/pdf, .docx"));
        return parser.parse(file);
    }

    /** Парсинг из байтового массива без HTTP-загрузки (для повторного распознавания из хранилища). */
    public String parseBytes(byte[] bytes, String mimeType, String filename) {
        return parse(new ByteMultipartFile(bytes, mimeType, filename));
    }

    public boolean supports(String mimeType) {
        return parsers.stream().anyMatch(p -> p.supports(mimeType));
    }

    /** Минимальная реализация MultipartFile поверх byte[] для серверного переиспользования парсеров. */
    private static class ByteMultipartFile implements MultipartFile {
        private final byte[] content;
        private final String contentType;
        private final String name;

        ByteMultipartFile(byte[] content, String contentType, String name) {
            this.content = content != null ? content : new byte[0];
            this.contentType = contentType;
            this.name = name != null ? name : "file";
        }

        @Override public String getName() { return name; }
        @Override public String getOriginalFilename() { return name; }
        @Override public String getContentType() { return contentType; }
        @Override public boolean isEmpty() { return content.length == 0; }
        @Override public long getSize() { return content.length; }
        @Override public byte[] getBytes() { return content; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(content); }

        @Override
        public void transferTo(File dest) throws IOException {
            try (FileOutputStream out = new FileOutputStream(dest)) {
                out.write(content);
            }
        }
    }
}
