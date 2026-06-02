/**
 * Отображает график функции y = f(x) как inline SVG.
 * Принимает JSON-конфиг: { fn, xMin, xMax, yMin, yMax }.
 */

import { useMemo } from 'react';

interface GraphConfig {
  fn: string;
  xMin: number;
  xMax: number;
  yMin?: number;
  yMax?: number;
}

const W = 420, H = 300;
const PAD_L = 45, PAD_R = 15, PAD_T = 15, PAD_B = 35;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const SAMPLES = 300;

function evalFn(expr: string, x: number): number {
  try {
    if (!expr || expr.length > 200) return NaN;
    // Заменяем математические функции на Math.*
    const sanitized = expr
      // Неявное умножение: 2x → 2*x, 2( → 2*(, )( → )*(, )x → )*x, 2sin → 2*sin.
      // GigaChat часто пишет 2x^2 без звёздочки — без этого график не строится.
      .replace(/([0-9.])([a-zA-Z(])/g, '$1*$2')
      .replace(/(\))([0-9a-zA-Z(])/g, '$1*$2')
      // Вставляем 0 перед унарным минусом (в начале или после открывающей скобки/оператора),
      // чтобы JS не выдавал SyntaxError при -(expr)**n и вычислял -(x^2), а не (-x)^2
      .replace(/(^|[+(,[])-/g, '$10-')
      .replace(/\^/g, '**')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\bln\b/g, 'Math.log')
      .replace(/\blog\b/g, 'Math.log10')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\bpi\b/g, 'Math.PI')
      .replace(/\be\b/g, 'Math.E');
    // Физические переменные (t, v, a, s, …) принимаются как псевдонимы x,
    // чтобы GigaChat мог генерировать физические функции без ошибок
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'x', 't', 'v', 'a', 's', 'T', 'F', 'I', 'U', 'R', 'P', 'Q',
      'V', 'm', 'n', 'k', 'h', 'c', 'p', 'W', 'r', 'l', 'q',
      `"use strict"; return (${sanitized});`,
    );
    const result = fn(
      x, x, x, x, x, x, x, x, x, x, x, x,
      x, x, x, x, x, x, x, x, x, x, x,
    ) as number;
    return isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

function toSvgX(x: number, xMin: number, xMax: number) {
  return PAD_L + (PLOT_W * (x - xMin)) / (xMax - xMin);
}
function toSvgY(y: number, yMin: number, yMax: number) {
  return PAD_T + (PLOT_H * (yMax - y)) / (yMax - yMin);
}

function fmt(v: number, step = 1) {
  // Округляем к ближайшему шагу сетки, чтобы убрать «хвосты» float (−0, 1.9999…)
  const snapped = Math.round(v / step) * step;
  const safe = Object.is(snapped, -0) ? 0 : snapped;
  if (Number.isInteger(safe) && Math.abs(safe) < 1e9) return String(safe);
  // Кол-во знаков после запятой выводим из шага сетки
  const decimals = step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0;
  return safe.toFixed(decimals);
}

/** Ближайшее «красивое» число (1, 2, 5 × 10^k) — для шага сетки. */
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}

/**
 * Подбирает «красивые» границы и шаг оси так, чтобы деления попадали на круглые
 * значения (…, −2, −1, 0, 1, 2, …) и по ним было удобно считывать координаты.
 * Возвращает расширенные границы (min/max), шаг и список значений делений.
 */
function niceAxis(min: number, max: number, maxTicks = 6): { min: number; max: number; step: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max) || max - min < 1e-9) { min = min - 1; max = max + 1; }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

export function FunctionGraphDisplay({ config }: { config: GraphConfig }) {
  const { fn } = config;

  // ── Ось X: «красивые» границы, включающие x=0 ──
  const xAxis = useMemo(() => {
    let lo = Math.min(config.xMin, 0);
    let hi = Math.max(config.xMax, 0, lo + 0.01);
    // небольшой отступ, чтобы ось Y (x=0) не прижималась к краю
    if (config.xMin >= 0) lo = -hi * 0.1;
    else if (config.xMax <= 0) hi = -lo * 0.1;
    return niceAxis(lo, hi, 8);
  }, [config.xMin, config.xMax]);
  const xMin = xAxis.min, xMax = xAxis.max;
  const xStep = xAxis.step, xTicks = xAxis.ticks;

  const { yMin, yMax, yStep, yTicks, points } = useMemo(() => {
    const ys: number[] = [];
    let actualYMin = Infinity, actualYMax = -Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const xi = xMin + ((xMax - xMin) * i) / SAMPLES;
      const y = evalFn(fn, xi);
      ys.push(y);
      if (isFinite(y)) {
        actualYMin = Math.min(actualYMin, y);
        actualYMax = Math.max(actualYMax, y);
      }
    }

    let lo: number, hi: number;
    if (!isFinite(actualYMin)) {
      lo = -5; hi = 5;
    } else {
      const margin = Math.max((actualYMax - actualYMin) * 0.1, 0.5);
      lo = actualYMin - margin;
      hi = actualYMax + margin;
    }
    // Ось X (y=0) всегда должна быть в кадре
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const ax = niceAxis(lo, hi, 6);
    return { yMin: ax.min, yMax: ax.max, yStep: ax.step, yTicks: ax.ticks, points: ys };
  }, [fn, xMin, xMax]);

  // Разбиваем на сегменты (разрывы там где NaN)
  const segments: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const y = points[i];
    if (!isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
      if (cur.length > 1) segments.push(cur.join(' '));
      cur = [];
      continue;
    }
    const xi = xMin + ((xMax - xMin) * i) / SAMPLES;
    const svgX = toSvgX(xi, xMin, xMax);
    const svgY = Math.max(PAD_T, Math.min(PAD_T + PLOT_H, toSvgY(y, yMin, yMax)));
    cur.push(`${svgX.toFixed(1)},${svgY.toFixed(1)}`);
  }
  if (cur.length > 1) segments.push(cur.join(' '));

  // Оси — теперь всегда в диапазоне (xMin<=0<=xMax и yMin<=0<=yMax гарантированы)
  const axisXy = toSvgY(0, yMin, yMax);
  const axisYx = toSvgX(0, xMin, xMax);

  return (
    <svg
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ border: '1px solid #ccc', background: '#fafafa', display: 'block', maxWidth: '100%' }}
      viewBox={`0 0 ${W} ${H}`}
    >
      {/* Сетка — по «красивым» делениям осей */}
      <g stroke="#e0e0e0" strokeWidth={0.5}>
        {xTicks.map((xVal, i) => {
          const svgX = toSvgX(xVal, xMin, xMax);
          return <line key={`gx${i}`} x1={svgX} y1={PAD_T} x2={svgX} y2={PAD_T + PLOT_H} />;
        })}
        {yTicks.map((yVal, j) => {
          const svgY = toSvgY(yVal, yMin, yMax);
          return <line key={`gy${j}`} x1={PAD_L} y1={svgY} x2={PAD_L + PLOT_W} y2={svgY} />;
        })}
      </g>

      {/* Оси — всегда видны, начало координат всегда в диапазоне */}
      <g stroke="#555" strokeWidth={1}>
        <line x1={PAD_L} y1={axisXy} x2={PAD_L + PLOT_W} y2={axisXy} />
        <polygon points={`${PAD_L + PLOT_W},${axisXy} ${PAD_L + PLOT_W - 6},${axisXy - 3} ${PAD_L + PLOT_W - 6},${axisXy + 3}`} fill="#555" />
        <text x={PAD_L + PLOT_W + 2} y={axisXy + 4} fontSize={10} fill="#555">x</text>
      </g>
      <g stroke="#555" strokeWidth={1}>
        <line x1={axisYx} y1={PAD_T} x2={axisYx} y2={PAD_T + PLOT_H} />
        <polygon points={`${axisYx},${PAD_T} ${axisYx - 3},${PAD_T + 6} ${axisYx + 3},${PAD_T + 6}`} fill="#555" />
        <text x={axisYx + 3} y={PAD_T - 3} fontSize={10} fill="#555">y</text>
      </g>

      {/* Метки X (0 не дублируем — он подписан на оси Y) */}
      <g fontSize={9} fill="#555" textAnchor="middle">
        {xTicks.map((xVal, i) => {
          if (Math.abs(xVal) < xStep * 0.5) return null;
          const svgX = toSvgX(xVal, xMin, xMax);
          return <text key={`lx${i}`} x={svgX} y={PAD_T + PLOT_H + 13}>{fmt(xVal, xStep)}</text>;
        })}
      </g>
      {/* Метки Y */}
      <g fontSize={9} fill="#555" textAnchor="end">
        {yTicks.map((yVal, j) => {
          const svgY = toSvgY(yVal, yMin, yMax);
          return <text key={`ly${j}`} x={PAD_L - 4} y={svgY + 3}>{fmt(yVal, yStep)}</text>;
        })}
      </g>

      {/* Кривая */}
      {segments.map((pts, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="#1e6fbf"
          strokeWidth={2}
          strokeLinejoin="round"
          points={pts}
        />
      ))}

      {/* Рамка */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="none" stroke="#999" strokeWidth={1} />
    </svg>
  );
}
