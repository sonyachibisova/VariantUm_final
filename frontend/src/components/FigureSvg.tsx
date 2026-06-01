/**
 * SVG-рендер геометрических фигур и графиков.
 *
 * Типы: triangle | quadrilateral | circle | coordinatePlane | numberLine | geometry
 *
 * Исправления v2:
 *  - evalY поддерживает физические переменные (t, v, a, s, I, U, …) как алиасы x
 *  - CoordinatePlane: умные деления осей, подписи Y-оси, xLabel/yLabel, lines, polylines
 *  - <defs> стрелки перенесены в корневой SVG (нет конфликтов id между компонентами)
 */

const W = 320;
const H = 240;
const STROKE = '#374151';
const ACCENT = '#6d28d9';
const AXIS_COLOR = '#9ca3af';
const FONT = "DejaVu Sans, Arial, sans-serif";
const PALETTE = [ACCENT, '#059669', '#dc2626', '#d97706', '#0284c7'];

type FigureData = Record<string, unknown>;

// ------------------------------------------------------------------ helpers

function num(v: unknown, def = 0): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? def : n;
}
function str(v: unknown): string { return v != null ? String(v) : ''; }
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }
function obj(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>) : {};
}
function sideVal(sides: Record<string, unknown>, k1: string, k2: string, def: number): number {
  const v = sides[k1] ?? sides[k2];
  return v != null ? num(v, def) : def;
}
function fmtN(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Извлекает [x, y] из массива [x,y] или объекта {x,y} */
function toPoint(v: unknown): [number, number] | null {
  if (Array.isArray(v) && v.length >= 2) return [num(v[0]), num(v[1])];
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const px = o.x ?? o[0];
    const py = o.y ?? o[1];
    if (px !== undefined && py !== undefined) return [num(px), num(py)];
  }
  return null;
}

/** Алгоритм Лянга-Барски: обрезает прямую до прямоугольника */
function clipLineToSvg(
  x1: number, y1: number, x2: number, y2: number, pad = 8,
): [number, number, number, number] {
  const dx = x2 - x1, dy = y2 - y1;
  let tMin = -1e9, tMax = 1e9;
  const check = (p: number, q: number) => {
    if (Math.abs(p) < 1e-10) { if (q < 0) tMin = 1e9; }
    else { const t = q / p; if (p < 0) tMin = Math.max(tMin, t); else tMax = Math.min(tMax, t); }
  };
  check(-dx, x1 - pad); check(dx, (W - pad) - x1);
  check(-dy, y1 - pad); check(dy, (H - pad) - y1);
  if (tMin > tMax) return [x1, y1, x2, y2];
  return [x1 + tMin * dx, y1 + tMin * dy, x1 + tMax * dx, y1 + tMax * dy];
}

function normalize(pts: [number, number][], padX = 50, padY = 40): [number, number][] {
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rx = maxX - minX || 1, ry = maxY - minY || 1;
  const sw = W - 2 * padX, sh = H - 2 * padY;
  return pts.map(([x, y]) => [
    padX + ((x - minX) / rx) * sw,
    padY + sh - ((y - minY) / ry) * sh,
  ]);
}

/** Шаг делений: округлённый до «красивых» чисел */
function niceStep(range: number, maxTicks = 7): number {
  const rough = range / maxTicks;
  if (rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  if (norm <= 1.5) return mag;
  if (norm <= 3.5) return 2 * mag;
  if (norm <= 7.5) return 5 * mag;
  return 10 * mag;
}

function makeTicks(min: number, max: number): number[] {
  const step = niceStep(max - min);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.01; v += step) {
    ticks.push(parseFloat(v.toPrecision(10)));
  }
  return ticks;
}

// ------------------------------------------------------------------ evalY (physics-aware)

/**
 * Вычисляет y = f(x) по выражению в JavaScript-синтаксисе.
 * Все стандартные физические переменные (t, v, a, s, I, U, …) привязываются к x,
 * чтобы выражение вида "5*t" работало корректно, даже если GigaChat использует
 * не x, а имя физической величины.
 */
function evalY(expr: string, x: number): number {
  try {
    const e = expr.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    return (new Function(
      'x', 't', 'v', 'a', 's', 'T', 'F', 'I', 'U', 'R', 'P', 'Q',
      'V', 'm', 'n', 'k', 'h', 'c', 'p', 'W', 'r', 'l', 'q',
      `"use strict"; return (${e});`,
    ))(x, x, x, x, x, x, x, x, x, x, x, x,
       x, x, x, x, x, x, x, x, x, x, x) as number;
  } catch { return NaN; }
}

// ------------------------------------------------------------------ Triangle

function Triangle({ f }: { f: FigureData }) {
  const labels = arr<string>(f.labels);
  const sides = obj(f.sides);
  const angles = obj(f.angles);
  const vA = labels[0] ?? 'A', vB = labels[1] ?? 'B', vC = labels[2] ?? 'C';
  const c = sideVal(sides, vA + vB, vB + vA, 80);
  const a = sideVal(sides, vB + vC, vC + vB, 100);
  const b = sideVal(sides, vA + vC, vC + vA, 60);
  let cosA = (b * b + c * c - a * a) / (2 * b * c);
  cosA = Math.max(-1, Math.min(1, cosA));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const pts: [number, number][] = [[0, 0], [c, 0], [b * cosA, b * sinA]];
  const [[nAx, nAy], [nBx, nBy], [nCx, nCy]] = normalize(pts);
  const angLbl = (v: unknown) =>
    v != null && String(v) !== 'null' ? `=${fmtN(num(v))}°` : '';
  const mid = (x1: number, y1: number, x2: number, y2: number) =>
    [(x1 + x2) / 2, (y1 + y2) / 2] as [number, number];
  return (
    <g>
      <polygon points={`${nAx},${nAy} ${nBx},${nBy} ${nCx},${nCy}`}
        fill="none" stroke={STROKE} strokeWidth={2} />
      <SvgLabel x={nAx - 18} y={nAy + 4}>{`${vA}${angLbl(angles[vA])}`}</SvgLabel>
      <SvgLabel x={nBx + 6}  y={nBy + 4}>{`${vB}${angLbl(angles[vB])}`}</SvgLabel>
      <SvgLabel x={nCx - 6}  y={nCy - 8}>{`${vC}${angLbl(angles[vC])}`}</SvgLabel>
      {c > 0 && <SideLabel mid={mid(nAx, nAy, nBx, nBy)} dy={14}>{fmtN(c)}</SideLabel>}
      {a > 0 && <SideLabel mid={mid(nBx, nBy, nCx, nCy)} dx={10}>{fmtN(a)}</SideLabel>}
      {b > 0 && <SideLabel mid={mid(nAx, nAy, nCx, nCy)} dx={-20}>{fmtN(b)}</SideLabel>}
    </g>
  );
}

// ------------------------------------------------------------------ Quadrilateral

function Quadrilateral({ f }: { f: FigureData }) {
  const subtype = str(f.subtype);
  const labels = arr<string>(f.labels);
  const sides = obj(f.sides);
  const vA = labels[0] ?? 'A', vB = labels[1] ?? 'B',
    vC = labels[2] ?? 'C', vD = labels[3] ?? 'D';
  const w = sideVal(sides, vA + vB, vB + vA, 100);
  const h = sideVal(sides, vB + vC, vC + vB, 70);
  const ang = num(f.angle, 70);
  let pts: [number, number][];
  if (subtype === 'parallelogram') {
    const shift = h / Math.tan((ang * Math.PI) / 180);
    pts = [[0, 0], [w, 0], [w + shift, h], [shift, h]];
  } else if (subtype === 'trapezoid') {
    const topW = sideVal(sides, vD + vA, vA + vD, w * 0.6);
    const offset = (w - topW) / 2;
    pts = [[0, 0], [w, 0], [w - offset, h], [offset, h]];
  } else {
    pts = [[0, 0], [w, 0], [w, h], [0, h]];
  }
  const norm = normalize(pts, 44, 36);
  const [nA, nB, nC, nD] = norm;
  const poly = norm.map(([x, y]) => `${x},${y}`).join(' ');
  const mid = (p1: [number, number], p2: [number, number]) =>
    [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as [number, number];
  return (
    <g>
      <polygon points={poly} fill="none" stroke={STROKE} strokeWidth={2} />
      <SvgLabel x={nA[0] - 16} y={nA[1] + 4}>{vA}</SvgLabel>
      <SvgLabel x={nB[0] + 4}  y={nB[1] + 4}>{vB}</SvgLabel>
      <SvgLabel x={nC[0] + 4}  y={nC[1] - 4}>{vC}</SvgLabel>
      <SvgLabel x={nD[0] - 16} y={nD[1] - 4}>{vD}</SvgLabel>
      {w > 0 && <SideLabel mid={mid(nA, nB)} dy={14}>{fmtN(w)}</SideLabel>}
      {h > 0 && <SideLabel mid={mid(nB, nC)} dx={10}>{fmtN(h)}</SideLabel>}
    </g>
  );
}

// ------------------------------------------------------------------ Circle

type CircleElement = { type?: string; from?: string; to?: string; length?: number; angleDeg?: number };

function Circle({ f }: { f: FigureData }) {
  const center = str(f.center) || 'O';
  const radius = num(f.radius, 80);
  const cx = W / 2, cy = H / 2;
  const scale = Math.min((W - 60) / 2, (H - 60) / 2) / radius;
  const r = radius * scale;
  const elements = arr<CircleElement>(f.elements);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={STROKE} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={3} fill={STROKE} />
      <SvgLabel x={cx + 6} y={cy - 4}>{center}</SvgLabel>
      {elements.map((el, i) => {
        const aDeg = el.angleDeg ?? 30;
        const aRad = (aDeg * Math.PI) / 180;
        const len = el.length ?? radius;
        const fx = cx + r * Math.cos(aRad);
        const fy = cy - r * Math.sin(aRad);
        if (el.type === 'radius') {
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={fx} y2={fy} stroke={ACCENT} strokeWidth={1.5} />
              <circle cx={fx} cy={fy} r={3} fill={STROKE} />
              {el.to && <SvgLabel x={fx + 5} y={fy - 4}>{el.to}</SvgLabel>}
              <SvgAccentLabel x={(cx + fx) / 2 + 6} y={(cy + fy) / 2 - 4}>{fmtN(len)}</SvgAccentLabel>
            </g>
          );
        }
        if (el.type === 'diameter') {
          const tx = cx + r * Math.cos(aRad + Math.PI);
          const ty = cy - r * Math.sin(aRad + Math.PI);
          return (
            <g key={i}>
              <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={ACCENT} strokeWidth={1.5} />
              {el.from && <SvgLabel x={fx + 5} y={fy - 4}>{el.from}</SvgLabel>}
              {el.to && <SvgLabel x={tx + 5} y={ty - 4}>{el.to}</SvgLabel>}
              <SvgAccentLabel x={(fx + tx) / 2 + 6} y={(fy + ty) / 2 - 4}>{fmtN(len)}</SvgAccentLabel>
            </g>
          );
        }
        if (el.type === 'chord') {
          const a2 = aRad + Math.PI * 0.6;
          const bx = cx + r * Math.cos(a2);
          const by = cy - r * Math.sin(a2);
          return (
            <g key={i}>
              <line x1={fx} y1={fy} x2={bx} y2={by} stroke={ACCENT} strokeWidth={1.5} />
              {el.from && <SvgLabel x={fx + 5} y={fy - 4}>{el.from}</SvgLabel>}
              {el.to && <SvgLabel x={bx + 5} y={by + 6}>{el.to}</SvgLabel>}
              <SvgAccentLabel x={(fx + bx) / 2 + 6} y={(fy + by) / 2 - 4}>{fmtN(len)}</SvgAccentLabel>
            </g>
          );
        }
        return null;
      })}
    </g>
  );
}

// ------------------------------------------------------------------ CoordinatePlane (rewritten)

type FnDef       = { expr?: string;   label?: string; color?: string };
type PointDef    = { x?: number; y?: number; label?: string; open?: boolean };
type LineSegDef  = { from?: unknown;  to?: unknown;   label?: string; color?: string; dashed?: boolean };
type PolylineDef = { points?: unknown; label?: string; color?: string; dashed?: boolean };

function CoordinatePlane({ f }: { f: FigureData }) {
  const xRange = arr<number>(f.xRange);
  const yRange = arr<number>(f.yRange);
  const xMin = xRange[0] ?? -5, xMax = xRange[1] ?? 5;
  const yMin = yRange[0] ?? -5, yMax = yRange[1] ?? 5;

  // Поддерживаем оба варианта именования: xLabel/yLabel и xAxis/yAxis
  const xLabel = str(f.xLabel || f.xAxis || f.xlabel) || 'x';
  const yLabel = str(f.yLabel || f.yAxis || f.ylabel) || 'y';

  const functions  = arr<FnDef>(f.functions);
  const points     = arr<PointDef>(f.points);
  // GigaChat может называть отрезки как "lines" или "segments"
  const lineSegs   = [...arr<LineSegDef>(f.lines), ...arr<LineSegDef>(f.segments)];
  // GigaChat может называть ломаные как "polylines" или "curves"
  const polylines  = [...arr<PolylineDef>(f.polylines), ...arr<PolylineDef>(f.curves)];

  // Отступы: слева больше (для подписей Y), снизу больше (для подписей X)
  const padL = 46, padR = 28, padT = 22, padB = 30;
  const pw = W - padL - padR;
  const ph = H - padT - padB;

  const xScale = pw / (xMax - xMin);
  const yScale = ph / (yMax - yMin);

  // Координаты начала координат в SVG
  const ox = padL + (-xMin) * xScale;
  const oy = padT + yMax * yScale;

  // Ось X рисуется в пределах: от min(padL, ox) до W-padR+8
  // Ось Y рисуется в пределах: от H-padB до padT
  const axisX1 = padL;
  const axisX2 = W - padR + 8;   // небольшой выступ для стрелки
  const axisY1 = H - padB;
  const axisY2 = padT - 8;       // небольшой выступ для стрелки

  const toSvg = (x: number, y: number): [number, number] => [
    ox + x * xScale,
    oy - y * yScale,
  ];

  // Умные деления — не более 7 на ось
  const xTicks = makeTicks(xMin, xMax);
  const yTicks = makeTicks(yMin, yMax);

  // Показывать ли "0" на осях:
  // на X-оси — только если ось не у левого края
  // на Y-оси — только если ось не у нижнего края
  const showXZero = ox > padL + 5;
  const showYZero = oy < H - padB - 5;

  const dashArray = '5,3';

  return (
    <g>
      {/* Область графика — отсекает кривые/отрезки, выходящие за оси */}
      <defs>
        <clipPath id="vu-plot-clip">
          <rect x={padL} y={padT} width={pw} height={ph} />
        </clipPath>
      </defs>

      {/* ── Сетка ── */}
      {xTicks.map(i => {
        const sx = ox + i * xScale;
        return (
          <line key={`gx${i}`}
            x1={sx} y1={padT} x2={sx} y2={H - padB}
            stroke={AXIS_COLOR} strokeWidth={0.4} />
        );
      })}
      {yTicks.map(j => {
        const sy = oy - j * yScale;
        return (
          <line key={`gy${j}`}
            x1={padL} y1={sy} x2={W - padR} y2={sy}
            stroke={AXIS_COLOR} strokeWidth={0.4} />
        );
      })}

      {/* ── Оси ── */}
      <line x1={axisX1} y1={oy} x2={axisX2} y2={oy}
        stroke={STROKE} strokeWidth={1.8} markerEnd="url(#vu-arrow)" />
      <line x1={ox} y1={axisY1} x2={ox} y2={axisY2}
        stroke={STROKE} strokeWidth={1.8} markerEnd="url(#vu-arrow)" />

      {/* ── Подписи осей ── */}
      <text x={axisX2 + 4} y={oy + 4}
        fontFamily={FONT} fontSize={12} fill={STROKE} fontStyle="italic">{xLabel}</text>
      <text x={ox + 4} y={axisY2 - 2}
        fontFamily={FONT} fontSize={12} fill={STROKE} fontStyle="italic">{yLabel}</text>

      {/* ── Деления X ── */}
      {xTicks.map(i => {
        const sx = ox + i * xScale;
        const isZero = Math.abs(i) < 1e-9;
        if (isZero && !showXZero) return null;
        return (
          <g key={`tx${i}`}>
            <line x1={sx} y1={oy - 4} x2={sx} y2={oy + 4} stroke={STROKE} strokeWidth={1.2} />
            <text x={sx} y={oy + 16}
              fontFamily={FONT} fontSize={10} fill={STROKE} textAnchor="middle">{fmtN(i)}</text>
          </g>
        );
      })}

      {/* ── Деления Y ── */}
      {yTicks.map(j => {
        const sy = oy - j * yScale;
        const isZero = Math.abs(j) < 1e-9;
        if (isZero && !showYZero) return null;
        return (
          <g key={`ty${j}`}>
            <line x1={ox - 4} y1={sy} x2={ox + 4} y2={sy} stroke={STROKE} strokeWidth={1.2} />
            <text x={ox - 6} y={sy + 4}
              fontFamily={FONT} fontSize={10} fill={STROKE} textAnchor="end">{fmtN(j)}</text>
          </g>
        );
      })}

      {/* ── Отрезки/прямые (lines + segments) ── */}
      {lineSegs.map((ln, li) => {
        const color = ln.color ?? PALETTE[li % PALETTE.length];
        const from = toPoint(ln.from);
        const to   = toPoint(ln.to);
        if (!from || !to) return null;
        const [sx1, sy1] = toSvg(from[0], from[1]);
        const [sx2, sy2] = toSvg(to[0],   to[1]);
        const lx = (sx1 + sx2) / 2 + 6;
        const ly = Math.min(sy1, sy2) - 7;
        return (
          <g key={`ln${li}`}>
            <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
              stroke={color} strokeWidth={2}
              strokeDasharray={ln.dashed ? dashArray : undefined}
              clipPath="url(#vu-plot-clip)" />
            {ln.label && (
              <text x={lx} y={ly} fontFamily={FONT} fontSize={11} fill={color}>{ln.label}</text>
            )}
          </g>
        );
      })}

      {/* ── Ломаные (polylines + curves) ── */}
      {polylines.map((pl, pli) => {
        const color = pl.color ?? PALETTE[pli % PALETTE.length];
        const rawPts = arr<unknown>(pl.points);
        const svgPts = rawPts.map(p => toPoint(p)).filter((p): p is [number, number] => p !== null);
        if (svgPts.length < 2) return null;
        const converted = svgPts.map(([x, y]) => toSvg(x, y));
        const ptsStr = converted.map(([sx, sy]) => `${sx.toFixed(1)},${sy.toFixed(1)}`).join(' ');
        const last = converted[converted.length - 1];
        return (
          <g key={`pl${pli}`}>
            <polyline points={ptsStr} fill="none" stroke={color} strokeWidth={2}
              strokeDasharray={pl.dashed ? dashArray : undefined}
              clipPath="url(#vu-plot-clip)" />
            {pl.label && (
              <text x={last[0] + 5} y={last[1] - 5}
                fontFamily={FONT} fontSize={11} fill={color}>{pl.label}</text>
            )}
          </g>
        );
      })}

      {/* ── Функции (expr) ── */}
      {functions.map((fn, fi) => {
        if (!fn.expr) return null;
        const color = fn.color ?? PALETTE[fi % PALETTE.length];
        const steps = 300;
        const dx = (xMax - xMin) / steps;
        const tolerance = (yMax - yMin) * 2;  // убираем точки далеко за пределы

        const segs: string[] = [];
        let seg: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const x = xMin + i * dx;
          const y = evalY(fn.expr, x);
          if (!isFinite(y) || y < yMin - tolerance || y > yMax + tolerance) {
            if (seg.length > 1) segs.push(seg.join(' '));
            seg = [];
          } else {
            const [sx, sy] = toSvg(x, y);
            seg.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
          }
        }
        if (seg.length > 1) segs.push(seg.join(' '));

        // Метка: у правого края кривой
        const lx = xMax - (xMax - xMin) * 0.08;
        const ly = evalY(fn.expr, lx);
        const [lsx, lsy] = isFinite(ly) ? toSvg(lx, ly) : [W - padR - 10, padT + 16];

        return (
          <g key={fi}>
            {segs.map((pts, si) => (
              <polyline key={si} points={pts} fill="none" stroke={color} strokeWidth={2}
                clipPath="url(#vu-plot-clip)" />
            ))}
            {fn.label && (
              <text x={lsx + 5} y={lsy - 5} fontFamily={FONT} fontSize={11} fill={color}>{fn.label}</text>
            )}
          </g>
        );
      })}

      {/* ── Точки ── */}
      {points.map((pt, pi) => {
        const [px, py] = toSvg(pt.x ?? 0, pt.y ?? 0);
        const inBounds = px >= padL - 10 && px <= W - padR + 10
          && py >= padT - 10 && py <= H - padB + 10;
        if (!inBounds) return null;
        const hasX = pt.x !== undefined && Math.abs(pt.x) > 1e-9;
        const hasY = pt.y !== undefined && Math.abs(pt.y ?? 0) > 1e-9;
        return (
          <g key={pi}>
            {/* Пунктирные проекции */}
            {hasX && (
              <line x1={px} y1={py} x2={px} y2={oy}
                stroke={ACCENT} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
            )}
            {hasY && (
              <line x1={px} y1={py} x2={ox} y2={py}
                stroke={ACCENT} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
            )}
            {pt.open
              ? <circle cx={px} cy={py} r={4} fill="white" stroke={ACCENT} strokeWidth={2} />
              : <circle cx={px} cy={py} r={4} fill={ACCENT} />
            }
            {pt.label && (
              <text x={px + 6} y={py - 5} fontFamily={FONT} fontSize={11} fill={ACCENT}>{pt.label}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ NumberLine

type MarkedPoint = { value?: number; label?: string; open?: boolean };
type NLSegment = { from?: number; to?: number };

function NumberLine({ f }: { f: FigureData }) {
  const minV = num(f.min, -5), maxV = num(f.max, 5);
  const marked = arr<MarkedPoint>(f.marked);
  const segments = arr<NLSegment>(f.segments);
  const pad = 40;
  const lineY = H / 2;
  const scale = (W - 2 * pad) / (maxV - minV);
  const ox = pad + (-minV) * scale;
  const tx = (v: number) => ox + v * scale;
  const ticks = makeTicks(minV, maxV);
  return (
    <g>
      <line x1={pad} y1={lineY} x2={W - pad} y2={lineY} stroke={STROKE} strokeWidth={2} />
      {ticks.map(i => (
        <g key={i}>
          <line x1={tx(i)} y1={lineY - 5} x2={tx(i)} y2={lineY + 5} stroke={STROKE} strokeWidth={1.5} />
          <text x={tx(i)} y={lineY + 18} fontFamily={FONT} fontSize={11} fill={STROKE} textAnchor="middle">{fmtN(i)}</text>
        </g>
      ))}
      {segments.map((seg, si) => (
        <line key={si}
          x1={tx(seg.from ?? minV)} y1={lineY}
          x2={tx(seg.to ?? maxV)} y2={lineY}
          stroke={ACCENT} strokeWidth={4} opacity={0.4} />
      ))}
      {marked.map((m, mi) => {
        const mx = tx(m.value ?? 0);
        return (
          <g key={mi}>
            {m.open
              ? <circle cx={mx} cy={lineY} r={6} fill="white" stroke={ACCENT} strokeWidth={2} />
              : <circle cx={mx} cy={lineY} r={6} fill={ACCENT} />}
            {m.label && (
              <text x={mx} y={lineY - 12} fontFamily={FONT} fontSize={12} fill={ACCENT} textAnchor="middle">
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ Geometry (универсальный)

type GPoint = { id?: string; x?: number; y?: number; label?: string; rightAngle?: boolean; dot?: boolean };
type GLabel = { text?: string; x?: number; y?: number };

function computeLabelOffset(
  p: GPoint,
  ptMap: Map<string, GPoint>,
  rawSegs: string[],
  centX: number, centY: number,
  dist: number,
): [number, number] {
  const px = num(p.x), py = num(p.y);
  let sumDx = 0, sumDy = 0, count = 0;
  for (const seg of rawSegs) {
    const rawStr = String(seg);
    const cleanStr = rawStr.endsWith(':e') ? rawStr.slice(0, -2) : rawStr;
    const [aid, bid] = cleanStr.split('-').map(s => s.trim());
    const othId = aid === p.id ? bid : bid === p.id ? aid : '';
    if (!othId) continue;
    const other = ptMap.get(othId);
    if (!other) continue;
    const dx = num(other.x) - px, dy = num(other.y) - py;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    sumDx += dx / len; sumDy += dy / len;
    count++;
  }
  if (count > 0) {
    const avg = Math.sqrt(sumDx * sumDx + sumDy * sumDy);
    if (avg > 0.12) return [(-sumDx / avg) * dist, (sumDy / avg) * dist];
  }
  const dx = px - centX, dy = py - centY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.5) return [(dx / len) * dist, (-dy / len) * dist];
  return [dist * 0.7, -dist * 0.7];
}

function Geometry({ f }: { f: FigureData }) {
  const rawPoints = arr<GPoint>(f.points);
  const rawSegs   = arr<string>(f.segments);
  const extraLbls = arr<GLabel>(f.labels);
  if (rawPoints.length === 0) return null;

  const ptMap = new Map<string, GPoint>();
  rawPoints.forEach(p => { if (p.id) ptMap.set(p.id, p); });

  const allX = [...rawPoints.map(p => num(p.x)), ...extraLbls.map(l => num(l.x))];
  const allY = [...rawPoints.map(p => num(p.y)), ...extraLbls.map(l => num(l.y))];
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);

  const padX = 54, padY = 46;
  const rx = (maxX - minX) || 1, ry = (maxY - minY) || 1;
  const sc = Math.min((W - 2 * padX) / rx, (H - 2 * padY) / ry);
  const offX = (W - rx * sc) / 2;
  const offY = (H - ry * sc) / 2;

  const toX = (x: number) => offX + (x - minX) * sc;
  const toY = (y: number) => offY + (maxY - y) * sc;

  const centX = rawPoints.reduce((s, p) => s + num(p.x), 0) / rawPoints.length;
  const centY = rawPoints.reduce((s, p) => s + num(p.y), 0) / rawPoints.length;
  const SQ = 10 / sc;

  return (
    <g>
      {/* 1. Рёбра */}
      {rawSegs.map((seg, i) => {
        const rawStr = String(seg);
        const extended = rawStr.endsWith(':e');
        const cleanStr = extended ? rawStr.slice(0, -2) : rawStr;
        const [aid, bid] = cleanStr.split('-').map(s => s.trim());
        const pa = ptMap.get(aid), pb = ptMap.get(bid);
        if (!pa || !pb) return null;
        let lx1 = toX(num(pa.x)), ly1 = toY(num(pa.y));
        let lx2 = toX(num(pb.x)), ly2 = toY(num(pb.y));
        if (extended) [lx1, ly1, lx2, ly2] = clipLineToSvg(lx1, ly1, lx2, ly2);
        return <line key={i} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={STROKE} strokeWidth={1.8} />;
      })}

      {/* 2. Маркеры прямых углов */}
      {rawPoints.map((p, i) => {
        if (!p.rightAngle || !p.id) return null;
        const px = num(p.x), py = num(p.y);
        const touching = rawSegs
          .map(s => { const r = String(s); const c = r.endsWith(':e') ? r.slice(0, -2) : r; return c.split('-').map(x => x.trim()); })
          .filter(parts => parts.length === 2 && (parts[0] === p.id || parts[1] === p.id));
        if (touching.length >= 2) {
          const unit = (parts: string[]): [number, number] => {
            const oid = parts[0] === p.id ? parts[1] : parts[0];
            const other = ptMap.get(oid);
            if (!other) return [SQ, 0];
            const dx = num(other.x) - px, dy = num(other.y) - py;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            return [(dx / len) * SQ, (dy / len) * SQ];
          };
          const u1 = unit(touching[0]), u2 = unit(touching[1]);
          return (
            <polyline key={`ra${i}`}
              points={[
                `${toX(px + u1[0])},${toY(py + u1[1])}`,
                `${toX(px + u1[0] + u2[0])},${toY(py + u1[1] + u2[1])}`,
                `${toX(px + u2[0])},${toY(py + u2[1])}`,
              ].join(' ')}
              fill="none" stroke={STROKE} strokeWidth={1.5} />
          );
        }
        const sx = toX(px), sy = toY(py);
        return (
          <polyline key={`ra${i}`}
            points={`${sx + 9},${sy} ${sx + 9},${sy - 9} ${sx},${sy - 9}`}
            fill="none" stroke={STROKE} strokeWidth={1.5} />
        );
      })}

      {/* 3. Точки */}
      {rawPoints.map((p, i) =>
        p.dot !== false && p.id
          ? <circle key={`dot${i}`} cx={toX(num(p.x))} cy={toY(num(p.y))} r={2} fill={STROKE} />
          : null
      )}

      {/* 4. Подписи вершин — двойной рендер (белый контур + основной) */}
      {rawPoints.map((p, i) => {
        if (!p.id) return null;
        const lbl = p.label !== undefined ? p.label : p.id;
        if (!lbl) return null;
        const [lox, loy] = computeLabelOffset(p, ptMap, rawSegs, centX, centY, 17);
        const sx = toX(num(p.x)), sy = toY(num(p.y));
        const tx = sx + lox, ty = sy + loy;
        const common = { fontFamily: FONT, fontSize: 13, fontWeight: 700, textAnchor: 'middle' as const, dominantBaseline: 'middle' as const };
        return (
          <g key={`lbl${i}`}>
            <text {...common} x={tx} y={ty} stroke="white" strokeWidth={5} fill="white">{lbl}</text>
            <text {...common} x={tx} y={ty} fill={STROKE}>{lbl}</text>
          </g>
        );
      })}

      {/* 5. Дополнительные метки */}
      {extraLbls.map((l, i) => {
        const tx = toX(num(l.x)), ty = toY(num(l.y));
        const common = { fontFamily: FONT, fontSize: 12, fontWeight: 600, textAnchor: 'middle' as const, dominantBaseline: 'middle' as const };
        return (
          <g key={`el${i}`}>
            <text {...common} x={tx} y={ty} stroke="white" strokeWidth={4} fill="white">{str(l.text)}</text>
            <text {...common} x={tx} y={ty} fill={ACCENT}>{str(l.text)}</text>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ Label helpers

function SvgLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} fontFamily={FONT} fontSize={12} fill={STROKE}>{children}</text>;
}
function SvgAccentLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} fontFamily={FONT} fontSize={11} fill={ACCENT}>{children}</text>;
}
function SideLabel({ mid, dx = 0, dy = 0, children }: { mid: [number, number]; dx?: number; dy?: number; children: string }) {
  return <text x={mid[0] + dx} y={mid[1] + dy} fontFamily={FONT} fontSize={11} fill={ACCENT}>{children}</text>;
}

// ------------------------------------------------------------------ Main export

export function FigureSvg({ figure }: { figure: Record<string, unknown> }) {
  const type = str(figure.type);

  // Поддерживаем псевдонимы типов, которые может использовать GigaChat
  const resolvedType = (() => {
    switch (type) {
      case 'graph':
      case 'plot':
      case 'physicsGraph':
      case 'functionGraph':
        return 'coordinatePlane';
      default:
        return type;
    }
  })();

  const inner = (() => {
    switch (resolvedType) {
      case 'triangle':        return <Triangle f={figure} />;
      case 'quadrilateral':   return <Quadrilateral f={figure} />;
      case 'circle':          return <Circle f={figure} />;
      case 'coordinatePlane': return <CoordinatePlane f={figure} />;
      case 'numberLine':      return <NumberLine f={figure} />;
      case 'geometry':        return <Geometry f={figure} />;
      default:
        return (
          <text x={10} y={30} fontFamily={FONT} fontSize={13} fill={AXIS_COLOR}>
            {`[Рисунок: ${type || 'неизвестный тип'}]`}
          </text>
        );
    }
  })();

  return (
    <div className="my-2 flex justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="rounded border border-gray-200 bg-white"
        aria-label={`Рисунок: ${type}`}
      >
        {/* Единственное определение стрелки в документе — нет конфликтов id */}
        <defs>
          <marker id="vu-arrow" markerWidth={10} markerHeight={8} refX={8} refY={4} orient="auto">
            <path d="M0,0 L0,8 L10,4 z" fill={STROKE} />
          </marker>
        </defs>
        {inner}
      </svg>
    </div>
  );
}
