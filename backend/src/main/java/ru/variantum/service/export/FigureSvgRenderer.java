package ru.variantum.service.export;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Рендер геометрических фигур и графиков в SVG-строку для встраивания в HTML/PDF.
 *
 * Поддерживаемые типы (ключ "type" в figure-объекте):
 *   triangle        — треугольник с подписями вершин и сторон
 *   quadrilateral   — четырёхугольник (subtype: rectangle | parallelogram | trapezoid)
 *   circle          — окружность с подписями
 *   coordinatePlane — координатная плоскость с графиком функции
 *   numberLine      — числовая ось с отмеченными точками
 */
public final class FigureSvgRenderer {

    private FigureSvgRenderer() {}

    /** Вспомогательные типы для рендера geometry-фигур. */
    private record GeoPt(String id, double x, double y, boolean rightAngle, boolean dot, String label) {}
    private record GeoLbl(String text, double x, double y) {}

    private static final int W = 320;   // ширина SVG
    private static final int H = 240;   // высота SVG
    private static final String STROKE = "#374151";   // основной цвет линий
    private static final String ACCENT = "#6d28d9";   // акцентный (фиолетовый)
    private static final String AXIS   = "#9ca3af";   // цвет осей/сетки
    private static final String FONT   = "font-family='DejaVu Sans,Arial,sans-serif'";

    // ------------------------------------------------------------------ public

    /**
     * Генерирует HTML-фрагмент с inline SVG по figure-объекту.
     * Возвращает пустую строку, если тип не поддерживается или данные некорректны.
     */
    public static String render(Map<String, Object> figure) {
        if (figure == null || figure.isEmpty()) return "";
        String type = str(figure, "type");
        try {
            return switch (type) {
                case "geometry"        -> geometry(figure);
                case "triangle"        -> triangle(figure);
                case "quadrilateral"   -> quadrilateral(figure);
                case "circle"          -> circle(figure);
                case "coordinatePlane" -> coordinatePlane(figure);
                case "numberLine"      -> numberLine(figure);
                default                -> fallbackCaption(figure);
            };
        } catch (Exception e) {
            return fallbackCaption(figure);
        }
    }

    // ------------------------------------------------------------------ triangle

    @SuppressWarnings("unchecked")
    private static String triangle(Map<String, Object> f) {
        // Получаем длины сторон; ключи — имена сторон "AB", "BC", "AC"
        Map<String, Object> sides = mapOf(f, "sides");
        List<String> labels = listStr(f, "labels");

        // Имена вершин: по умолчанию A, B, C
        String vA = label(labels, 0, "A");
        String vB = label(labels, 1, "B");
        String vC = label(labels, 2, "C");

        // Длины сторон (c = AB, a = BC, b = AC)
        double c = side(sides, vA + vB, vB + vA, 80);   // сторона AB
        double a = side(sides, vB + vC, vC + vB, 100);  // сторона BC
        double b = side(sides, vA + vC, vC + vA, 60);   // сторона AC

        // Координаты вершин (A в начале, B на оси x, C из теоремы косинусов)
        double cosA = (b * b + c * c - a * a) / (2 * b * c);
        cosA = Math.max(-1, Math.min(1, cosA));
        double sinA = Math.sqrt(1 - cosA * cosA);

        double[] A = {0, 0};
        double[] B = {c, 0};
        double[] C = {b * cosA, -b * sinA};   // Y перевёрнут в SVG

        // Нормализуем в область 40..280 x 30..200
        double[] xs = {A[0], B[0], C[0]};
        double[] ys = {A[1], B[1], C[1]};
        double[] nA = norm(A[0], A[1], xs, ys);
        double[] nB = norm(B[0], B[1], xs, ys);
        double[] nC = norm(C[0], C[1], xs, ys);

        String points = fmt(nA) + " " + fmt(nB) + " " + fmt(nC);

        // Метки углов из figure.angles
        Map<String, Object> angles = mapOf(f, "angles");
        String angA = angleLabel(angles, vA);
        String angB = angleLabel(angles, vB);
        String angC = angleLabel(angles, vC);

        StringBuilder svg = new StringBuilder(svgOpen());
        svg.append("<polygon points='").append(points)
                .append("' fill='none' stroke='").append(STROKE).append("' stroke-width='2'/>");

        // Метки вершин
        vertexLabel(svg, nA, vA + (angA.isEmpty() ? "" : " " + angA), -1, -1);
        vertexLabel(svg, nB, vB + (angB.isEmpty() ? "" : " " + angB), 1, -1);
        vertexLabel(svg, nC, vC + (angC.isEmpty() ? "" : " " + angC), 0, 1);

        // Метки сторон
        sideLabel(svg, nA, nB, formatSide(c));
        sideLabel(svg, nB, nC, formatSide(a));
        sideLabel(svg, nA, nC, formatSide(b));

        svg.append(svgClose());
        return wrap(svg.toString());
    }

    // ------------------------------------------------------------------ quadrilateral

    @SuppressWarnings("unchecked")
    private static String quadrilateral(Map<String, Object> f) {
        String subtype = str(f, "subtype");
        List<String> labels = listStr(f, "labels");
        Map<String, Object> sides = mapOf(f, "sides");

        String vA = label(labels, 0, "A");
        String vB = label(labels, 1, "B");
        String vC = label(labels, 2, "C");
        String vD = label(labels, 3, "D");

        double w = numOf(sides, vA + vB, vB + vA, 100);
        double h = numOf(sides, vB + vC, vC + vB, 70);
        double angle = dbl(f, "angle", 70);   // угол при основании для параллелограмма

        double x1 = 50, y1 = 190, x2 = x1 + w * 1.8, y2 = y1;
        double x4, y4, x3, y3;

        if ("trapezoid".equals(subtype)) {
            double top = numOf(sides, vD + vA, vA + vD, w * 0.6);
            x4 = x1 + (w - top) / 2;
            y4 = y1 - h * 1.5;
            x3 = x4 + top * 1.8;
            y3 = y4;
        } else if ("parallelogram".equals(subtype)) {
            double shift = h / Math.tan(Math.toRadians(angle));
            x4 = x1 + shift;
            y4 = y1 - h * 1.5;
            x3 = x2 + shift;
            y3 = y4;
        } else {
            // rectangle (по умолчанию)
            x4 = x1;
            y4 = y1 - h * 1.5;
            x3 = x2;
            y3 = y4;
        }

        String pts = p(x1, y1) + " " + p(x2, y2) + " " + p(x3, y3) + " " + p(x4, y4);
        StringBuilder svg = new StringBuilder(svgOpen());
        svg.append("<polygon points='").append(pts)
                .append("' fill='none' stroke='").append(STROKE).append("' stroke-width='2'/>");

        // Метки вершин
        label2(svg, x1, y1, vA, -10, 14);
        label2(svg, x2, y2, vB, 6, 14);
        label2(svg, x3, y3, vC, 6, -4);
        label2(svg, x4, y4, vD, -10, -4);

        // Метки сторон
        sideLabel2(svg, x1, y1, x2, y2, formatSide(w));
        sideLabel2(svg, x2, y2, x3, y3, formatSide(h));
        if ("trapezoid".equals(subtype)) {
            sideLabel2(svg, x4, y4, x3, y3, formatSide(numOf(sides, vD + vA, vA + vD, w * 0.6)));
        }

        svg.append(svgClose());
        return wrap(svg.toString());
    }

    // ------------------------------------------------------------------ circle

    @SuppressWarnings("unchecked")
    private static String circle(Map<String, Object> f) {
        String center = str(f, "center");
        if (center == null || center.isBlank()) center = "O";
        double radius = dbl(f, "radius", 80);
        double cx = W / 2.0, cy = H / 2.0;
        double scale = Math.min((W - 60) / 2.0, (H - 60) / 2.0) / radius;
        double r = radius * scale;

        StringBuilder svg = new StringBuilder(svgOpen());
        svg.append("<circle cx='").append(fmt1(cx)).append("' cy='").append(fmt1(cy))
                .append("' r='").append(fmt1(r))
                .append("' fill='none' stroke='").append(STROKE).append("' stroke-width='2'/>");

        // Точка центра
        svg.append("<circle cx='").append(fmt1(cx)).append("' cy='").append(fmt1(cy))
                .append("' r='3' fill='").append(STROKE).append("'/>");
        label2(svg, cx, cy, center, 6, -4);

        // Дополнительные элементы (radius, chord, diameter)
        List<Map<String, Object>> elements = listOf(f, "elements");
        for (Map<String, Object> el : elements) {
            String elType = str(el, "type");
            String from   = str(el, "from");
            String to     = str(el, "to");
            double length = dbl(el, "length", radius);
            double angleR = Math.toRadians(dbl(el, "angleDeg", 30));

            double fx = cx + r * Math.cos(angleR);
            double fy = cy - r * Math.sin(angleR);
            double tx = cx + r * Math.cos(angleR + Math.PI);
            double ty = cy - r * Math.sin(angleR + Math.PI);

            if ("radius".equals(elType) || "diameter".equals(elType)) {
                svg.append("<line x1='").append(fmt1(cx)).append("' y1='").append(fmt1(cy))
                        .append("' x2='").append(fmt1(fx)).append("' y2='").append(fmt1(fy))
                        .append("' stroke='").append(ACCENT).append("' stroke-width='1.5'/>");
                if (from != null) { svg.append("<circle cx='").append(fmt1(cx)).append("' cy='").append(fmt1(cy)).append("' r='3' fill='").append(STROKE).append("'/>"); }
                if (to != null) {
                    svg.append("<circle cx='").append(fmt1(fx)).append("' cy='").append(fmt1(fy)).append("' r='3' fill='").append(STROKE).append("'/>");
                    label2(svg, fx, fy, to, 6, -4);
                }
                sideLabel2(svg, cx, cy, fx, fy, formatSide(length));
                if ("diameter".equals(elType)) {
                    svg.append("<line x1='").append(fmt1(cx)).append("' y1='").append(fmt1(cy))
                            .append("' x2='").append(fmt1(tx)).append("' y2='").append(fmt1(ty))
                            .append("' stroke='").append(ACCENT).append("' stroke-width='1.5'/>");
                }
            } else if ("chord".equals(elType)) {
                double ax = cx + r * Math.cos(angleR);
                double ay = cy - r * Math.sin(angleR);
                double bx = cx + r * Math.cos(angleR + Math.PI * 0.6);
                double by = cy - r * Math.sin(angleR + Math.PI * 0.6);
                svg.append("<line x1='").append(fmt1(ax)).append("' y1='").append(fmt1(ay))
                        .append("' x2='").append(fmt1(bx)).append("' y2='").append(fmt1(by))
                        .append("' stroke='").append(ACCENT).append("' stroke-width='1.5'/>");
                if (from != null) label2(svg, ax, ay, from, 6, -4);
                if (to != null)   label2(svg, bx, by, to,   6,  6);
                sideLabel2(svg, ax, ay, bx, by, formatSide(length));
            }
        }

        svg.append(svgClose());
        return wrap(svg.toString());
    }

    // ------------------------------------------------------------------ coordinatePlane

    @SuppressWarnings("unchecked")
    private static String coordinatePlane(Map<String, Object> f) {
        List<Object> xRangeRaw = listRaw(f, "xRange");
        List<Object> yRangeRaw = listRaw(f, "yRange");
        double xMin = xRangeRaw.size() >= 1 ? toDouble(xRangeRaw.get(0), -5) : -5;
        double xMax = xRangeRaw.size() >= 2 ? toDouble(xRangeRaw.get(1), 5)  : 5;
        double yMin = yRangeRaw.size() >= 1 ? toDouble(yRangeRaw.get(0), -5) : -5;
        double yMax = yRangeRaw.size() >= 2 ? toDouble(yRangeRaw.get(1), 5)  : 5;

        // Подписи осей (поддержка физических обозначений типа "t, с" / "v, м/с")
        String xLbl = strFirst(f, "xLabel", "xAxis", "xlabel");
        String yLbl = strFirst(f, "yLabel", "yAxis", "ylabel");
        if (xLbl == null || xLbl.isBlank()) xLbl = "x";
        if (yLbl == null || yLbl.isBlank()) yLbl = "y";

        double pad = 40;
        double pw = W - 2 * pad, ph = H - 2 * pad;
        double xScale = pw / (xMax - xMin);
        double yScale = ph / (yMax - yMin);
        double ox = pad + (-xMin) * xScale;  // origin x
        double oy = pad + (yMax) * yScale;   // origin y (y-axis инвертирован)

        StringBuilder svg = new StringBuilder(svgOpen());

        // Сетка — выбираем «красивый» шаг
        double xStep = niceStep(xMax - xMin, 7);
        double yStep = niceStep(yMax - yMin, 6);
        for (double gv = Math.ceil(xMin / xStep) * xStep; gv <= xMax + 1e-9; gv += xStep) {
            double gx = ox + gv * xScale;
            svg.append("<line x1='").append(fmt1(gx)).append("' y1='").append(fmt1(pad))
                    .append("' x2='").append(fmt1(gx)).append("' y2='").append(fmt1(H - pad))
                    .append("' stroke='").append(AXIS).append("' stroke-width='0.5'/>");
        }
        for (double gv = Math.ceil(yMin / yStep) * yStep; gv <= yMax + 1e-9; gv += yStep) {
            double gy = oy - gv * yScale;
            svg.append("<line x1='").append(fmt1(pad)).append("' y1='").append(fmt1(gy))
                    .append("' x2='").append(fmt1(W - pad)).append("' y2='").append(fmt1(gy))
                    .append("' stroke='").append(AXIS).append("' stroke-width='0.5'/>");
        }

        // Оси
        svg.append("<line x1='").append(fmt1(pad)).append("' y1='").append(fmt1(oy))
                .append("' x2='").append(fmt1(W - pad)).append("' y2='").append(fmt1(oy))
                .append("' stroke='").append(STROKE).append("' stroke-width='2' marker-end='url(#arr)'/>");
        svg.append("<line x1='").append(fmt1(ox)).append("' y1='").append(fmt1(H - pad))
                .append("' x2='").append(fmt1(ox)).append("' y2='").append(fmt1(pad))
                .append("' stroke='").append(STROKE).append("' stroke-width='2' marker-end='url(#arr)'/>");

        // Подписи осей
        svg.append("<text x='").append(fmt1(W - pad + 4)).append("' y='").append(fmt1(oy + 4))
                .append("' ").append(FONT).append(" font-size='11' fill='").append(STROKE).append("'>")
                .append(esc(xLbl)).append("</text>");
        svg.append("<text x='").append(fmt1(ox + 4)).append("' y='").append(fmt1(pad - 4))
                .append("' ").append(FONT).append(" font-size='11' fill='").append(STROKE).append("'>")
                .append(esc(yLbl)).append("</text>");

        // Деления X
        for (double gv = Math.ceil(xMin / xStep) * xStep; gv <= xMax + 1e-9; gv += xStep) {
            if (Math.abs(gv) < 1e-9) continue;
            double gx = ox + gv * xScale;
            String tickLabel = gv == (long) gv ? String.valueOf((long) gv) : String.format("%.1f", gv);
            svg.append("<text x='").append(fmt1(gx - 4)).append("' y='").append(fmt1(oy + 14))
                    .append("' ").append(FONT).append(" font-size='9' fill='").append(AXIS).append("'>")
                    .append(tickLabel).append("</text>");
        }
        // Деления Y
        for (double gv = Math.ceil(yMin / yStep) * yStep; gv <= yMax + 1e-9; gv += yStep) {
            if (Math.abs(gv) < 1e-9) continue;
            double gy = oy - gv * yScale;
            String tickLabel = gv == (long) gv ? String.valueOf((long) gv) : String.format("%.1f", gv);
            svg.append("<text x='").append(fmt1(ox - 4)).append("' y='").append(fmt1(gy + 4))
                    .append("' ").append(FONT).append(" font-size='9' fill='").append(AXIS)
                    .append("' text-anchor='end'>").append(tickLabel).append("</text>");
        }

        // Отсечение всех данных по области графика (внутри осей) — чтобы кривые
        // и отрезки не вылезали в поля и за подписи. id определён в defs ниже.
        final String clip = " clip-path='url(#vu-plot)'";

        // Графики функций
        List<Map<String, Object>> functions = listOf(f, "functions");
        String[] colors = {ACCENT, "#059669", "#dc2626", "#d97706"};
        int ci = 0;
        for (Map<String, Object> fn : functions) {
            String expr = str(fn, "expr");
            String fnLabel = str(fn, "label");
            String color = colors[ci % colors.length]; ci++;
            if (expr == null || expr.isBlank()) continue;
            // Кривая разбивается на сегменты на разрывах и выходах за пределы yRange,
            // остаток подрезается clip-path — поэтому асимптоты не «склеиваются» вертикалью.
            for (String seg : evalFunctionSegments(expr, xMin, xMax, yMin, yMax, ox, oy, xScale, yScale)) {
                svg.append("<polyline points='").append(seg)
                        .append("' fill='none' stroke='").append(color)
                        .append("' stroke-width='2'").append(clip).append("/>");
            }
            if (fnLabel != null && !fnLabel.isBlank()) {
                double lxv = xMin + (xMax - xMin) * 0.7;
                double lyv = evalY(expr, lxv);
                if (Double.isFinite(lyv) && lyv >= yMin && lyv <= yMax) {
                    double lx = ox + lxv * xScale;
                    double ly = oy - lyv * yScale - 6;
                    svg.append("<text x='").append(fmt1(lx)).append("' y='").append(fmt1(ly))
                            .append("' ").append(FONT).append(" font-size='11' fill='").append(color).append("'>")
                            .append(esc(fnLabel)).append("</text>");
                }
            }
        }

        // Прямолинейные отрезки (lines)
        List<Map<String, Object>> lines = listOf(f, "lines");
        for (Map<String, Object> line : lines) {
            double[] fromPt = toSvgPoint(line.get("from"), ox, oy, xScale, yScale);
            double[] toPt   = toSvgPoint(line.get("to"),   ox, oy, xScale, yScale);
            if (fromPt == null || toPt == null) continue;
            String lineLabel = str(line, "label");
            String lColor = colors[ci % colors.length]; ci++;
            svg.append("<line x1='").append(fmt1(fromPt[0])).append("' y1='").append(fmt1(fromPt[1]))
                    .append("' x2='").append(fmt1(toPt[0])).append("' y2='").append(fmt1(toPt[1]))
                    .append("' stroke='").append(lColor).append("' stroke-width='2'").append(clip).append("/>");
            if (lineLabel != null && !lineLabel.isBlank()) {
                svg.append("<text x='").append(fmt1(toPt[0] + 5)).append("' y='").append(fmt1(toPt[1] - 4))
                        .append("' ").append(FONT).append(" font-size='10' fill='").append(lColor).append("'>")
                        .append(esc(lineLabel)).append("</text>");
            }
        }

        // Ломаные (polylines)
        List<Map<String, Object>> polylines = listOf(f, "polylines");
        for (Map<String, Object> pl : polylines) {
            List<Object> rawPts = listRaw(pl, "points");
            String plLabel = str(pl, "label");
            String plColor = colors[ci % colors.length]; ci++;
            StringBuilder ptsBuf = new StringBuilder();
            double[] lastPt = null;
            for (Object raw : rawPts) {
                double[] pt = toSvgPoint(raw, ox, oy, xScale, yScale);
                if (pt == null) continue;
                if (ptsBuf.length() > 0) ptsBuf.append(" ");
                ptsBuf.append(fmt1(pt[0])).append(",").append(fmt1(pt[1]));
                lastPt = pt;
            }
            if (ptsBuf.length() > 0) {
                svg.append("<polyline points='").append(ptsBuf)
                        .append("' fill='none' stroke='").append(plColor)
                        .append("' stroke-width='2'").append(clip).append("/>");
            }
            if (plLabel != null && !plLabel.isBlank() && lastPt != null) {
                svg.append("<text x='").append(fmt1(lastPt[0] + 5)).append("' y='").append(fmt1(lastPt[1] - 4))
                        .append("' ").append(FONT).append(" font-size='10' fill='").append(plColor).append("'>")
                        .append(esc(plLabel)).append("</text>");
            }
        }

        // Точки на плоскости
        List<Map<String, Object>> points = listOf(f, "points");
        for (Map<String, Object> pt : points) {
            double[] svgPt = toSvgPoint(pt, ox, oy, xScale, yScale);
            if (svgPt == null) continue;
            String ptLabel = str(pt, "label");
            svg.append("<circle cx='").append(fmt1(svgPt[0])).append("' cy='").append(fmt1(svgPt[1]))
                    .append("' r='4' fill='").append(ACCENT).append("'/>");
            if (ptLabel != null)
                svg.append("<text x='").append(fmt1(svgPt[0] + 6)).append("' y='").append(fmt1(svgPt[1] - 4))
                        .append("' ").append(FONT).append(" font-size='10' fill='").append(ACCENT).append("'>")
                        .append(esc(ptLabel)).append("</text>");
        }

        // Маркер стрелки + область отсечения графика (defs).
        // SVG разрешает ссылаться на id, определённый ниже по документу.
        String defs = "<defs>"
                + "<marker id='arr' markerWidth='8' markerHeight='8' refX='6' refY='3' orient='auto'>"
                + "<path d='M0,0 L0,6 L8,3 z' fill='" + STROKE + "'/></marker>"
                + "<clipPath id='vu-plot'><rect x='" + fmt1(pad) + "' y='" + fmt1(pad)
                + "' width='" + fmt1(W - 2 * pad) + "' height='" + fmt1(H - 2 * pad) + "'/></clipPath>"
                + "</defs>";

        svg.insert(svgOpen().length(), defs);
        svg.append(svgClose());
        return wrap(svg.toString());
    }

    /** «Красивый» шаг сетки: 1, 2, 5 × 10^n. */
    private static double niceStep(double range, int maxTicks) {
        if (range <= 0 || maxTicks <= 0) return 1;
        double rough = range / maxTicks;
        double mag = Math.pow(10, Math.floor(Math.log10(rough)));
        double norm = rough / mag;
        if (norm <= 1.5) return mag;
        if (norm <= 3.5) return 2 * mag;
        if (norm <= 7.5) return 5 * mag;
        return 10 * mag;
    }

    /**
     * Конвертирует [x,y]-массив или {x,y}-объект в SVG-координаты.
     * Возвращает null, если данные некорректны.
     */
    @SuppressWarnings("unchecked")
    private static double[] toSvgPoint(Object raw, double ox, double oy, double xScale, double yScale) {
        double px, py;
        if (raw instanceof List<?> arr && arr.size() >= 2) {
            px = toDouble(arr.get(0), Double.NaN);
            py = toDouble(arr.get(1), Double.NaN);
        } else if (raw instanceof Map<?,?> m) {
            Map<String, Object> mp = (Map<String, Object>) m;
            px = dbl(mp, "x", Double.NaN);
            py = dbl(mp, "y", Double.NaN);
        } else {
            return null;
        }
        if (!Double.isFinite(px) || !Double.isFinite(py)) return null;
        return new double[]{ox + px * xScale, oy - py * yScale};
    }

    // ------------------------------------------------------------------ numberLine

    @SuppressWarnings("unchecked")
    private static String numberLine(Map<String, Object> f) {
        double min = dbl(f, "min", -5);
        double max = dbl(f, "max", 5);
        double pad = 40;
        double lineY = H / 2.0;
        double scale = (W - 2 * pad) / (max - min);
        double ox = pad + (-min) * scale;

        StringBuilder svg = new StringBuilder(svgOpen());

        // Линия + стрелки
        svg.append("<line x1='").append(fmt1(pad)).append("' y1='").append(fmt1(lineY))
                .append("' x2='").append(fmt1(W - pad)).append("' y2='").append(fmt1(lineY))
                .append("' stroke='").append(STROKE).append("' stroke-width='2'/>");

        // Деления
        for (int i = (int) Math.ceil(min); i <= (int) Math.floor(max); i++) {
            double tx = ox + i * scale;
            svg.append("<line x1='").append(fmt1(tx)).append("' y1='").append(fmt1(lineY - 5))
                    .append("' x2='").append(fmt1(tx)).append("' y2='").append(fmt1(lineY + 5))
                    .append("' stroke='").append(STROKE).append("' stroke-width='1.5'/>");
            svg.append("<text x='").append(fmt1(tx - 4)).append("' y='").append(fmt1(lineY + 18))
                    .append("' ").append(FONT).append(" font-size='11' fill='").append(STROKE).append("'>").append(i).append("</text>");
        }

        // Отмеченные точки
        List<Map<String, Object>> marked = listOf(f, "marked");
        for (Map<String, Object> m : marked) {
            double val = toDouble(m.get("value"), 0);
            boolean open = Boolean.TRUE.equals(m.get("open"));
            String lbl = str(m, "label");
            double mx = ox + val * scale;
            if (open) {
                svg.append("<circle cx='").append(fmt1(mx)).append("' cy='").append(fmt1(lineY))
                        .append("' r='6' fill='white' stroke='").append(ACCENT).append("' stroke-width='2'/>");
            } else {
                svg.append("<circle cx='").append(fmt1(mx)).append("' cy='").append(fmt1(lineY))
                        .append("' r='6' fill='").append(ACCENT).append("'/>");
            }
            if (lbl != null)
                svg.append("<text x='").append(fmt1(mx - 4)).append("' y='").append(fmt1(lineY - 12))
                        .append("' ").append(FONT).append(" font-size='12' fill='").append(ACCENT).append("'>")
                        .append(esc(lbl)).append("</text>");
        }

        // Сегменты закрашенной области
        List<Map<String, Object>> segments = listOf(f, "segments");
        for (Map<String, Object> seg : segments) {
            double from = toDouble(seg.get("from"), min);
            double to   = toDouble(seg.get("to"),   max);
            double sx = ox + from * scale;
            double ex = ox + to * scale;
            svg.append("<line x1='").append(fmt1(sx)).append("' y1='").append(fmt1(lineY))
                    .append("' x2='").append(fmt1(ex)).append("' y2='").append(fmt1(lineY))
                    .append("' stroke='").append(ACCENT).append("' stroke-width='4' opacity='0.4'/>");
        }

        svg.append(svgClose());
        return wrap(svg.toString());
    }

    // ------------------------------------------------------------------ geometry (универсальный)

    @SuppressWarnings("unchecked")
    private static String geometry(Map<String, Object> f) {
        List<Object> rawPts  = listRaw(f, "points");
        List<Object> rawSegs = listRaw(f, "segments");
        List<Object> rawLbls = listRaw(f, "labels");

        if (rawPts.isEmpty()) return "";

        // Парсим точки
        List<GeoPt> pts = new ArrayList<>();
        Map<String, GeoPt> ptMap = new LinkedHashMap<>();

        for (Object raw : rawPts) {
            if (!(raw instanceof Map<?,?> pm)) continue;
            Map<String, Object> m = (Map<String, Object>) pm;
            String id = str(m, "id");
            if (id == null || id.isBlank()) continue;
            double x = dbl(m, "x", 0), y = dbl(m, "y", 0);
            boolean ra  = Boolean.TRUE.equals(m.get("rightAngle"));
            boolean dot = !Boolean.FALSE.equals(m.get("dot"));
            String lbl  = m.containsKey("label")
                    ? (m.get("label") != null ? m.get("label").toString() : "") : id;
            GeoPt pt = new GeoPt(id, x, y, ra, dot, lbl);
            pts.add(pt);
            ptMap.put(id, pt);
        }
        if (pts.isEmpty()) return "";

        // Парсим дополнительные метки
        List<GeoLbl> lbls = new ArrayList<>();
        for (Object raw : rawLbls) {
            if (!(raw instanceof Map<?,?> lm)) continue;
            Map<String, Object> m = (Map<String, Object>) lm;
            String t = str(m, "text");
            if (t != null && !t.isBlank())
                lbls.add(new GeoLbl(t, dbl(m, "x", 0), dbl(m, "y", 0)));
        }

        // Bounding box по точкам и меткам
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE;
        double minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (GeoPt p : pts) {
            minX = Math.min(minX, p.x()); maxX = Math.max(maxX, p.x());
            minY = Math.min(minY, p.y()); maxY = Math.max(maxY, p.y());
        }
        for (GeoLbl l : lbls) {
            minX = Math.min(minX, l.x()); maxX = Math.max(maxX, l.x());
            minY = Math.min(minY, l.y()); maxY = Math.max(maxY, l.y());
        }

        double padX = 52, padY = 44;
        double rx = (maxX - minX < 1e-9) ? 1 : maxX - minX;
        double ry = (maxY - minY < 1e-9) ? 1 : maxY - minY;
        double sc  = Math.min((W - 2 * padX) / rx, (H - 2 * padY) / ry);
        double offX = (W - rx * sc) / 2.0;
        double offY = (H - ry * sc) / 2.0;

        // Центроид для направления подписей (вершины подписываем наружу)
        double centX = pts.stream().mapToDouble(GeoPt::x).average().orElse(0);
        double centY = pts.stream().mapToDouble(GeoPt::y).average().orElse(0);

        // Размер маркера прямого угла в единицах исходных координат
        double SQ = 10.0 / sc;

        StringBuilder svg = new StringBuilder(svgOpen());

        // Рёбра
        for (Object rawSeg : rawSegs) {
            String seg = rawSeg.toString().trim();
            boolean extend = seg.endsWith(":e");
            if (extend) seg = seg.substring(0, seg.length() - 2).trim();
            int dash = seg.indexOf('-');
            if (dash <= 0 || dash == seg.length() - 1) continue;
            GeoPt pa = ptMap.get(seg.substring(0, dash).trim());
            GeoPt pb = ptMap.get(seg.substring(dash + 1).trim());
            if (pa == null || pb == null) continue;
            double x1 = geoSvgX(pa.x(), offX, minX, sc);
            double y1 = geoSvgY(pa.y(), offY, maxY, sc);
            double x2 = geoSvgX(pb.x(), offX, minX, sc);
            double y2 = geoSvgY(pb.y(), offY, maxY, sc);
            if (extend) {
                double[] cl = clipLineToSvg(x1, y1, x2, y2, 8);
                x1 = cl[0]; y1 = cl[1]; x2 = cl[2]; y2 = cl[3];
            }
            svg.append("<line x1='").append(fmt1(x1)).append("' y1='").append(fmt1(y1))
               .append("' x2='").append(fmt1(x2)).append("' y2='").append(fmt1(y2))
               .append("' stroke='").append(STROKE).append("' stroke-width='1.8'/>");
        }

        // Точки, подписи, маркеры прямых углов
        for (GeoPt pt : pts) {
            double sx = geoSvgX(pt.x(), offX, minX, sc);
            double sy = geoSvgY(pt.y(), offY, maxY, sc);

            // Направление подписи: от центроида наружу
            double dx = pt.x() - centX, dy = pt.y() - centY;
            double dlen = Math.sqrt(dx * dx + dy * dy);
            if (dlen < 1e-9) { dx = 0; dy = -1; } else { dx /= dlen; dy /= dlen; }
            double lox = dx * 16, loy = -dy * 16; // SVG Y перевёрнут

            if (pt.dot()) {
                svg.append("<circle cx='").append(fmt1(sx)).append("' cy='").append(fmt1(sy))
                   .append("' r='2' fill='").append(STROKE).append("'/>");
            }
            if (pt.label() != null && !pt.label().isBlank()) {
                svg.append("<text x='").append(fmt1(sx + lox - 5)).append("' y='").append(fmt1(sy + loy + 5))
                   .append("' ").append(FONT).append(" font-size='12' font-weight='600' fill='")
                   .append(STROKE).append("'>").append(esc(pt.label())).append("</text>");
            }

            // Маркер прямого угла: ориентируем по двум первым примыкающим сегментам
            if (pt.rightAngle()) {
                List<String[]> touching = new ArrayList<>();
                for (Object rawSeg : rawSegs) {
                    String seg = rawSeg.toString().trim();
                    if (seg.endsWith(":e")) seg = seg.substring(0, seg.length() - 2).trim();
                    int dash = seg.indexOf('-');
                    if (dash <= 0 || dash == seg.length() - 1) continue;
                    String aid = seg.substring(0, dash).trim();
                    String bid = seg.substring(dash + 1).trim();
                    if (aid.equals(pt.id()) || bid.equals(pt.id()))
                        touching.add(new String[]{aid, bid});
                }

                if (touching.size() >= 2) {
                    double[] u1 = geoSegDir(pt, touching.get(0), ptMap, SQ);
                    double[] u2 = geoSegDir(pt, touching.get(1), ptMap, SQ);
                    double q1x = geoSvgX(pt.x() + u1[0], offX, minX, sc);
                    double q1y = geoSvgY(pt.y() + u1[1], offY, maxY, sc);
                    double q2x = geoSvgX(pt.x() + u1[0] + u2[0], offX, minX, sc);
                    double q2y = geoSvgY(pt.y() + u1[1] + u2[1], offY, maxY, sc);
                    double q3x = geoSvgX(pt.x() + u2[0], offX, minX, sc);
                    double q3y = geoSvgY(pt.y() + u2[1], offY, maxY, sc);
                    svg.append("<polyline points='")
                       .append(fmt1(q1x)).append(",").append(fmt1(q1y)).append(" ")
                       .append(fmt1(q2x)).append(",").append(fmt1(q2y)).append(" ")
                       .append(fmt1(q3x)).append(",").append(fmt1(q3y))
                       .append("' fill='none' stroke='").append(STROKE).append("' stroke-width='1.5'/>");
                } else {
                    // Фолбэк: горизонтально-вертикальный квадрат
                    svg.append("<polyline points='")
                       .append(fmt1(sx + 10)).append(",").append(fmt1(sy)).append(" ")
                       .append(fmt1(sx + 10)).append(",").append(fmt1(sy - 10)).append(" ")
                       .append(fmt1(sx)).append(",").append(fmt1(sy - 10))
                       .append("' fill='none' stroke='").append(STROKE).append("' stroke-width='1.5'/>");
                }
            }
        }

        // Дополнительные текстовые метки (номера углов и т.п.)
        for (GeoLbl l : lbls) {
            double lsx = geoSvgX(l.x(), offX, minX, sc);
            double lsy = geoSvgY(l.y(), offY, maxY, sc);
            svg.append("<text x='").append(fmt1(lsx - 4)).append("' y='").append(fmt1(lsy + 4))
               .append("' ").append(FONT).append(" font-size='11' fill='").append(ACCENT)
               .append("'>").append(esc(l.text())).append("</text>");
        }

        svg.append(svgClose());
        return wrap(svg.toString());
    }

    private static double geoSvgX(double x, double offX, double minX, double scale) {
        return offX + (x - minX) * scale;
    }

    private static double geoSvgY(double y, double offY, double maxY, double scale) {
        return offY + (maxY - y) * scale;
    }

    /**
     * Обрезает бесконечную прямую (две точки в SVG-координатах) до прямоугольника
     * [pad, W-pad] × [pad, H-pad]. Алгоритм Лянга-Барски.
     * @return [x1, y1, x2, y2] — конечные точки обрезанного отрезка.
     */
    private static double[] clipLineToSvg(double x1, double y1, double x2, double y2, double pad) {
        double dx = x2 - x1, dy = y2 - y1;
        double tMin = -1e9, tMax = 1e9;

        double[] p = {-dx, dx, -dy, dy};
        double[] q = {x1 - pad, (W - pad) - x1, y1 - pad, (H - pad) - y1};

        for (int k = 0; k < 4; k++) {
            if (Math.abs(p[k]) < 1e-10) {
                if (q[k] < 0) return new double[]{x1, y1, x2, y2}; // параллельна и снаружи
            } else {
                double t = q[k] / p[k];
                if (p[k] < 0) tMin = Math.max(tMin, t);
                else          tMax = Math.min(tMax, t);
            }
        }
        if (tMin > tMax) return new double[]{x1, y1, x2, y2};
        return new double[]{
            x1 + tMin * dx, y1 + tMin * dy,
            x1 + tMax * dx, y1 + tMax * dy,
        };
    }

    private static double[] geoSegDir(GeoPt pt, String[] parts, Map<String, GeoPt> ptMap, double SQ) {
        String othId = parts[0].equals(pt.id()) ? parts[1] : parts[0];
        GeoPt other  = ptMap.get(othId);
        if (other == null) return new double[]{SQ, 0};
        double dx = other.x() - pt.x(), dy = other.y() - pt.y();
        double len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) return new double[]{SQ, 0};
        return new double[]{dx / len * SQ, dy / len * SQ};
    }

    // ------------------------------------------------------------------ helpers

    private static String svgOpen() {
        return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + W + " " + H
                + "' width='" + W + "' height='" + H + "'>";
    }
    private static String svgClose() { return "</svg>"; }

    private static String wrap(String svg) {
        return "<div style='margin:8px 0;text-align:center;'>" + svg + "</div>";
    }

    private static String fallbackCaption(Map<String, Object> f) {
        String type = str(f, "type");
        return "<div style='border:1px solid #c7d2fe;background:#eef2ff;padding:6px 8px;"
                + "border-radius:4px;font-size:11pt;margin:6px 0;'>📐 "
                + esc(type != null ? "[Рисунок: " + type + "]" : "[Рисунок]") + "</div>";
    }

    // Нормализация точки в прямоугольник 40..280 × 30..200
    private static double[] norm(double x, double y, double[] xs, double[] ys) {
        double xmin = min(xs), xmax = max(xs), ymin = min(ys), ymax = max(ys);
        double rx = xmax - xmin, ry = ymax - ymin;
        double nx = rx < 1e-9 ? 0.5 : (x - xmin) / rx;
        double ny = ry < 1e-9 ? 0.5 : (y - ymin) / ry;
        return new double[]{40 + nx * 240, 200 - ny * 170};
    }

    private static void vertexLabel(StringBuilder sb, double[] p, String lbl, int dx, int dy) {
        double x = p[0] + dx * 14;
        double y = p[1] + dy * 14;
        sb.append("<text x='").append(fmt1(x)).append("' y='").append(fmt1(y))
                .append("' ").append(FONT).append(" font-size='12' fill='").append(STROKE)
                .append("'>").append(esc(lbl)).append("</text>");
    }

    private static void sideLabel(StringBuilder sb, double[] p1, double[] p2, String lbl) {
        sideLabel2(sb, p1[0], p1[1], p2[0], p2[1], lbl);
    }

    private static void sideLabel2(StringBuilder sb, double x1, double y1, double x2, double y2, String lbl) {
        if (lbl == null || lbl.isBlank()) return;
        double mx = (x1 + x2) / 2 + 6;
        double my = (y1 + y2) / 2 - 4;
        sb.append("<text x='").append(fmt1(mx)).append("' y='").append(fmt1(my))
                .append("' ").append(FONT).append(" font-size='11' fill='").append(ACCENT)
                .append("'>").append(esc(lbl)).append("</text>");
    }

    private static void label2(StringBuilder sb, double x, double y, String lbl, int dx, int dy) {
        sb.append("<text x='").append(fmt1(x + dx)).append("' y='").append(fmt1(y + dy))
                .append("' ").append(FONT).append(" font-size='12' fill='").append(STROKE)
                .append("'>").append(esc(lbl)).append("</text>");
    }

    /**
     * Вычисляет точки графика, разбивая кривую на сегменты в местах разрывов
     * (деление на ноль, корень из отрицательного) и выходов далеко за yRange.
     * Возвращает список строк "x1,y1 x2,y2 ..." — по одной на каждый сегмент.
     */
    private static List<String> evalFunctionSegments(String expr, double xMin, double xMax,
                                                      double yMin, double yMax,
                                                      double ox, double oy, double xScale, double yScale) {
        List<String> segs = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        int count = 0;
        int steps = 300;
        double dx = (xMax - xMin) / steps;
        double tol = (yMax - yMin);   // небольшой запас; остальное подрезает clip-path
        for (int i = 0; i <= steps; i++) {
            double x = xMin + i * dx;
            double y = evalY(expr, x);
            boolean ok = Double.isFinite(y) && y >= yMin - tol && y <= yMax + tol;
            if (ok) {
                double px = ox + x * xScale;
                double py = oy - y * yScale;
                if (cur.length() > 0) cur.append(" ");
                cur.append(fmt1(px)).append(",").append(fmt1(py));
                count++;
            } else {
                if (count >= 2) segs.add(cur.toString());
                cur.setLength(0);
                count = 0;
            }
        }
        if (count >= 2) segs.add(cur.toString());
        return segs;
    }

    /**
     * Корректно вычисляет y = f(x). При любой ошибке разбора возвращает NaN
     * (а НЕ 0 — иначе кривая ложилась бы в прямую y=0).
     */
    private static double evalY(String expr, double x) {
        try {
            return new ExprEval(expr).eval(x);
        } catch (Exception ex) {
            return Double.NaN;
        }
    }

    /**
     * Рекурсивный нисходящий вычислитель арифметических выражений.
     * Грамматика: expr := term (('+'|'-') term)*;  term := factor (('*'|'/') factor)*;
     * factor := ('+'|'-') factor | power;  power := atom ('^' factor)?  (право-ассоциативно);
     * atom := number | '(' expr ')' | func '(' expr ')' | ident.
     *
     * Любой идентификатор-буква (x, t, v, I, U, …) трактуется как независимая переменная x —
     * это согласовано с фронтендом (FigureSvg.tsx), где expr вычисляется через new Function.
     * Поддержаны функции sin/cos/tan/sqrt/abs/ln/log/exp/asin/acos/atan и константы pi, e.
     */
    private static final class ExprEval {
        private final String s;
        private int pos;
        private double xVal;

        ExprEval(String expr) { this.s = expr == null ? "" : expr; }

        double eval(double x) {
            this.xVal = x;
            this.pos = 0;
            double v = parseExpr();
            return v;
        }

        private void skipWs() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++;
        }

        private double parseExpr() {
            double v = parseTerm();
            while (true) {
                skipWs();
                if (pos < s.length() && s.charAt(pos) == '+') { pos++; v += parseTerm(); }
                else if (pos < s.length() && s.charAt(pos) == '-') { pos++; v -= parseTerm(); }
                else break;
            }
            return v;
        }

        private double parseTerm() {
            double v = parseFactor();
            while (true) {
                skipWs();
                if (pos < s.length() && s.charAt(pos) == '*') { pos++; v *= parseFactor(); }
                else if (pos < s.length() && s.charAt(pos) == '/') { pos++; v /= parseFactor(); }
                else break;
            }
            return v;
        }

        private double parseFactor() {
            skipWs();
            if (pos < s.length() && s.charAt(pos) == '+') { pos++; return parseFactor(); }
            if (pos < s.length() && s.charAt(pos) == '-') { pos++; return -parseFactor(); }
            return parsePower();
        }

        private double parsePower() {
            double base = parseAtom();
            skipWs();
            if (pos < s.length() && s.charAt(pos) == '^') {
                pos++;
                double exp = parseFactor();   // право-ассоциативно, допускает унарный минус
                return Math.pow(base, exp);
            }
            return base;
        }

        private double parseAtom() {
            skipWs();
            if (pos >= s.length()) return 0;
            char c = s.charAt(pos);
            if (c == '(') {
                pos++;
                double v = parseExpr();
                skipWs();
                if (pos < s.length() && s.charAt(pos) == ')') pos++;
                return v;
            }
            if (Character.isDigit(c) || c == '.') {
                int start = pos;
                while (pos < s.length()) {
                    char d = s.charAt(pos);
                    boolean sci = (d == '+' || d == '-') && pos > start
                            && (s.charAt(pos - 1) == 'e' || s.charAt(pos - 1) == 'E');
                    if (Character.isDigit(d) || d == '.' || d == 'e' || d == 'E' || sci) pos++;
                    else break;
                }
                return Double.parseDouble(s.substring(start, pos));
            }
            if (Character.isLetter(c)) {
                int start = pos;
                while (pos < s.length() && Character.isLetterOrDigit(s.charAt(pos))) pos++;
                String id = s.substring(start, pos);
                skipWs();
                if (pos < s.length() && s.charAt(pos) == '(') {
                    pos++;
                    double arg = parseExpr();
                    skipWs();
                    if (pos < s.length() && s.charAt(pos) == ')') pos++;
                    return applyFunc(id, arg);
                }
                return resolveVar(id);
            }
            // неизвестный символ — пропускаем
            pos++;
            return parseAtom();
        }

        private double resolveVar(String id) {
            return switch (id) {
                case "pi", "Pi", "PI" -> Math.PI;
                default -> xVal;   // x и любые физические алиасы (t, v, a, s, I, U, …)
            };
        }

        private double applyFunc(String name, double a) {
            return switch (name) {
                case "sin"        -> Math.sin(a);
                case "cos"        -> Math.cos(a);
                case "tan", "tg"  -> Math.tan(a);
                case "sqrt"       -> Math.sqrt(a);
                case "abs"        -> Math.abs(a);
                case "ln"         -> Math.log(a);
                case "log", "lg"  -> Math.log10(a);
                case "exp"        -> Math.exp(a);
                case "asin"       -> Math.asin(a);
                case "acos"       -> Math.acos(a);
                case "atan"       -> Math.atan(a);
                default           -> a;
            };
        }
    }

    // ---- утилиты ----

    /** Возвращает строковое значение первого из существующих ключей. */
    private static String strFirst(Map<String, Object> map, String... keys) {
        if (map == null) return null;
        for (String key : keys) {
            Object v = map.get(key);
            if (v != null) return v.toString();
        }
        return null;
    }

    private static double side(Map<String, Object> sides, String key1, String key2, double def) {
        if (sides == null) return def;
        Object v = sides.containsKey(key1) ? sides.get(key1) : sides.get(key2);
        return v != null ? toDouble(v, def) : def;
    }

    private static double numOf(Map<String, Object> sides, String key1, String key2, double def) {
        return side(sides, key1, key2, def);
    }

    private static double dbl(Map<String, Object> map, String key, double def) {
        if (map == null) return def;
        Object v = map.get(key);
        return v != null ? toDouble(v, def) : def;
    }

    private static double toDouble(Object v, double def) {
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return def; }
    }

    private static String str(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapOf(Map<String, Object> map, String key) {
        if (map == null) return Map.of();
        Object v = map.get(key);
        if (v instanceof Map<?,?> m) return (Map<String, Object>) m;
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<String> listStr(Map<String, Object> map, String key) {
        if (map == null) return List.of();
        Object v = map.get(key);
        if (v instanceof List<?> l) return l.stream().map(Object::toString).toList();
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listOf(Map<String, Object> map, String key) {
        if (map == null) return List.of();
        Object v = map.get(key);
        if (v instanceof List<?> l)
            return l.stream().filter(x -> x instanceof Map<?,?>)
                    .map(x -> (Map<String, Object>) x).toList();
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> listRaw(Map<String, Object> map, String key) {
        if (map == null) return List.of();
        Object v = map.get(key);
        if (v instanceof List<?> l) return (List<Object>) l;
        return List.of();
    }

    private static String label(List<String> list, int idx, String def) {
        return (list != null && list.size() > idx) ? list.get(idx) : def;
    }

    private static String angleLabel(Map<String, Object> angles, String vertex) {
        if (angles == null) return "";
        Object v = angles.get(vertex);
        if (v == null || "null".equals(v.toString())) return "";
        return "=" + fmt1(toDouble(v, 0)) + "°";
    }

    private static String formatSide(double v) {
        if (v == 0) return "";
        if (v == (long) v) return String.valueOf((long) v);
        return String.format("%.1f", v);
    }

    private static String fmt(double[] p) { return fmt1(p[0]) + "," + fmt1(p[1]); }
    private static String p(double x, double y) { return fmt1(x) + "," + fmt1(y); }
    private static String fmt1(double v) {
        if (v == (long) v) return String.valueOf((long) v);
        return String.format("%.1f", v);
    }

    private static double min(double[] arr) { double m = arr[0]; for (double v : arr) if (v < m) m = v; return m; }
    private static double max(double[] arr) { double m = arr[0]; for (double v : arr) if (v > m) m = v; return m; }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
