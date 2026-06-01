package ru.variantum.service.parser;

import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Component
public class DocxParser implements FileParser {

    @Override
    public boolean supports(String mimeType) {
        return mimeType != null && (
                mimeType.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
                mimeType.equals("application/msword")
        );
    }

    @Override
    public String parse(MultipartFile file) {
        try (XWPFDocument doc = new XWPFDocument(file.getInputStream());
             XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
            return extractor.getText();
        } catch (IOException e) {
            throw new RuntimeException("Не удалось прочитать DOCX: " + file.getOriginalFilename(), e);
        }
    }

    @Override
    public String name() {
        return "docx";
    }
}
