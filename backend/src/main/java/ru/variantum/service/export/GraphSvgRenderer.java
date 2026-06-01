package ru.variantum.service.export;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import ru.variantum.util.FunctionEvaluator;

/**
 * Генерирует inline SVG для графика функции y=f(x).
 * Используется при экспорте в PDF (iText html2pdf поддерживает SVG).
 */
@Component
@RequiredArgsConstructor
public class GraphSvgRenderer {

    private final FunctionEvaluator evaluator;

    private static final int W = 420, H = 300;
    private static final int PAD_L = 45, PAD_R = 15, PAD_T = 15, PAD_B = 35;
    private static final int PLOT_W = W - PAD_L - PAD_R;
    private static final int PLOT_H = H - PAD_T - PAD_B;
    private static final int SAMPLES = 300;

    public String renderSvg(String fn, double xMin, double xMax, double yMin, double yMax) {
        try {
            if (fn == null || fn.isBlank()) return errorSvg("Функция не указана");
            // Включаем x=0 (ось Y) с отступом, чтобы ось не прижималась к краю графика
            double origXMin = xMin, origXMax = xMax;
            xMin = Math.min(xMin, 0);
            xMax = Math.max(Math.max(xMax, 0.0), xMin + 0.01);
            if (origXMin >= 0) xMin = -xMax * 0.12;   // ось Y на краю или правее — добавляем поле слева
            else if (origXMax <= 0) xMax = -xMin * 0.12;   // ось Y на краю или левее — добавляем поле справа
            if (xMax <= xMin) return errorSvg("xMax должен быть > xMin");

            double[] ys = new double[SAMPLES + 1];
            double autoYMin = Double.MAX_VALUE, autoYMax = -Double.MAX_VALUE;
            for (int i = 0; i <= SAMPLES; i++) {
                double xi = xMin + (xMax - xMin) * i / SAMPLES;
                double yi;
                try { yi = evaluator.evaluate(fn, xi); } catch (Exception e) { yi = Double.NaN; }
                ys[i] = yi;
                if (Double.isFinite(yi)) {
                    autoYMin = Math.min(autoYMin, yi);
                    autoYMax = Math.max(autoYMax, yi);
                }
            }
            if (yMin == 0 && yMax == 0) {
                // Автомасштаб
                if (!Double.isFinite(autoYMin)) { autoYMin = -5; autoYMax = 5; }
                double margin = Math.max((autoYMax - autoYMin) * 0.12, 0.5);
                yMin = autoYMin - margin;
                yMax = autoYMax + margin;
            }
            // Ось X (y=0) должна быть видна и не прижата к краю
            if (yMin > 0) {
                yMin = -Math.max((yMax - yMin) * 0.12, 0.5);
            } else if (yMax < 0) {
                yMax = Math.max((yMax - yMin) * 0.12, 0.5);
            }
            if (yMax - yMin < 0.01) { yMin -= 0.5; yMax += 0.5; }
            final double fxMin = xMin, fxMax = xMax, fyMin = yMin, fyMax = yMax;

        StringBuilder sb = new StringBuilder();
        sb.append(String.format(
            "<svg width=\"%d\" height=\"%d\" xmlns=\"http://www.w3.org/2000/svg\" " +
            "style=\"border:1px solid #ccc;background:#fafafa;display:block;margin:4pt 0;\">",
            W, H));

        // Сетка
        sb.append("<g stroke=\"#e0e0e0\" stroke-width=\"0.5\">");
        int gridX = Math.min(8, (int)(xMax - xMin));
        int gridY = Math.min(6, (int)(yMax - yMin));
        if (gridX < 2) gridX = 4;
        if (gridY < 2) gridY = 4;
        for (int i = 0; i <= gridX; i++) {
            int svgX = PAD_L + (int)(PLOT_W * i / gridX);
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>",
                svgX, PAD_T, svgX, PAD_T + PLOT_H));
        }
        for (int j = 0; j <= gridY; j++) {
            int svgY = PAD_T + (int)(PLOT_H * j / gridY);
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>",
                PAD_L, svgY, PAD_L + PLOT_W, svgY));
        }
        sb.append("</g>");

        // Оси
        sb.append("<g stroke=\"#555\" stroke-width=\"1\">");
        // Ось X (y=0)
        if (fyMin <= 0 && fyMax >= 0) {
            int axisY = PAD_T + (int)(PLOT_H * (fyMax - 0) / (fyMax - fyMin));
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>",
                PAD_L, axisY, PAD_L + PLOT_W, axisY));
            sb.append(String.format("<polygon points=\"%d,%d %d,%d %d,%d\" fill=\"#555\"/>",
                PAD_L + PLOT_W, axisY,
                PAD_L + PLOT_W - 6, axisY - 3,
                PAD_L + PLOT_W - 6, axisY + 3));
        }
        // Ось Y (x=0)
        if (fxMin <= 0 && fxMax >= 0) {
            int axisX = PAD_L + (int)(PLOT_W * (0 - fxMin) / (fxMax - fxMin));
            sb.append(String.format("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"/>",
                axisX, PAD_T, axisX, PAD_T + PLOT_H));
            sb.append(String.format("<polygon points=\"%d,%d %d,%d %d,%d\" fill=\"#555\"/>",
                axisX, PAD_T,
                axisX - 3, PAD_T + 6,
                axisX + 3, PAD_T + 6));
        }
        sb.append("</g>");

        // Метки осей
        sb.append("<g font-size=\"9\" fill=\"#555\" text-anchor=\"middle\">");
        for (int i = 0; i <= gridX; i++) {
            double xVal = fxMin + (fxMax - fxMin) * i / gridX;
            int svgX = PAD_L + (int)(PLOT_W * i / gridX);
            sb.append(String.format("<text x=\"%d\" y=\"%d\">%s</text>",
                svgX, PAD_T + PLOT_H + 13, fmt(xVal)));
        }
        sb.append("</g>");
        sb.append("<g font-size=\"9\" fill=\"#555\" text-anchor=\"end\">");
        for (int j = 0; j <= gridY; j++) {
            double yVal = fyMax - (fyMax - fyMin) * j / gridY;
            int svgY = PAD_T + (int)(PLOT_H * j / gridY);
            sb.append(String.format("<text x=\"%d\" y=\"%d\">%s</text>",
                PAD_L - 4, svgY + 3, fmt(yVal)));
        }
        sb.append("</g>");

        // Кривая функции
        sb.append("<polyline fill=\"none\" stroke=\"#1e6fbf\" stroke-width=\"2\" stroke-linejoin=\"round\" points=\"");
        boolean started = false;
        boolean prevOk = false;
        for (int i = 0; i <= SAMPLES; i++) {
            double yi = ys[i];
            if (!Double.isFinite(yi) || yi < fyMin - (fyMax - fyMin) || yi > fyMax + (fyMax - fyMin)) {
                if (prevOk && started) sb.append(" \" /><polyline fill=\"none\" stroke=\"#1e6fbf\" stroke-width=\"2\" points=\"");
                prevOk = false;
                continue;
            }
            double xi = fxMin + (fxMax - fxMin) * i / SAMPLES;
            int svgX = PAD_L + (int)(PLOT_W * (xi - fxMin) / (fxMax - fxMin));
            int svgY = PAD_T + (int)(PLOT_H * (fyMax - yi) / (fyMax - fyMin));
            svgY = Math.max(PAD_T, Math.min(PAD_T + PLOT_H, svgY));
            sb.append(String.format("%d,%d ", svgX, svgY));
            started = true;
            prevOk = true;
        }
        sb.append("\" />");

        // Рамка
        sb.append(String.format(
            "<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" fill=\"none\" stroke=\"#999\" stroke-width=\"1\"/>",
            PAD_L, PAD_T, PLOT_W, PLOT_H));

        // Подпись функции
        String label = "y = " + fn;
        sb.append(String.format(
            "<text x=\"%d\" y=\"%d\" font-size=\"10\" fill=\"#1e6fbf\" text-anchor=\"middle\">%s</text>",
            W / 2, H - 4, escSvg(label)));

        sb.append("</svg>");
        return sb.toString();
        } catch (Exception e) {
            return errorSvg("Ошибка рендеринга: " + e.getMessage());
        }
    }

    private String errorSvg(String message) {
        return String.format(
            "<svg width=\"%d\" height=\"%d\" xmlns=\"http://www.w3.org/2000/svg\" style=\"border:1px solid #f87171;background:#fee2e2;display:block;margin:4pt 0;\">" +
            "<text x=\"%d\" y=\"%d\" font-size=\"12\" fill=\"#991b1b\" text-anchor=\"middle\">📊 %s</text>" +
            "</svg>",
            W, H, W/2, H/2, escSvg(message));
    }

    private String fmt(double v) {
        if (v == Math.floor(v) && Math.abs(v) < 1e9) return String.valueOf((int) v);
        return String.format("%.2g", v);
    }

    private String escSvg(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
