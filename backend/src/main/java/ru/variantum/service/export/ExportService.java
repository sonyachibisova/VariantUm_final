package ru.variantum.service.export;

import com.itextpdf.html2pdf.ConverterProperties;
import com.itextpdf.html2pdf.HtmlConverter;
import com.itextpdf.layout.font.FontProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.docx4j.jaxb.Context;
import org.docx4j.openpackaging.packages.WordprocessingMLPackage;
import org.docx4j.openpackaging.parts.WordprocessingML.MainDocumentPart;
import org.docx4j.wml.*;
import org.springframework.stereotype.Service;
import ru.variantum.domain.Project;
import ru.variantum.dto.request.ExportRequest;
import ru.variantum.dto.response.ProjectDetailResponse;
import ru.variantum.dto.response.TaskResponse;
import ru.variantum.dto.response.VariantResponse;
import ru.variantum.service.project.ProjectService;
import ru.variantum.util.FormulaConverter;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Экспорт комплекта в PDF (iText html2pdf) и DOCX (docx4j).
 * Формулы предварительно конвертируются в читаемый Unicode-вид через {@link FormulaConverter}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ExportService {

    private static final Pattern FIGURE = Pattern.compile(
            "\\[(?:РИСУНОК|Рисунок|ГРАФИК|График|ЧЕРТЁЖ|Чертёж)\\s*:[\\s\\S]*?\\]");

    // Маркер графика функции: [ФУНКЦИЯ: {"fn":"x^2","xMin":-5,"xMax":5}]
    private static final Pattern GRAPH = Pattern.compile(
            "\\[ФУНКЦИЯ:\\s*(\\{[^\\]]*\\})\\s*\\]");

    // Маркер встроенного изображения: [ИЗОБРАЖЕНИЕ: url или data:...]
    private static final Pattern IMAGE_EMBED = Pattern.compile(
            "\\[ИЗОБРАЖЕНИЕ:\\s*([^\\]]+?)\\s*\\]");

    // Для PDF: ФУНКЦИЯ (группа 1), ИЗОБРАЖЕНИЕ (группа 2), РИСУНОК/ЧЕРТЁЖ (без групп)
    private static final Pattern ALL_INLINE = Pattern.compile(
            GRAPH.pattern() + "|" + IMAGE_EMBED.pattern() + "|" + FIGURE.pattern());

    // Для DOCX: ФУНКЦИЯ (группа 1), ИЗОБРАЖЕНИЕ (группа 2)
    private static final Pattern DOCX_INLINE = Pattern.compile(
            GRAPH.pattern() + "|" + IMAGE_EMBED.pattern());

    // Markdown-разметка, которую LLM может случайно добавить в поле text задания
    private static final Pattern MD_HEADER = Pattern.compile("(?m)^#{1,6}[^\\n]*\\n?");
    private static final Pattern MD_BOLD   = Pattern.compile("\\*\\*(.+?)\\*\\*");

    private static final String[] FONT_PATHS = {
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/arialbd.ttf"
    };

    private final ProjectService projectService;
    private final FormulaConverter formulaConverter;
    private final GraphSvgRenderer graphSvgRenderer;

    public record ExportResult(String filename, String contentType, byte[] bytes) {}

    public ExportResult exportPdf(UUID userId, UUID projectId, ExportRequest req) {
        Project project = projectService.requireOwned(userId, projectId);
        ProjectDetailResponse detail = projectService.toDetailResponse(project);
        String html = buildHtml(project, detail, req);

        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            ConverterProperties props = new ConverterProperties();
            props.setFontProvider(buildFontProvider());
            HtmlConverter.convertToPdf(html, baos, props);
            return new ExportResult(filename(project, "pdf"), "application/pdf", baos.toByteArray());
        } catch (Exception e) {
            log.error("Ошибка экспорта PDF проекта {}: {}", projectId, e.getMessage(), e);
            throw new RuntimeException("Не удалось сформировать PDF: " + e.getMessage(), e);
        }
    }

    public ExportResult exportDocx(UUID userId, UUID projectId, ExportRequest req) {
        Project project = projectService.requireOwned(userId, projectId);
        ProjectDetailResponse detail = projectService.toDetailResponse(project);

        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            WordprocessingMLPackage pkg = WordprocessingMLPackage.createPackage();
            MainDocumentPart main = pkg.getMainDocumentPart();

            // Заголовок и мета
            addDocxHeading(main, detail.title(), 1);
            addDocxParagraph(main, metaLine(project), false);

            // Счётчик id для изображений DOCX (каждое изображение нуждается в уникальном id)
            int[] imgIdCounter = {1};

            boolean isFirstVariant = true;
            for (VariantResponse variant : detail.variants()) {
                if (!isFirstVariant) {
                    if (req != null && req.onePerPage()) {
                        addDocxPageBreak(main);
                    } else {
                        addDocxParagraph(main, "", false);
                    }
                }

                if (req != null && req.hasKitName()) {
                    addDocxHeading(main, req.kitName(), 1);
                }

                String variantTitle = "Вариант " + variant.index()
                        + (req != null && req.showDifficulty() && variant.difficulty() != null
                            ? " (" + difficultyLabel(variant.difficulty()) + ")" : "");
                addDocxHeading(main, variantTitle, 2);
                addFieldsDocx(main, req);
                int n = 1;
                for (TaskResponse task : variant.tasks()) {
                    String rawText = task.text() != null ? task.text() : "";
                    String expandedText = expandTestOptions(rawText);
                    boolean hasTable = expandedText.contains("|");
                    boolean multiLine = expandedText.contains("\n");
                    boolean hasImage = expandedText.contains("[ИЗОБРАЖЕНИЕ:");
                    if (hasTable || multiLine || hasImage) {
                        addDocxParagraph(main, n + ".", true);
                        renderDocxMixed(pkg, main, imgIdCounter, expandedText);
                    } else {
                        String taskText = n + ". " + readable(stripMarkdown(expandedText));
                        addDocxParagraph(main, taskText, false);
                    }

                    // Вставляем прикреплённое фото из отдельного поля (base64 или внешний URL)
                    if (task.photoUrl() != null && !task.photoUrl().isBlank()) {
                        addDocxImage(pkg, main, task.photoUrl(), imgIdCounter);
                    }
                    n++;
                }
                isFirstVariant = false;
            }

            if (req != null && req.includeAnswers()) {
                addDocxParagraph(main, "", false);
                addDocxHeading(main, "Ответы (для учителя)", 1);
                for (VariantResponse variant : detail.variants()) {
                    addDocxHeading(main, "Вариант " + variant.index(), 2);
                    int n = 1;
                    for (TaskResponse task : variant.tasks()) {
                        String ans = nullToDash(task.answer());
                        String expandedAns = expandTestOptions(ans);
                        boolean hasTable = expandedAns.contains("|");
                        boolean multiLine = expandedAns.contains("\n");
                        boolean hasImage = expandedAns.contains("[ИЗОБРАЖЕНИЕ:");
                        if (hasTable || multiLine || hasImage) {
                            addDocxParagraph(main, n + ")", true);
                            renderDocxMixed(pkg, main, imgIdCounter, expandedAns);
                        } else {
                            addDocxParagraph(main, n + ") " + readable(ans), false);
                        }
                        n++;
                    }
                }
            }

            pkg.save(baos);
            return new ExportResult(filename(project, "docx"),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    baos.toByteArray());
        } catch (Exception e) {
            log.error("Ошибка экспорта DOCX проекта {}: {}", projectId, e.getMessage(), e);
            throw new RuntimeException("Не удалось сформировать DOCX: " + e.getMessage(), e);
        }
    }

    // ---- DOCX helpers ----

    private void addDocxParagraph(MainDocumentPart main, String text, boolean bold) {
        ObjectFactory factory = Context.getWmlObjectFactory();
        P p = factory.createP();
        R run = factory.createR();
        Text t = factory.createText();
        t.setValue(text);
        t.setSpace("preserve");
        run.getContent().add(t);
        if (bold) {
            RPr rpr = factory.createRPr();
            BooleanDefaultTrue b = factory.createBooleanDefaultTrue();
            rpr.setB(b);
            run.setRPr(rpr);
        }
        p.getContent().add(run);
        main.getContent().add(p);
    }

    /**
     * Вставляет изображение в DOCX-документ.
     * @param photoUrl base64 data-URL (data:image/...;base64,...) или внешний URL
     * @param imgIdCounter массив из одного элемента — счётчик уникальных id изображений
     */
    private void addDocxImage(WordprocessingMLPackage pkg, MainDocumentPart main,
                               String photoUrl, int[] imgIdCounter) {
        try {
            byte[] imageBytes = resolveImageBytes(photoUrl);
            if (imageBytes == null) {
                addDocxParagraph(main, "[Изображение недоступно]", false);
                return;
            }
            org.docx4j.openpackaging.parts.WordprocessingML.BinaryPartAbstractImage imagePart =
                    org.docx4j.openpackaging.parts.WordprocessingML.BinaryPartAbstractImage
                            .createImagePart(pkg, imageBytes);
            int id1 = imgIdCounter[0]++;
            int id2 = imgIdCounter[0]++;
            org.docx4j.dml.wordprocessingDrawing.Inline inline =
                    imagePart.createImageInline("photo", "фото к заданию", id1, id2, false);

            ObjectFactory factory = Context.getWmlObjectFactory();
            Drawing drawing = factory.createDrawing();
            drawing.getAnchorOrInline().add(inline);
            R imgRun = factory.createR();
            imgRun.getContent().add(factory.createRDrawing(drawing));
            P imgPara = factory.createP();
            imgPara.getContent().add(imgRun);
            main.getContent().add(imgPara);
        } catch (Exception e) {
            log.warn("Не удалось вставить фото в DOCX: {}", e.getMessage());
            addDocxParagraph(main, "[Изображение недоступно]", false);
        }
    }

    private void addDocxHeading(MainDocumentPart main, String text, int level) {
        String style = level == 1 ? "Heading1" : "Heading2";
        main.addStyledParagraphOfText(style, text);
    }

    private void addDocxPageBreak(MainDocumentPart main) {
        ObjectFactory factory = Context.getWmlObjectFactory();
        P p = factory.createP();
        R run = factory.createR();
        Br br = factory.createBr();
        br.setType(STBrType.PAGE);
        run.getContent().add(br);
        p.getContent().add(run);
        main.getContent().add(p);
    }

    /**
     * Выводит смешанный текст: текст → параграфы, таблицы → Word Tbl,
     * [ФУНКЦИЯ:] → подпись графика, [ИЗОБРАЖЕНИЕ:] → встроенное изображение.
     */
    private void renderDocxMixed(WordprocessingMLPackage pkg, MainDocumentPart main,
                                  int[] imgIdCounter, String text) {
        if (text == null) return;

        Matcher inlineMatcher = DOCX_INLINE.matcher(text);
        int lastPos = 0;
        StringBuilder currentSegment = new StringBuilder();

        while (inlineMatcher.find()) {
            int start = inlineMatcher.start();
            if (start > lastPos) {
                currentSegment.append(text, lastPos, start);
            }
            if (currentSegment.length() > 0) {
                renderDocxTextAndTables(main, currentSegment.toString());
                currentSegment = new StringBuilder();
            }
            String graphJson = inlineMatcher.group(1);
            String imageUrl  = inlineMatcher.group(2);
            if (graphJson != null) {
                insertGraphIntoDocx(main, graphJson);
            } else if (imageUrl != null) {
                addDocxImage(pkg, main, imageUrl.trim(), imgIdCounter);
            }
            lastPos = inlineMatcher.end();
        }
        if (lastPos < text.length()) {
            currentSegment.append(text.substring(lastPos));
        }
        if (currentSegment.length() > 0) {
            renderDocxTextAndTables(main, currentSegment.toString());
        }
    }

    private void renderDocxTextAndTables(MainDocumentPart main, String text) {
        String[] lines = text.split("\n");
        List<String> tableBuf = new ArrayList<>();
        List<String> textBuf = new ArrayList<>();

        for (String line : lines) {
            if (countChar(line, '|') >= 2) {
                if (!textBuf.isEmpty()) {
                    String joined = String.join("\n", textBuf).trim();
                    if (!joined.isEmpty()) addDocxParagraph(main, readable(stripMarkdown(joined)), false);
                    textBuf.clear();
                }
                tableBuf.add(line);
            } else {
                if (!tableBuf.isEmpty()) {
                    buildDocxTable(main, tableBuf);
                    tableBuf.clear();
                }
                textBuf.add(line);
            }
        }
        if (!textBuf.isEmpty()) {
            String joined = String.join("\n", textBuf).trim();
            if (!joined.isEmpty()) addDocxParagraph(main, readable(stripMarkdown(joined)), false);
        }
        if (!tableBuf.isEmpty()) buildDocxTable(main, tableBuf);
    }

    private void insertGraphIntoDocx(MainDocumentPart main, String json) {
        try {
            if (json == null || json.isEmpty() || json.length() > 500) return;
            String fn = extractJsonString(json, "fn");
            if (fn == null || fn.isBlank() || fn.length() > 200) return;

            double xMin = extractJsonDouble(json, "xMin", -5);
            double xMax = extractJsonDouble(json, "xMax", 5);

            if (xMax <= xMin) xMax = xMin + 10;

            // Просто добавляем текст о графике (без визуального оформления)
            String graphLabel = String.format("[График: y = %s]", fn);
            addDocxParagraph(main, graphLabel, false);
        } catch (Exception e) {
            log.warn("Не удалось добавить график в DOCX: {}", e.getMessage());
        }
    }

    private CTBorder singleBorder(ObjectFactory factory) {
        CTBorder b = factory.createCTBorder();
        b.setVal(STBorder.SINGLE);
        b.setSz(BigInteger.valueOf(4));
        b.setColor("000000");
        return b;
    }

    private void buildDocxTable(MainDocumentPart main, List<String> rows) {
        ObjectFactory factory = Context.getWmlObjectFactory();
        Tbl tbl = factory.createTbl();

        // ─── Свойства таблицы: одиночные границы со всех сторон ───
        TblPr tblPr = factory.createTblPr();
        TblBorders borders = factory.createTblBorders();
        borders.setTop(singleBorder(factory));
        borders.setBottom(singleBorder(factory));
        borders.setLeft(singleBorder(factory));
        borders.setRight(singleBorder(factory));
        borders.setInsideH(singleBorder(factory));
        borders.setInsideV(singleBorder(factory));
        tblPr.setTblBorders(borders);
        // Авторазмер по ширине страницы
        TblWidth tblW = factory.createTblWidth();
        tblW.setType("auto");
        tblW.setW(BigInteger.ZERO);
        tblPr.setTblW(tblW);
        tbl.setTblPr(tblPr);

        boolean isHeaderRow = true;
        for (String row : rows) {
            if (isSeparator(row)) { isHeaderRow = false; continue; }
            Tr tr = factory.createTr();
            for (String cell : splitCells(row)) {
                Tc tc = factory.createTc();
                String cellText = readable(cell.trim());
                boolean emptyCell = !isHeaderRow && cellText.isEmpty();

                // Пустые ячейки (не заголовки) — минимальная ширина для записи ученика
                if (emptyCell) {
                    TcPr tcPr = factory.createTcPr();
                    TblWidth cellW = factory.createTblWidth();
                    cellW.setType("dxa");
                    cellW.setW(BigInteger.valueOf(1440)); // 1 дюйм
                    tcPr.setTcW(cellW);
                    tc.setTcPr(tcPr);
                }

                P cp = factory.createP();
                R run = factory.createR();
                if (isHeaderRow) {
                    RPr rpr = factory.createRPr();
                    BooleanDefaultTrue bold = factory.createBooleanDefaultTrue();
                    rpr.setB(bold);
                    run.setRPr(rpr);
                }
                Text t = factory.createText();
                t.setValue(cellText);
                t.setSpace("preserve");
                run.getContent().add(t);
                cp.getContent().add(run);
                tc.getContent().add(cp);
                tr.getContent().add(tc);
            }
            if (isHeaderRow) isHeaderRow = false;
            tbl.getContent().add(tr);
        }
        main.getContent().add(tbl);
    }

    // ---- HTML для PDF ----

    private String buildHtml(Project project, ProjectDetailResponse detail, ExportRequest req) {
        boolean onePerPage = req == null || req.onePerPage();
        StringBuilder sb = new StringBuilder();
        sb.append("<html><head><meta charset=\"UTF-8\"><style>")
                // Базовый шрифт и поля — как в учебных материалах
                .append("@page{margin:2.5cm 2cm;}")
                .append("body{font-family:'DejaVu Sans',Arial,sans-serif;font-size:12pt;line-height:1.5;color:#000;}")
                .append("h1{font-size:16pt;font-weight:bold;text-align:center;margin:0 0 6pt;}")
                .append(".meta{font-size:10pt;color:#333;text-align:center;margin-bottom:14pt;}")
                .append(".ktitle{font-size:14pt;font-weight:bold;text-align:center;margin:0 0 4pt;}")
                .append(".variant{margin-bottom:0;")
                .append(onePerPage ? "page-break-after:always;" : "margin-bottom:24pt;")
                .append("}")
                .append(".vtitle{font-size:13pt;font-weight:bold;text-align:center;")
                .append("border-bottom:1.5pt solid #000;padding-bottom:3pt;margin:14pt 0 10pt;}")
                // Поля для подписи ученика
                .append(".fields{font-size:10pt;color:#000;margin-bottom:10pt;line-height:2;}")
                .append(".fields span{display:inline-block;min-width:180pt;border-bottom:0.75pt solid #333;margin-right:18pt;}")
                // Задание
                .append(".task{margin:10pt 0;}")
                .append(".tnum{font-weight:bold;}")
                // Таблицы
                .append("table{border-collapse:collapse;margin:6pt 0;width:auto;}")
                .append("th,td{border:1pt solid #555;padding:4pt 7pt;font-size:11pt;text-align:left;min-height:18pt;}")
                .append("th{background:#f0f0f0;font-weight:bold;}")
                .append("td.empty-cell{min-width:70pt;min-height:24pt;}")
                // Раздел ответов
                .append(".answers{page-break-before:always;}")
                .append(".ans{margin:3pt 0;font-size:11pt;}")
                // Бейдж сложности
                .append(".diff-badge{font-size:9pt;font-weight:normal;padding:1pt 5pt;border-radius:3pt;background:#e5e7eb;color:#374151;vertical-align:middle;margin-left:6pt;}")
                // Фигуры
                .append(".figure{border:1pt solid #999;background:#f9f9f9;padding:6pt 8pt;margin:6pt 0;border-radius:3pt;font-size:11pt;}")
                .append("</style></head><body>");

        sb.append("<h1>").append(esc(detail.title())).append("</h1>");
        sb.append("<div class=\"meta\">").append(esc(metaLine(project))).append("</div>");

        boolean isFirst = true;
        for (VariantResponse variant : detail.variants()) {
            sb.append("<div class=\"variant\">");

            // Опциональное название комплекта
            if (req != null && req.hasKitName()) {
                sb.append("<div class=\"ktitle\">").append(esc(req.kitName())).append("</div>");
            }

            // Заголовок варианта с опциональным уровнем сложности
            sb.append("<div class=\"vtitle\">Вариант ").append(variant.index());
            if (req != null && req.showDifficulty() && variant.difficulty() != null) {
                sb.append(" <span class=\"diff-badge\">").append(difficultyLabel(variant.difficulty())).append("</span>");
            }
            sb.append("</div>");
            sb.append(fieldsHtml(req));
            int n = 1;
            for (TaskResponse task : variant.tasks()) {
                sb.append("<div class=\"task\"><span class=\"tnum\">").append(n).append(".&nbsp;</span>")
                        .append(contentToHtml(task.text()));
                // Прикреплённое фото (отдельное поле)
                if (task.photoUrl() != null && !task.photoUrl().isBlank()) {
                    String src = fetchImageAsDataUrl(task.photoUrl());
                    if (src != null) {
                        sb.append("<div style=\"margin:6pt 0;\">")
                          .append("<img src=\"").append(esc(src))
                          .append("\" style=\"max-width:100%;max-height:280pt;display:block;\" /></div>");
                    }
                }
                sb.append("</div>");
                n++;
            }
            sb.append("</div>");
            isFirst = false;
        }

        if (req != null && req.includeAnswers()) {
            sb.append("<div class=\"answers\"><div class=\"vtitle\">Ответы (для учителя)</div>");
            for (VariantResponse variant : detail.variants()) {
                sb.append("<p><b>Вариант ").append(variant.index()).append("</b></p>");
                int n = 1;
                for (TaskResponse task : variant.tasks()) {
                    sb.append("<div class=\"ans\">").append(n).append(")&nbsp;")
                            .append(contentToHtml(nullToDash(task.answer())))
                            .append("</div>");
                    n++;
                }
            }
            sb.append("</div>");
        }

        sb.append("</body></html>");
        return sb.toString();
    }

    /** Текст задания → HTML: формулы, Markdown-таблицы, [РИСУНОК:...], [ФУНКЦИЯ:{...}], [ИЗОБРАЖЕНИЕ:...]. */
    private String contentToHtml(String text) {
        if (text == null || text.isEmpty()) return "";
        text = expandTestOptionsForHtml(text);
        StringBuilder sb = new StringBuilder();
        Matcher m = ALL_INLINE.matcher(text);
        int last = 0;
        while (m.find()) {
            if (m.start() > last) sb.append(blocksToHtml(text.substring(last, m.start())));
            String graphJson = m.group(1); // ФУНКЦИЯ
            String imageUrl  = m.group(2); // ИЗОБРАЖЕНИЕ
            if (graphJson != null) {
                sb.append(renderGraphHtml(graphJson));
            } else if (imageUrl != null) {
                sb.append(renderImageHtml(imageUrl.trim()));
            } else {
                String inner = m.group()
                        .replaceFirst("^\\[[^:]*:\\s*", "")
                        .replaceFirst("\\]$", "");
                sb.append("<div class=\"figure\">📐 ").append(esc(readable(inner)).replace("\n", "<br/>")).append("</div>");
            }
            last = m.end();
        }
        if (last < text.length()) sb.append(blocksToHtml(text.substring(last)));
        return sb.toString();
    }

    /** Парсит JSON конфига графика и возвращает inline SVG для PDF. */
    private String renderGraphHtml(String json) {
        try {
            if (json == null || json.isEmpty() || json.length() > 500) return "";
            String fn = extractJsonString(json, "fn");
            if (fn == null || fn.isBlank() || fn.length() > 200) return "";

            double xMin = extractJsonDouble(json, "xMin", -5);
            double xMax = extractJsonDouble(json, "xMax", 5);
            double yMin = extractJsonDouble(json, "yMin", 0);
            double yMax = extractJsonDouble(json, "yMax", 0);

            if (xMax <= xMin) xMax = xMin + 10;

            String svg = graphSvgRenderer.renderSvg(fn, xMin, xMax, yMin, yMax);
            return "<div style=\"margin:6pt 0;\">" + svg + "</div>";
        } catch (Exception e) {
            log.warn("Не удалось отрисовать график: {}", e.getMessage());
            return "";
        }
    }

    /** Рендерит [ИЗОБРАЖЕНИЕ: url] → тег &lt;img&gt; с встроенным base64 для iText. */
    private String renderImageHtml(String url) {
        String src = fetchImageAsDataUrl(url);
        if (src == null) return "";
        return "<div style=\"margin:6pt 0;\">" +
               "<img src=\"" + esc(src) + "\" style=\"max-width:100%;max-height:200pt;display:block;\" />" +
               "</div>";
    }

    /**
     * Возвращает data URL изображения: для data:... возвращает как есть;
     * для внешних URL скачивает байты и кодирует в base64.
     */
    private String fetchImageAsDataUrl(String url) {
        if (url == null || url.isBlank()) return null;
        if (url.startsWith("data:")) return url;
        url = url.replaceAll("\\s+", "");
        try {
            java.net.URLConnection conn = new java.net.URI(url).toURL().openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");
            conn.connect();
            String mime = conn.getContentType();
            if (mime == null || !mime.startsWith("image/")) mime = guessMime(url);
            int sc = mime.indexOf(';');
            if (sc > 0) mime = mime.substring(0, sc).trim();
            try (InputStream is = conn.getInputStream()) {
                byte[] bytes = is.readAllBytes();
                return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
            }
        } catch (Exception e) {
            log.warn("Не удалось загрузить изображение {}: {}", url, e.getMessage());
            return null;
        }
    }

    /** Декодирует data URL в байты или скачивает внешний URL. */
    private byte[] resolveImageBytes(String url) {
        if (url == null || url.isBlank()) return null;
        if (url.startsWith("data:")) {
            int commaIdx = url.indexOf(',');
            if (commaIdx < 0) return null;
            try {
                return Base64.getDecoder().decode(url.substring(commaIdx + 1).replaceAll("\\s", ""));
            } catch (Exception e) {
                return null;
            }
        }
        url = url.replaceAll("\\s+", "");
        try {
            java.net.URLConnection conn = new java.net.URI(url).toURL().openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");
            try (InputStream is = conn.getInputStream()) {
                return is.readAllBytes();
            }
        } catch (Exception e) {
            log.warn("Не удалось загрузить изображение {}: {}", url, e.getMessage());
            return null;
        }
    }

    private String guessMime(String url) {
        String u = url.toLowerCase();
        if (u.contains(".png")) return "image/png";
        if (u.contains(".gif")) return "image/gif";
        if (u.contains(".webp")) return "image/webp";
        if (u.contains(".svg")) return "image/svg+xml";
        return "image/jpeg";
    }

    private String extractJsonString(String json, String key) {
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    private double extractJsonDouble(String json, String key, double def) {
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*(-?[0-9.]+)");
        Matcher m = p.matcher(json);
        return m.find() ? Double.parseDouble(m.group(1)) : def;
    }

    private String blocksToHtml(String segment) {
        StringBuilder sb = new StringBuilder();
        List<String> table = new ArrayList<>();
        List<String> txt = new ArrayList<>();
        for (String line : segment.split("\n", -1)) {
            if (countChar(line, '|') >= 2) {
                flushText(sb, txt);
                table.add(line);
            } else {
                flushTable(sb, table);
                txt.add(line);
            }
        }
        flushText(sb, txt);
        flushTable(sb, table);
        return sb.toString();
    }

    private void flushText(StringBuilder sb, List<String> txt) {
        if (txt.isEmpty()) return;
        String joined = String.join("\n", txt);
        joined = stripMarkdown(joined);
        if (!joined.isBlank()) sb.append(formulaConverter.toHtml(joined));
        txt.clear();
    }

    /**
     * Если в тексте несколько вариантов ответа теста (А), Б), В), Г)) написаны в одну строку,
     * в DOCX оставляет как есть (компактнее), в PDF расширяет на отдельные строки.
     * Поддерживаются русские (А-Г) и латинские (A-D) маркеры.
     */
    private String expandTestOptions(String text) {
        // DOCX экспорт - оставляем как есть (не расширяем на новые строки)
        return text;
    }

    /**
     * Раскрывает варианты ответов на новые строки для HTML/PDF экспорта.
     * Поддерживает заглавные (А-Е) и строчные (а-е) кириллические маркеры, а также Latin (A-E).
     */
    private String expandTestOptionsForHtml(String text) {
        if (text == null) return "";
        if (!text.matches("(?s).*[А-ЕA-Eа-е]\\).*[А-ЕA-Eа-е]\\).*")) return text;
        return text.replaceAll("([^\\n])\\s{0,3}([А-ЕA-Eа-е]\\))", "$1\n$2");
    }

    /** Удаляет markdown-заголовки (#, ##, …) и полужирный (**текст**), не затрагивая LaTeX. */
    private String stripMarkdown(String text) {
        if (text == null) return "";
        text = MD_HEADER.matcher(text).replaceAll("");
        text = MD_BOLD.matcher(text).replaceAll("$1");
        return text;
    }

    private void flushTable(StringBuilder sb, List<String> rows) {
        if (rows.isEmpty()) return;
        sb.append("<table>");
        boolean first = true;
        for (String row : rows) {
            if (isSeparator(row)) { first = false; continue; }
            String cellTag = first ? "th" : "td";
            sb.append("<tr>");
            for (String cell : splitCells(row)) {
                String cellContent = formulaConverter.toHtml(cell.trim());
                boolean isEmpty = cellContent.isBlank();
                // Пустые ячейки делаем шире — ученик должен вписать ответ
                String cls = (!first && isEmpty) ? " class=\"empty-cell\"" : "";
                sb.append("<").append(cellTag).append(cls).append(">")
                  .append(isEmpty ? "&nbsp;" : cellContent)
                  .append("</").append(cellTag).append(">");
            }
            sb.append("</tr>");
            first = false;
        }
        sb.append("</table>");
        rows.clear();
    }

    private boolean isSeparator(String line) {
        return line.contains("-") && line.replaceAll("[\\s:|-]", "").isEmpty();
    }

    private String[] splitCells(String line) {
        String s = line.trim();
        if (s.startsWith("|")) s = s.substring(1);
        if (s.endsWith("|")) s = s.substring(0, s.length() - 1);
        String[] cells = s.split("\\|");
        for (int i = 0; i < cells.length; i++) cells[i] = cells[i].trim();
        return cells;
    }

    private int countChar(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++;
        return n;
    }

    private String fieldsHtml(ExportRequest req) {
        if (req == null || req.includeFields() == null || req.includeFields().isEmpty()) return "";
        StringBuilder sb = new StringBuilder("<div class=\"fields\">");
        if (req.hasField("studentName")) sb.append("<span>Ф.И.О.: ________________________</span>");
        if (req.hasField("className")) sb.append("<span>Класс: ________</span>");
        if (req.hasField("date")) sb.append("<span>Дата: __________</span>");
        if (req.hasField("grade")) sb.append("<span>Оценка: ______</span>");
        if (req.hasField("parentSignature")) sb.append("<span>Подпись родителя: ____________</span>");
        sb.append("</div>");
        return sb.toString();
    }

    private void addFieldsDocx(MainDocumentPart main, ExportRequest req) {
        if (req == null || req.includeFields() == null || req.includeFields().isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        if (req.hasField("studentName")) sb.append("Ф.И.О.: ________________________    ");
        if (req.hasField("className")) sb.append("Класс: ________    ");
        if (req.hasField("date")) sb.append("Дата: __________    ");
        if (req.hasField("grade")) sb.append("Оценка: ______    ");
        if (req.hasField("parentSignature")) sb.append("Подпись родителя: ____________");
        if (sb.length() > 0) main.addParagraphOfText(sb.toString());
    }

    // ---- helpers ----

    private FontProvider buildFontProvider() {
        FontProvider fp = new FontProvider();
        boolean added = false;
        for (String path : FONT_PATHS) {
            try {
                if (new File(path).exists()) {
                    fp.addFont(path);
                    added = true;
                }
            } catch (Exception ignored) {
                // пропускаем недоступный шрифт
            }
        }
        if (!added) {
            fp.addSystemFonts();
        }
        fp.addStandardPdfFonts();
        return fp;
    }

    private String metaLine(Project project) {
        StringBuilder sb = new StringBuilder();
        if (project.getSubject() != null) sb.append(subjectLabel(project.getSubject()));
        if (project.getGrade() != null) sb.append(sb.length() > 0 ? ", " : "").append(project.getGrade()).append(" класс");
        if (project.getTopic() != null && !project.getTopic().isBlank())
            sb.append(sb.length() > 0 ? " · " : "").append(project.getTopic());
        return sb.toString();
    }

    private String subjectLabel(String s) {
        return switch (s) {
            case "math" -> "Математика";
            case "physics" -> "Физика";
            case "chemistry" -> "Химия";
            case "biology" -> "Биология";
            case "russian" -> "Русский язык";
            case "literature" -> "Литература";
            case "english" -> "Английский язык";
            case "history" -> "История";
            case "social_studies" -> "Обществознание";
            case "geography" -> "География";
            case "informatics" -> "Информатика";
            default -> s;
        };
    }

    private String readable(String text) {
        return text == null ? "" : formulaConverter.toReadable(text);
    }

    private String nullToDash(String s) {
        return s == null || s.isBlank() ? "—" : s;
    }

    private String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String difficultyLabel(int d) {
        if (d <= 2) return "базовый";
        if (d == 3) return "средний";
        return "сложный";
    }

    private String filename(Project project, String ext) {
        String base = project.getTopic() != null && !project.getTopic().isBlank()
                ? project.getTopic() : "variant";
        String safe = base.replaceAll("[^а-яА-Яa-zA-Z0-9 _-]", "").trim().replace(' ', '_');
        if (safe.isEmpty()) safe = "variant";
        return safe + "." + ext;
    }
}
