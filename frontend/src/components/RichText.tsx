import { type ReactNode } from 'react';
import { MathText } from './MathText';
import { FunctionGraphDisplay } from './FunctionGraphDisplay';

/**
 * Рендер содержимого задания: обычный текст + формулы (KaTeX), Markdown-таблицы (| .. | .. |).
 *
 * Автоматически разбивает варианты ответа теста (А), Б), В), Г)) на отдельные строки.
 */

const FIGURE_RE = /\[(?:РИСУНОК|Рисунок|ГРАФИК|График|ЧЕРТЁЖ|Чертёж)\s*:[\s\S]*?\]/g;
const GRAPH_RE = /\[ФУНКЦИЯ:\s*(\{[^\]]*\})\s*\]/g;
const IMAGE_RE = /\[ИЗОБРАЖЕНИЕ:\s*([^\]]+?)\s*\]/g;

/**
 * Если в тексте несколько вариантов ответа (А), Б), В), Г)) написаны в одну строку,
 * разбивает их на отдельные строки. Работает для русских (А-Г) и латинских (A-D) маркеров.
 */
function expandTestOptions(text: string): string {
  // Проверяем, есть ли 2+ маркера ответа на одной строке
  // Паттерн: маркер вида А) или A) внутри строки (не в начале строки)
  const hasMulti = /[А-ГA-D]\).*[А-ГA-D]\)/u.test(text);
  if (!hasMulti) return text;
  // Вставляем перенос строки перед каждым маркером (кроме тех, что уже в начале строки)
  return text.replace(/([^\n])\s{1,3}([А-ГA-D]\))/gu, '$1\n$2');
}

function FigureCallout({ raw }: { raw: string }) {
  const inner = raw.replace(/^\[(?:РИСУНОК|Рисунок|ГРАФИК|График|ЧЕРТЁЖ|Чертёж)\s*:\s*/u, '').replace(/\]$/, '');
  return (
    <div className="my-2 flex gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
      <span className="text-lg leading-none">📐</span>
      <div>
        <div className="text-xs font-semibold uppercase text-indigo-400 mb-0.5">Рисунок / график</div>
        <MathText>{inner}</MathText>
      </div>
    </div>
  );
}

function isTableRow(line: string): boolean {
  return (line.match(/\|/g) ?? []).length >= 2;
}
function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function Table({ rows }: { rows: string[][] }) {
  const [header, ...body] = rows;
  return (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-sm">
        {header && (
          <thead>
            <tr>
              {header.map((c, i) => (
                <th key={i} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">
                  <MathText>{c}</MathText>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((c, i) => (
                <td key={i} className="border border-slate-300 px-2 py-1">
                  <MathText>{c}</MathText>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Рендерит фрагмент без блоков рисунков: текст вперемешку с Markdown-таблицами. */
function renderBlocks(segment: string, keyBase: string): ReactNode[] {
  // Разбиваем тестовые опции на отдельные строки перед обработкой
  const processed = expandTestOptions(segment);
  const lines = processed.split('\n');
  const out: ReactNode[] = [];
  let textBuf: string[] = [];
  let tableBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length) {
      const joined = textBuf.join('\n');
      if (joined.trim()) out.push(<MathText key={`${keyBase}-t-${out.length}`}>{joined}</MathText>);
      textBuf = [];
    }
  };
  const flushTable = () => {
    if (tableBuf.length) {
      const rows = tableBuf.filter((l) => !isSeparatorRow(l)).map(splitCells);
      if (rows.length) out.push(<Table key={`${keyBase}-tbl-${out.length}`} rows={rows} />);
      tableBuf = [];
    }
  };

  for (const line of lines) {
    if (isTableRow(line)) {
      flushText();
      tableBuf.push(line);
    } else {
      flushTable();
      textBuf.push(line);
    }
  }
  flushText();
  flushTable();
  return out;
}

/**
 * Компонент задания с полным рендерингом: текст + формулы (KaTeX).
 * Фигуры (SVG) не отображаются — отключены.
 */
export function RichText({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
  // Поле figure сохраняется в DB, но в UI не рисуется
  figure?: Record<string, unknown> | null;
}) {
  const text = children ?? '';
  const nodes: ReactNode[] = [];
  let key = 0;

  // Объединяем РИСУНОК-маркеры и ФУНКЦИЯ-маркеры в единый список с позициями
  type TokenEntry = { index: number; end: number; node: ReactNode };
  const tokens: TokenEntry[] = [];

  FIGURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIGURE_RE.exec(text)) !== null) {
    tokens.push({ index: m.index, end: FIGURE_RE.lastIndex, node: <FigureCallout key={`fig${key++}`} raw={m[0]} /> });
  }

  GRAPH_RE.lastIndex = 0;
  while ((m = GRAPH_RE.exec(text)) !== null) {
    const jsonStr = m[1];
    try {
      const cfg = JSON.parse(jsonStr) as { fn?: string; xMin?: number; xMax?: number; yMin?: number; yMax?: number };
      if (cfg.fn && cfg.fn.length < 200) {
        tokens.push({
          index: m.index,
          end: GRAPH_RE.lastIndex,
          node: (
            <div key={`graph${key++}`} className="my-2">
              <FunctionGraphDisplay config={{ fn: cfg.fn, xMin: cfg.xMin ?? -5, xMax: cfg.xMax ?? 5, yMin: cfg.yMin, yMax: cfg.yMax }} />
            </div>
          ),
        });
      }
    } catch { /* ignore invalid json */ }
  }

  IMAGE_RE.lastIndex = 0;
  while ((m = IMAGE_RE.exec(text)) !== null) {
    const dataUrl = m[1];
    tokens.push({
      index: m.index,
      end: IMAGE_RE.lastIndex,
      node: (
        <div key={`img${key++}`} className="my-2">
          <img src={dataUrl} alt="Изображение" className="max-w-full rounded border border-gray-200" style={{ maxHeight: 400 }} />
        </div>
      ),
    });
  }

  tokens.sort((a, b) => a.index - b.index);

  let last = 0;
  for (const tok of tokens) {
    if (tok.index > last) {
      nodes.push(...renderBlocks(text.slice(last, tok.index), `b${key++}`));
    }
    nodes.push(tok.node);
    last = tok.end;
  }
  if (last < text.length) {
    nodes.push(...renderBlocks(text.slice(last), `b${key++}`));
  }

  return (
    <div className={className}>
      {nodes}
    </div>
  );
}
