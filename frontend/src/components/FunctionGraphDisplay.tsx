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

function fmt(v: number) {
  if (Number.isInteger(v) && Math.abs(v) < 1e9) return String(v);
  return v.toPrecision(3).replace(/\.?0+$/, '');
}

export function FunctionGraphDisplay({ config }: { config: GraphConfig }) {
  const { fn } = config;
  // Включаем x=0 (y-ось), с отступом чтобы ось не прижималась к краю
  const cfgXMin = config.xMin;
  const cfgXMax = config.xMax;
  let xMin = Math.min(cfgXMin, 0);
  let xMax = Math.max(cfgXMax, 0, xMin + 0.01);
  // Добавляем отступ если ось Y (x=0) на самом краю или правее/левее видимой области.
  // Условие >= 0 важно: если xMin=0, ось Y прижата к левому краю — нужен отступ.
  if (cfgXMin >= 0) xMin = -xMax * 0.12;
  else if (cfgXMax <= 0) xMax = -xMin * 0.12;

  const { yMin, yMax, points } = useMemo(() => {
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

    let yMinFinal: number, yMaxFinal: number;
    if (!isFinite(actualYMin)) {
      yMinFinal = -5; yMaxFinal = 5;
    } else {
      const margin = Math.max((actualYMax - actualYMin) * 0.12, 0.5);
      yMinFinal = actualYMin - margin;
      yMaxFinal = actualYMax + margin;
    }

    // Ось X (y=0) должна быть видна и не прижата к краю.
    // Если функция целиком выше/ниже нуля — добавляем отступ, чтобы ось была читаема.
    if (yMinFinal > 0) {
      yMinFinal = -Math.max((yMaxFinal - yMinFinal) * 0.12, 0.5);
    } else if (yMaxFinal < 0) {
      yMaxFinal = Math.max((yMaxFinal - yMinFinal) * 0.12, 0.5);
    }
    if (yMaxFinal - yMinFinal < 0.01) { yMinFinal -= 0.5; yMaxFinal += 0.5; }
    return { yMin: yMinFinal, yMax: yMaxFinal, points: ys };
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

  const gridXCount = Math.min(8, Math.max(4, Math.ceil(xMax - xMin)));
  const gridYCount = Math.min(6, Math.max(4, Math.ceil(yMax - yMin)));

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
      {/* Сетка */}
      <g stroke="#e0e0e0" strokeWidth={0.5}>
        {Array.from({ length: gridXCount + 1 }, (_, i) => {
          const svgX = PAD_L + (PLOT_W * i) / gridXCount;
          return <line key={`gx${i}`} x1={svgX} y1={PAD_T} x2={svgX} y2={PAD_T + PLOT_H} />;
        })}
        {Array.from({ length: gridYCount + 1 }, (_, j) => {
          const svgY = PAD_T + (PLOT_H * j) / gridYCount;
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

      {/* Метки X */}
      <g fontSize={9} fill="#555" textAnchor="middle">
        {Array.from({ length: gridXCount + 1 }, (_, i) => {
          const xVal = xMin + ((xMax - xMin) * i) / gridXCount;
          const svgX = PAD_L + (PLOT_W * i) / gridXCount;
          return <text key={`lx${i}`} x={svgX} y={PAD_T + PLOT_H + 13}>{fmt(xVal)}</text>;
        })}
      </g>
      {/* Метки Y */}
      <g fontSize={9} fill="#555" textAnchor="end">
        {Array.from({ length: gridYCount + 1 }, (_, j) => {
          const yVal = yMax - ((yMax - yMin) * j) / gridYCount;
          const svgY = PAD_T + (PLOT_H * j) / gridYCount;
          return <text key={`ly${j}`} x={PAD_L - 4} y={svgY + 3}>{fmt(yVal)}</text>;
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

      {/* Подпись */}
      <text x={W / 2} y={H - 4} fontSize={10} fill="#1e6fbf" textAnchor="middle">
        y = {fn}
      </text>
    </svg>
  );
}
