package ru.variantum.service.export;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import ru.variantum.util.FunctionEvaluator;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.GeneralPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Генерирует график функции y=f(x):
 *  - {@link #renderSvg} — inline SVG для экспорта в PDF (iText html2pdf поддерживает SVG);
 *  - {@link #renderPng} — растровый PNG для экспорта в DOCX (Word не умеет SVG).
 *
 * Оси подбираются «красиво» (деления на круглых значениях), подпись формулы не выводится —
 * по графику нельзя угадать формулу (так же, как в UI).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class GraphSvgRenderer {

    private final FunctionEvaluator evaluator;

    private static final int W = 420, H = 300;
    private static final int PAD_L = 45, PAD_R = 15, PAD_T = 15, PAD_B = 35;
    private static final int PLOT_W = W - PAD_L - PAD_R;
    private static final int PLOT_H = H - PAD_T - PAD_B;
    private static final int SAMPLES = 300;

    // ── Геометрия графика (общая для SVG и PNG) ────────────────────────────────

    private static final class Geom {
        double xMin, xMax, yMin, yMax, xStep, yStep;
        double[] xTicks, yTicks;
        double[] ys;
    }

    /** Ближайшее «красивое» число (1, 2, 5 × 10^k). */
    private static double niceNum(double range, boolean round) {
        if (range <= 0) range = 1;
        double exp = Math.floor(Math.log10(range));
        double f = range / Math.pow(10, exp);
        double nf;
        if (round) {
            if (f < 1.5) nf = 1; else if (f < 3) nf = 2; else if (f < 7) nf = 5; else nf = 10;
        } else {
            if (f <= 1) nf = 1; else if (f <= 2) nf = 2; else if (f <= 5) nf = 5; else nf = 10;
        }
        return nf * Math.pow(10, exp);
    }

    private record Axis(double min, double max, double step, double[] ticks) {}

    private static Axis niceAxis(double min, double max, int maxTicks) {
        if (!(max - min > 1e-9)) { min -= 1; max += 1; }
        double range = niceNum(max - min, false);
        double step = niceNum(range / Math.max(1, maxTicks - 1), true);
        double niceMin = Math.floor(min / step) * step;
        double niceMax = Math.ceil(max / step) * step;
        List<Double> ticks = new ArrayList<>();
        for (double v = niceMin; v <= niceMax + step * 0.5; v += step) {
            ticks.add(Math.round(v / step) * step);
        }
        double[] arr = new double[ticks.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = ticks.get(i);
        return new Axis(niceMin, niceMax, step, arr);
    }

    private Geom computeGeom(String fn, double cfgXMin, double cfgXMax, double cfgYMin, double cfgYMax) {
        // Ось X: включаем x=0 с небольшим полем, затем «красивые» границы
        double lo = Math.min(cfgXMin, 0);
        double hi = Math.max(Math.max(cfgXMax, 0.0), lo + 0.01);
        if (cfgXMin >= 0) lo = -hi * 0.1;
        else if (cfgXMax <= 0) hi = -lo * 0.1;
        Axis xa = niceAxis(lo, hi, 8);

        double[] ys = new double[SAMPLES + 1];
        double autoYMin = Double.MAX_VALUE, autoYMax = -Double.MAX_VALUE;
        for (int i = 0; i <= SAMPLES; i++) {
            double xi = xa.min() + (xa.max() - xa.min()) * i / SAMPLES;
            double yi;
            try { yi = evaluator.evaluate(fn, xi); } catch (Exception e) { yi = Double.NaN; }
            ys[i] = yi;
            if (Double.isFinite(yi)) {
                autoYMin = Math.min(autoYMin, yi);
                autoYMax = Math.max(autoYMax, yi);
            }
        }

        double yLo, yHi;
        if (cfgYMin == 0 && cfgYMax == 0) {
            if (!Double.isFinite(autoYMin)) { autoYMin = -5; autoYMax = 5; }
            double margin = Math.max((autoYMax - autoYMin) * 0.1, 0.5);
            yLo = autoYMin - margin;
            yHi = autoYMax + margin;
        } else {
            yLo = cfgYMin;
            yHi = cfgYMax;
        }
        // Ось X (y=0) всегда в кадре
        yLo = Math.min(yLo, 0);
        yHi = Math.max(yHi, 0);
        Axis ya = niceAxis(yLo, yHi, 6);

        Geom g = new Geom();
        g.xMin = xa.min(); g.xMax = xa.max(); g.xStep = xa.step(); g.xTicks = xa.ticks();
        g.yMin = ya.min(); g.yMax = ya.max(); g.yStep = ya.step(); g.yTicks = ya.ticks();
        g.ys = ys;
        return g;
    }

    private double svgX(Geom g, double x) { return PAD_L + PLOT_W * (x - g.xMin) / (g.xMax - g.xMin); }
    private double svgY(Geom g, double y) { return PAD_T + PLOT_H * (g.yMax - y) / (g.yMax - g.yMin); }

    // ── SVG (PDF) ──────────────────────────────────────────────────────────────

    public String renderSvg(String fn, double xMin, double xMax, double yMin, double yMax) {
        try {
            if (fn == null || fn.isBlank()) return errorSvg("Функция не указана");
            Geom g = computeGeom(fn, xMin, xMax, yMin, yMax);

            StringBuilder sb = new StringBuilder();
            sb.append(String.format(
                "<svg width=\"%d\" height=\"%d\" xmlns=\"http://www.w3.org/2000/svg\" " +
                "style=\"border:1px solid #ccc;background:#fafafa;display:block;margin:4pt 0;\">",
                W, H));

            // Сетка
            sb.append("<g stroke=\"#e0e0e0\" stroke-width=\"0.5\">");
            for (double xv : g.xTicks) {
                int x = (int) Math.round(svgX(g, xv));
                sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>", x, PAD_T, x, PAD_T + PLOT_H));
            }
            for (double yv : g.yTicks) {
                int y = (int) Math.round(svgY(g, yv));
                sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>", PAD_L, y, PAD_L + PLOT_W, y));
            }
            sb.append("</g>");

            // Оси
            sb.append("<g stroke=\"#555\" stroke-width=\"1\">");
            int axisY = (int) Math.round(svgY(g, 0));
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>", PAD_L, axisY, PAD_L + PLOT_W, axisY));
            sb.append(String.format("<polygon points=\"%d,%d %d,%d %d,%d\" fill=\"#555\"/>",
                PAD_L + PLOT_W, axisY, PAD_L + PLOT_W - 6, axisY - 3, PAD_L + PLOT_W - 6, axisY + 3));
            int axisX = (int) Math.round(svgX(g, 0));
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>", axisX, PAD_T, axisX, PAD_T + PLOT_H));
            sb.append(String.format("<polygon points=\"%d,%d %d,%d %d,%d\" fill=\"#555\"/>",
                axisX, PAD_T, axisX - 3, PAD_T + 6, axisX + 3, PAD_T + 6));
            sb.append("</g>");

            // Метки X (0 не дублируем — он на оси Y)
            sb.append("<g font-size=\"9\" fill=\"#555\" text-anchor=\"middle\">");
            for (double xv : g.xTicks) {
                if (Math.abs(xv) < g.xStep * 0.5) continue;
                int x = (int) Math.round(svgX(g, xv));
                sb.append(String.format("<text x=\"%d\" y=\"%d\">%s</text>", x, PAD_T + PLOT_H + 13, fmt(xv, g.xStep)));
            }
            sb.append("</g>");
            sb.append("<g font-size=\"9\" fill=\"#555\" text-anchor=\"end\">");
            for (double yv : g.yTicks) {
                int y = (int) Math.round(svgY(g, yv));
                sb.append(String.format("<text x=\"%d\" y=\"%d\">%s</text>", PAD_L - 4, y + 3, fmt(yv, g.yStep)));
            }
            sb.append("</g>");

            // Кривая
            sb.append("<polyline fill=\"none\" stroke=\"#1e6fbf\" stroke-width=\"2\" stroke-linejoin=\"round\" points=\"");
            boolean prevOk = false;
            for (int i = 0; i <= SAMPLES; i++) {
                double yi = g.ys[i];
                if (!Double.isFinite(yi) || yi < g.yMin - (g.yMax - g.yMin) || yi > g.yMax + (g.yMax - g.yMin)) {
                    if (prevOk) sb.append(" \" /><polyline fill=\"none\" stroke=\"#1e6fbf\" stroke-width=\"2\" points=\"");
                    prevOk = false;
                    continue;
                }
                double xi = g.xMin + (g.xMax - g.xMin) * i / SAMPLES;
                int x = (int) Math.round(svgX(g, xi));
                int y = (int) Math.round(Math.max(PAD_T, Math.min(PAD_T + PLOT_H, svgY(g, yi))));
                sb.append(String.format("%d,%d ", x, y));
                prevOk = true;
            }
            sb.append("\" />");

            // Рамка
            sb.append(String.format(
                "<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" fill=\"none\" stroke=\"#999\" stroke-width=\"1\"/>",
                PAD_L, PAD_T, PLOT_W, PLOT_H));

            sb.append("</svg>");
            return sb.toString();
        } catch (Exception e) {
            return errorSvg("Ошибка рендеринга: " + e.getMessage());
        }
    }

    // ── PNG (DOCX) ─────────────────────────────────────────────────────────────

    /** Растровый график для DOCX. Возвращает PNG-байты или null при ошибке. */
    public byte[] renderPng(String fn, double xMin, double xMax, double yMin, double yMax) {
        try {
            if (fn == null || fn.isBlank()) return null;
            // 2x для чёткости на печати
            final int scale = 2;
            Geom g = computeGeom(fn, xMin, xMax, yMin, yMax);

            BufferedImage img = new BufferedImage(W * scale, H * scale, BufferedImage.TYPE_INT_RGB);
            Graphics2D gr = img.createGraphics();
            gr.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            gr.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            gr.scale(scale, scale);

            gr.setColor(new Color(0xFAFAFA));
            gr.fillRect(0, 0, W, H);

            // Сетка
            gr.setColor(new Color(0xE0E0E0));
            gr.setStroke(new BasicStroke(0.5f));
            for (double xv : g.xTicks) {
                int x = (int) Math.round(svgX(g, xv));
                gr.drawLine(x, PAD_T, x, PAD_T + PLOT_H);
            }
            for (double yv : g.yTicks) {
                int y = (int) Math.round(svgY(g, yv));
                gr.drawLine(PAD_L, y, PAD_L + PLOT_W, y);
            }

            // Оси
            gr.setColor(new Color(0x555555));
            gr.setStroke(new BasicStroke(1f));
            int axisY = (int) Math.round(svgY(g, 0));
            gr.drawLine(PAD_L, axisY, PAD_L + PLOT_W, axisY);
            gr.fillPolygon(new int[]{PAD_L + PLOT_W, PAD_L + PLOT_W - 6, PAD_L + PLOT_W - 6},
                           new int[]{axisY, axisY - 3, axisY + 3}, 3);
            int axisX = (int) Math.round(svgX(g, 0));
            gr.drawLine(axisX, PAD_T, axisX, PAD_T + PLOT_H);
            gr.fillPolygon(new int[]{axisX, axisX - 3, axisX + 3},
                           new int[]{PAD_T, PAD_T + 6, PAD_T + 6}, 3);

            // Метки
            gr.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 9));
            for (double xv : g.xTicks) {
                if (Math.abs(xv) < g.xStep * 0.5) continue;
                int x = (int) Math.round(svgX(g, xv));
                String s = fmt(xv, g.xStep);
                int tw = gr.getFontMetrics().stringWidth(s);
                gr.drawString(s, x - tw / 2, PAD_T + PLOT_H + 13);
            }
            for (double yv : g.yTicks) {
                int y = (int) Math.round(svgY(g, yv));
                String s = fmt(yv, g.yStep);
                int tw = gr.getFontMetrics().stringWidth(s);
                gr.drawString(s, PAD_L - 4 - tw, y + 3);
            }

            // Кривая
            gr.setColor(new Color(0x1E6FBF));
            gr.setStroke(new BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            GeneralPath path = new GeneralPath();
            boolean prevOk = false;
            for (int i = 0; i <= SAMPLES; i++) {
                double yi = g.ys[i];
                if (!Double.isFinite(yi) || yi < g.yMin - (g.yMax - g.yMin) || yi > g.yMax + (g.yMax - g.yMin)) {
                    prevOk = false;
                    continue;
                }
                double xi = g.xMin + (g.xMax - g.xMin) * i / SAMPLES;
                float x = (float) svgX(g, xi);
                float y = (float) Math.max(PAD_T, Math.min(PAD_T + PLOT_H, svgY(g, yi)));
                if (!prevOk) path.moveTo(x, y); else path.lineTo(x, y);
                prevOk = true;
            }
            gr.draw(path);

            // Рамка
            gr.setColor(new Color(0x999999));
            gr.setStroke(new BasicStroke(1f));
            gr.drawRect(PAD_L, PAD_T, PLOT_W, PLOT_H);

            gr.dispose();

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(img, "png", baos);
            return baos.toByteArray();
        } catch (Exception e) {
            log.warn("Не удалось отрисовать PNG графика: {}", e.getMessage());
            return null;
        }
    }

    private String errorSvg(String message) {
        return String.format(
            "<svg width=\"%d\" height=\"%d\" xmlns=\"http://www.w3.org/2000/svg\" style=\"border:1px solid #f87171;background:#fee2e2;display:block;margin:4pt 0;\">" +
            "<text x=\"%d\" y=\"%d\" font-size=\"12\" fill=\"#991b1b\" text-anchor=\"middle\">📊 %s</text>" +
            "</svg>",
            W, H, W/2, H/2, escSvg(message));
    }

    /** Форматирует значение деления, округляя к шагу сетки (убирает float-хвосты). */
    private String fmt(double v, double step) {
        double snapped = Math.round(v / step) * step;
        if (snapped == 0) snapped = 0; // убираем -0
        if (snapped == Math.floor(snapped) && Math.abs(snapped) < 1e9) return String.valueOf((int) snapped);
        int decimals = step < 1 ? Math.min(4, (int) Math.ceil(-Math.log10(step))) : 0;
        return String.format("%." + decimals + "f", snapped);
    }

    private String escSvg(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
