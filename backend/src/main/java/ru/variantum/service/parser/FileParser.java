package ru.variantum.service.parser;

import org.springframework.web.multipart.MultipartFile;

/**
 * Контракт парсера файла. Реализации:
 *   - PdfBoxParser     (application/pdf, текстовый слой)
 *   - DocxParser       (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 *   - TxtParser        (text/plain)
 *   - TesseractOcrParser (image/* и PDF-сканы без текстового слоя)
 *
 * Сервис FileParserRegistry выбирает реализацию по mimeType.
 * TODO (Sonnet): реализовать каждый парсер.
 */
public interface FileParser {

    boolean supports(String mimeType);

    /**
     * @return извлечённый plain-text (без форматирования; формулы — как есть)
     */
    String parse(MultipartFile file);

    /**
     * Идентификатор парсера для логов и поля uploaded_files.parser_used.
     */
    String name();
}
