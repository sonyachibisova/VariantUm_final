package ru.variantum.service.parser;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Arrays;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
public class PdfBoxParser implements FileParser {

    // Строки-колонтитулы, которые PDFBox включает в текст, но не являются заданиями:
    // — отдельная цифра (номер страницы)
    // — «Вариант 1», «Вариант №2» и т.п.
    // — «Страница 1 из 5», «стр. 3»
    // — горизонтальные разделители (----, ====)
    private static final Pattern HEADER_FOOTER_LINE = Pattern.compile(
            "^(?:\\d{1,3}" +                            // просто цифра (номер страницы)
            "|(?:Вариант|вариант)\\s*[№#]?\\s*\\d+" +  // Вариант 1, Вариант №2
            "|[Сс]тр(?:аница|\\.)?\\s*\\.?\\s*\\d+(?:\\s*из\\s*\\d+)?" + // Страница 2 из 5, стр. 3
            "|[-=_*—–]{3,}" +                 // разделители --- === ___
            ")$",
            Pattern.UNICODE_CHARACTER_CLASS
    );

    @Override
    public boolean supports(String mimeType) {
        return mimeType != null && mimeType.contains("application/pdf");
    }

    @Override
    public String parse(MultipartFile file) {
        try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            String text = stripper.getText(doc);
            // Если PDF сканированный без текстового слоя — текст будет пустым
            if (text == null || text.isBlank()) {
                throw new RuntimeException("PDF не содержит текстового слоя. Загрузите как изображение для OCR.");
            }
            return removeHeaderFooterLines(text);
        } catch (IOException e) {
            throw new RuntimeException("Не удалось прочитать PDF: " + file.getOriginalFilename(), e);
        }
    }

    /** Убирает строки-колонтитулы (номера страниц, «Вариант N», разделители). */
    private String removeHeaderFooterLines(String text) {
        String result = Arrays.stream(text.split("\n"))
                .filter(line -> !HEADER_FOOTER_LINE.matcher(line.trim()).matches())
                .collect(Collectors.joining("\n"));
        // Схлопываем три и более пустых строки подряд в две
        return result.replaceAll("(\n\\s*){3,}", "\n\n");
    }

    @Override
    public String name() {
        return "pdfbox";
    }
}
