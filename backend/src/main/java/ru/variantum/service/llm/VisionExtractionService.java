package ru.variantum.service.llm;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import ru.variantum.config.AppProperties;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.Set;

/**
 * Извлечение содержимого изображения через GigaChat Vision: распознаёт текст, формулы (LaTeX),
 * восстанавливает таблицы (Markdown) и описывает графики/чертежи. Заметно качественнее Tesseract
 * на фото плохого качества и для математики/геометрии.
 *
 * GigaChat принимает JPEG/PNG/TIFF/BMP; остальные форматы (gif, webp) перекодируются в PNG.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class VisionExtractionService {

    private static final Set<String> NATIVE_MIME = Set.of(
            "image/jpeg", "image/png", "image/tiff", "image/bmp");

    private final GigaChatClient gigaChatClient;
    private final PromptBuilder promptBuilder;
    private final AppProperties appProperties;

    public String extract(byte[] bytes, String filename, String mimeType) {
        byte[] uploadBytes = bytes;
        String uploadMime = mimeType;
        String uploadName = filename != null ? filename : "image";

        if (mimeType == null || !NATIVE_MIME.contains(mimeType.toLowerCase())) {
            byte[] png = transcodeToPng(bytes);
            if (png != null) {
                uploadBytes = png;
                uploadMime = "image/png";
                uploadName = stripExt(uploadName) + ".png";
                log.info("Изображение {} перекодировано в PNG для GigaChat Vision", filename);
            } else {
                throw new IllegalArgumentException("Формат изображения не поддерживается Vision: " + mimeType);
            }
        }

        String fileId = gigaChatClient.uploadFile(uploadBytes, uploadName, uploadMime).block();
        String prompt = promptBuilder.build(PromptBuilder.EXTRACT_FROM_IMAGE, Map.of());
        String text = gigaChatClient
                .completionWithAttachment(prompt, fileId, appProperties.gigachat().temperatureValidate())
                .block();
        if (text != null) {
            text = TextCleanupService.normalizeText(text);
        }
        return text != null ? text.trim() : "";
    }

    private byte[] transcodeToPng(byte[] bytes) {
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            if (img == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (Exception e) {
            log.warn("Не удалось перекодировать изображение в PNG: {}", e.getMessage());
            return null;
        }
    }

    private String stripExt(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
