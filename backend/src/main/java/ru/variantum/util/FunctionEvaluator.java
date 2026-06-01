package ru.variantum.util;

import org.springframework.stereotype.Component;

/**
 * Потокобезопасный вычислитель математических выражений.
 * Поддерживает: x, числа, +, -, *, /, ^, sin, cos, tan, sqrt, abs, ln, log, exp, pi, e.
 * Использует recursive descent parsing.
 */
@Component
public class FunctionEvaluator {

    public double evaluate(String expression, double x) {
        String expr = expression.trim()
                .replace(" ", "")
                .replace("π", "pi")
                .replace("**", "^");
        return new Parser(expr, x).parseExpr();
    }

    public boolean isValid(String expression) {
        try {
            evaluate(expression, 0.0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ─── Внутренний парсер (один экземпляр на вызов — потокобезопасно) ─────────

    private static class Parser {
        private final String expr;
        private final double x;
        private int pos;

        Parser(String expr, double x) {
            this.expr = expr;
            this.x = x;
            this.pos = 0;
        }

        double parseExpr() {
            double result = parseTerm();
            while (pos < expr.length()) {
                char c = expr.charAt(pos);
                if (c == '+') { pos++; result += parseTerm(); }
                else if (c == '-') { pos++; result -= parseTerm(); }
                else break;
            }
            return result;
        }

        private double parseTerm() {
            double result = parseUnary();
            while (pos < expr.length()) {
                char c = expr.charAt(pos);
                if (c == '*') { pos++; result *= parseUnary(); }
                else if (c == '/') { pos++; double d = parseUnary(); result = d == 0 ? Double.NaN : result / d; }
                else break;
            }
            return result;
        }

        // Унарный минус имеет МЕНЬШИЙ приоритет чем ^, поэтому -x^2 = -(x^2), а не (-x)^2
        private double parseUnary() {
            if (pos < expr.length() && expr.charAt(pos) == '-') { pos++; return -parsePower(); }
            if (pos < expr.length() && expr.charAt(pos) == '+') { pos++; }
            return parsePower();
        }

        private double parsePower() {
            double base = parsePrimary();
            if (pos < expr.length() && expr.charAt(pos) == '^') {
                pos++;
                double exp = parseUnary(); // правоассоциативно: -2^3 = -(2^3)
                return Math.pow(base, exp);
            }
            return base;
        }

        private double parsePrimary() {
            if (pos >= expr.length()) return 0;
            char c = expr.charAt(pos);

            if (c == '(') {
                pos++;
                double val = parseExpr();
                if (pos < expr.length() && expr.charAt(pos) == ')') pos++;
                return val;
            }

            if (Character.isDigit(c) || c == '.') {
                int start = pos;
                while (pos < expr.length() && (Character.isDigit(expr.charAt(pos)) || expr.charAt(pos) == '.')) pos++;
                return Double.parseDouble(expr.substring(start, pos));
            }

            if (Character.isLetter(c)) {
                int start = pos;
                while (pos < expr.length() && Character.isLetter(expr.charAt(pos))) pos++;
                String name = expr.substring(start, pos);
                return switch (name) {
                    // Физические переменные — псевдонимы x (генерируются GigaChat для физики)
                    case "x", "t", "v", "a", "s", "T", "F", "I", "U", "R", "P", "Q",
                         "V", "m", "n", "k", "h", "c", "p", "W", "r", "l", "q" -> x;
                    case "pi" -> Math.PI;
                    case "e" -> Math.E;
                    case "sin" -> Math.sin(parseParenArg());
                    case "cos" -> Math.cos(parseParenArg());
                    case "tan" -> Math.tan(parseParenArg());
                    case "sqrt" -> { double v = parseParenArg(); yield v < 0 ? Double.NaN : Math.sqrt(v); }
                    case "abs" -> Math.abs(parseParenArg());
                    case "ln", "log" -> { double v = parseParenArg(); yield v <= 0 ? Double.NaN : Math.log(v); }
                    case "exp" -> Math.exp(parseParenArg());
                    default -> throw new IllegalArgumentException("Unknown function: " + name);
                };
            }

            throw new IllegalArgumentException("Unexpected char: " + c);
        }

        private double parseParenArg() {
            if (pos < expr.length() && expr.charAt(pos) == '(') {
                pos++;
                double val = parseExpr();
                if (pos < expr.length() && expr.charAt(pos) == ')') pos++;
                return val;
            }
            return parsePrimary();
        }
    }
}
