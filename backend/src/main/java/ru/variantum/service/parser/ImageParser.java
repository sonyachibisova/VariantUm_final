package ru.variantum.service.parser;

import lombok.extern.slf4j.Slf4j;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;

@Component
@Slf4j
public class ImageParser implements FileParser {

    @Override
    public boolean supports(String mimeType) {
        return mimeType != null && mimeType.startsWith("image/");
    }

    @Override
    public String parse(MultipartFile file) {
        try {
            byte[] bytes = file.getBytes();
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null) {
                throw new RuntimeException("Не удалось прочитать изображение: " + file.getOriginalFilename());
            }

            Tesseract tesseract = new Tesseract();
            String datapath = System.getenv("TESSDATA_PREFIX");
            if (datapath != null && !datapath.isBlank()) {
                tesseract.setDatapath(datapath);
            }
            tesseract.setLanguage("rus+eng");
            tesseract.setPageSegMode(6);
            tesseract.setOcrEngineMode(1);

            String text = tesseract.doOCR(image);
            if (text == null || text.isBlank()) {
                return "[Изображение не содержит распознаваемого текста]";
            }
            return text.trim();
        } catch (IOException e) {
            throw new RuntimeException("Не удалось прочитать изображение: " + file.getOriginalFilename(), e);
        } catch (TesseractException e) {
            log.warn("OCR ошибка для {}: {}", file.getOriginalFilename(), e.getMessage());
            return "[OCR не удалось распознать текст: " + e.getMessage() + "]";
        }
    }

    @Override
    public String name() {
        return "tesseract-ocr";
    }
}
