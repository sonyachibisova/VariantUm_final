package ru.variantum.util;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Превращает LaTeX-разметку в читаемый Unicode-текст для экспорта в PDF/DOCX,
 * где KaTeX недоступен. На фронте формулы рендерятся KaTeX'ем как есть,
 * а здесь — конвертируются в человекочитаемый вид (x^2 → x², \frac{a}{b} → (a)/(b)).
 */
@Component
public class FormulaConverter {

    private static final Map<String, String> SYMBOLS = Map.ofEntries(
            Map.entry("\\cdot", "·"), Map.entry("\\times", "×"), Map.entry("\\div", "÷"),
            Map.entry("\\pm", "±"), Map.entry("\\mp", "∓"),
            Map.entry("\\leq", "≤"), Map.entry("\\geq", "≥"), Map.entry("\\le", "≤"), Map.entry("\\ge", "≥"),
            Map.entry("\\neq", "≠"), Map.entry("\\approx", "≈"), Map.entry("\\equiv", "≡"),
            Map.entry("\\infty", "∞"), Map.entry("\\Rightarrow", "⇒"), Map.entry("\\rightarrow", "→"),
            Map.entry("\\to", "→"), Map.entry("\\ldots", "…"), Map.entry("\\dots", "…"),
            Map.entry("\\angle", "∠"), Map.entry("\\degree", "°"), Map.entry("\\circ", "°"),
            Map.entry("\\in", "∈"), Map.entry("\\notin", "∉"), Map.entry("\\subset", "⊂"),
            Map.entry("\\cup", "∪"), Map.entry("\\cap", "∩"), Map.entry("\\sum", "Σ"),
            Map.entry("\\prod", "∏"), Map.entry("\\int", "∫"), Map.entry("\\partial", "∂"),
            Map.entry("\\nabla", "∇"), Map.entry("\\perp", "⊥"), Map.entry("\\parallel", "∥")
    );

    private static final Map<String, String> GREEK = Map.ofEntries(
            Map.entry("\\alpha", "α"), Map.entry("\\beta", "β"), Map.entry("\\gamma", "γ"),
            Map.entry("\\delta", "δ"), Map.entry("\\epsilon", "ε"), Map.entry("\\varepsilon", "ε"),
            Map.entry("\\zeta", "ζ"), Map.entry("\\eta", "η"), Map.entry("\\theta", "θ"),
            Map.entry("\\lambda", "λ"), Map.entry("\\mu", "μ"), Map.entry("\\nu", "ν"),
            Map.entry("\\pi", "π"), Map.entry("\\rho", "ρ"), Map.entry("\\sigma", "σ"),
            Map.entry("\\tau", "τ"), Map.entry("\\phi", "φ"), Map.entry("\\varphi", "φ"),
            Map.entry("\\chi", "χ"), Map.entry("\\psi", "ψ"), Map.entry("\\omega", "ω"),
            Map.entry("\\Delta", "Δ"), Map.entry("\\Sigma", "Σ"), Map.entry("\\Omega", "Ω"),
            Map.entry("\\Phi", "Φ"), Map.entry("\\Pi", "Π"), Map.entry("\\Theta", "Θ")
    );

    private static final Map<Character, Character> SUPERSCRIPT = Map.ofEntries(
            Map.entry('0', '⁰'), Map.entry('1', '¹'), Map.entry('2', '²'), Map.entry('3', '³'),
            Map.entry('4', '⁴'), Map.entry('5', '⁵'), Map.entry('6', '⁶'), Map.entry('7', '⁷'),
            Map.entry('8', '⁸'), Map.entry('9', '⁹'), Map.entry('+', '⁺'), Map.entry('-', '⁻'),
            Map.entry('=', '⁼'), Map.entry('(', '⁽'), Map.entry(')', '⁾'), Map.entry('n', 'ⁿ'),
            Map.entry('i', 'ⁱ')
    );

    private static final Map<Character, Character> SUBSCRIPT = Map.ofEntries(
            Map.entry('0', '₀'), Map.entry('1', '₁'), Map.entry('2', '₂'), Map.entry('3', '₃'),
            Map.entry('4', '₄'), Map.entry('5', '₅'), Map.entry('6', '₆'), Map.entry('7', '₇'),
            Map.entry('8', '₈'), Map.entry('9', '₉'), Map.entry('+', '₊'), Map.entry('-', '₋'),
            Map.entry('=', '₌'), Map.entry('(', '₍'), Map.entry(')', '₎')
    );

    private static final Pattern FRAC = Pattern.compile("\\\\d?frac\\{([^{}]*)\\}\\{([^{}]*)\\}");
    private static final Pattern SQRT_N = Pattern.compile("\\\\sqrt\\[([^\\]]*)\\]\\{([^{}]*)\\}");
    private static final Pattern SQRT = Pattern.compile("\\\\sqrt\\{([^{}]*)\\}");
    private static final Pattern SUP_BRACE = Pattern.compile("\\^\\{([^{}]*)\\}");
    private static final Pattern SUB_BRACE = Pattern.compile("_\\{([^{}]*)\\}");
    private static final Pattern SUP_CHAR = Pattern.compile("\\^(\\\\?[0-9A-Za-z+\\-=()])");
    private static final Pattern SUB_CHAR = Pattern.compile("_(\\\\?[0-9A-Za-z+\\-=()])");
    private static final Pattern LEFTOVER_CMD = Pattern.compile("\\\\([a-zA-Z]+)");

    // ─── HTML-рендеринг формул для PDF ────────────────────────────────────────

    /**
     * Конвертирует текст с LaTeX-формулами ($…$ и $$…$$) в HTML с красивым рендерингом
     * для встраивания в PDF через iText html2pdf (поддерживает inline CSS, sup, sub).
     * Обычный текст HTML-экранируется, переносы строк → &lt;br/&gt;.
     */
    public String toHtml(String input) {
        if (input == null || input.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (i < input.length()) {
            if (i + 1 < input.length() && input.startsWith("$$", i)) {
                int end = input.indexOf("$$", i + 2);
                if (end < 0) { sb.append(hesc(input.substring(i))); break; }
                sb.append(latexToHtml(input.substring(i + 2, end), true));
                i = end + 2;
            } else if (input.charAt(i) == '$') {
                int end = findClosingDollar(input, i + 1);
                if (end < 0) { sb.append(hesc(String.valueOf(input.charAt(i)))); i++; continue; }
                sb.append(latexToHtml(input.substring(i + 1, end), false));
                i = end + 1;
            } else if (input.startsWith("\\(", i)) {
                int end = input.indexOf("\\)", i + 2);
                if (end < 0) { sb.append(hesc(input.substring(i))); break; }
                sb.append(latexToHtml(input.substring(i + 2, end), false));
                i = end + 2;
            } else if (input.startsWith("\\[", i)) {
                int end = input.indexOf("\\]", i + 2);
                if (end < 0) { sb.append(hesc(input.substring(i))); break; }
                sb.append(latexToHtml(input.substring(i + 2, end), true));
                i = end + 2;
            } else {
                int next = nextDollar(input, i);
                String text = next < 0 ? input.substring(i) : input.substring(i, next);
                sb.append(hesc(text).replace("\n", "<br/>"));
                i = next < 0 ? input.length() : next;
            }
        }
        return sb.toString();
    }

    private int findClosingDollar(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (s.charAt(i) == '$') return i;
            if (s.charAt(i) == '\n') return -1;
        }
        return -1;
    }

    private int nextDollar(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (s.charAt(i) == '$') return i;
            if (s.startsWith("\\(", i) || s.startsWith("\\[", i)) return i;
        }
        return -1;
    }

    private String latexToHtml(String latex, boolean display) {
        String content = processLatexHtml(latex.trim());
        if (display) {
            return "<span style=\"display:block;text-align:center;margin:4pt 0;font-style:italic;\">" + content + "</span>";
        }
        return "<span style=\"display:inline-block;vertical-align:middle;font-style:italic;\">" + content + "</span>";
    }

    private String processLatexHtml(String s) {
        s = s.replace("\\left", "").replace("\\right", "");
        for (int pass = 0; pass < 6; pass++) {
            String prev = s;
            s = applyFracHtml(s);
            s = applySqrtHtml(s);
            if (s.equals(prev)) break;
        }
        s = applySupSubHtml(s);
        for (var e : GREEK.entrySet()) s = s.replace(e.getKey(), e.getValue());
        for (var e : SYMBOLS.entrySet()) s = s.replace(e.getKey(), e.getValue());
        s = s.replace("\\,", " ").replace("\\;", " ").replace("\\!", "").replace("\\ ", " ");
        s = s.replace("\\%", "%").replace("\\#", "#");
        s = replaceAll(LEFTOVER_CMD, s, m -> m.group(1));
        s = s.replace("{", "").replace("}", "");
        return s;
    }

    private String applyFracHtml(String s) {
        return replaceAll(FRAC, s, m -> {
            String num = m.group(1);
            String den = m.group(2);
            return "<span style=\"display:inline-block;vertical-align:middle;text-align:center;line-height:1.1;\">" +
                   "<span style=\"display:block;border-bottom:1px solid currentColor;padding:0 3px;min-width:10px;\">" + num + "</span>" +
                   "<span style=\"display:block;padding:0 3px;\">" + den + "</span>" +
                   "</span>";
        });
    }

    private String applySqrtHtml(String s) {
        s = replaceAll(SQRT_N, s, m ->
            "<span style=\"font-size:0.85em;vertical-align:super;\">" + m.group(1) + "</span>" +
            "√<span style=\"text-decoration:overline;padding:0 1px;\">" + m.group(2) + "</span>"
        );
        s = replaceAll(SQRT, s, m ->
            "√<span style=\"text-decoration:overline;padding:0 1px;\">" + m.group(1) + "</span>"
        );
        return s;
    }

    private String applySupSubHtml(String s) {
        s = replaceAll(SUP_BRACE, s, m -> "<sup>" + m.group(1) + "</sup>");
        s = replaceAll(SUB_BRACE, s, m -> "<sub>" + m.group(1) + "</sub>");
        s = replaceAll(SUP_CHAR, s, m -> "<sup>" + stripBackslash(m.group(1)) + "</sup>");
        s = replaceAll(SUB_CHAR, s, m -> "<sub>" + stripBackslash(m.group(1)) + "</sub>");
        return s;
    }

    private String hesc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    // ─── Unicode-рендеринг (для DOCX) ─────────────────────────────────────────

    /** Конвертирует строку с возможными LaTeX-фрагментами в читаемый текст. */
    public String toReadable(String input) {
        if (input == null || input.isEmpty()) return input;
        String s = input;

        // 1. снимаем разделители формул
        s = s.replace("$$", "").replace("\\(", "").replace("\\)", "")
                .replace("\\[", "").replace("\\]", "");
        s = s.replace("$", "");

        // 2. убираем \left \right
        s = s.replace("\\left", "").replace("\\right", "");

        // 3. символы и греческие буквы
        for (var e : SYMBOLS.entrySet()) s = s.replace(e.getKey(), e.getValue());
        for (var e : GREEK.entrySet()) s = s.replace(e.getKey(), e.getValue());

        // 4. дроби и корни (несколько проходов для вложенности)
        for (int i = 0; i < 4; i++) {
            String before = s;
            s = replaceAll(FRAC, s, m -> "(" + m.group(1) + ")/(" + m.group(2) + ")");
            s = replaceAll(SQRT_N, s, m -> superscript(m.group(1)) + "√(" + m.group(2) + ")");
            s = replaceAll(SQRT, s, m -> "√(" + m.group(1) + ")");
            if (before.equals(s)) break;
        }

        // 5. степени и индексы
        s = replaceAll(SUP_BRACE, s, m -> superscript(m.group(1)));
        s = replaceAll(SUB_BRACE, s, m -> subscript(m.group(1)));
        s = replaceAll(SUP_CHAR, s, m -> superscript(stripBackslash(m.group(1))));
        s = replaceAll(SUB_CHAR, s, m -> subscript(stripBackslash(m.group(1))));

        // 6. остаточные команды \xxx → xxx, спецпробелы
        s = s.replace("\\,", " ").replace("\\;", " ").replace("\\!", "").replace("\\ ", " ");
        s = s.replace("\\%", "%").replace("\\#", "#");
        s = replaceAll(LEFTOVER_CMD, s, m -> m.group(1));

        // 7. чистим скобки разметки и лишние пробелы
        s = s.replace("{", "").replace("}", "");
        s = s.replaceAll("[ \\t]{2,}", " ");
        return s;
    }

    private String superscript(String content) {
        if (content == null || content.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        boolean allMapped = true;
        for (char c : content.toCharArray()) {
            Character mapped = SUPERSCRIPT.get(c);
            if (mapped == null) { allMapped = false; break; }
            out.append(mapped);
        }
        return allMapped ? out.toString() : "^(" + content + ")";
    }

    private String subscript(String content) {
        if (content == null || content.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        boolean allMapped = true;
        for (char c : content.toCharArray()) {
            Character mapped = SUBSCRIPT.get(c);
            if (mapped == null) { allMapped = false; break; }
            out.append(mapped);
        }
        return allMapped ? out.toString() : "_(" + content + ")";
    }

    private String stripBackslash(String s) {
        return s.startsWith("\\") ? s.substring(1) : s;
    }

    private String replaceAll(Pattern pattern, String input, java.util.function.Function<Matcher, String> fn) {
        Matcher m = pattern.matcher(input);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(sb, Matcher.quoteReplacement(fn.apply(m)));
        }
        m.appendTail(sb);
        return sb.toString();
    }
}
