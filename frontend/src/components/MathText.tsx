import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Рендерит текст, в котором математика размечена LaTeX'ем:
 *  - инлайн-формулы: $...$
 *  - выносные формулы: $$...$$
 * Остальной текст выводится как есть, переносы строк сохраняются (whitespace-pre-wrap).
 * Если формула невалидна — KaTeX покажет исходный код, не роняя страницу.
 *
 * Дополнительно устойчиво отображает СИСТЕМЫ (cases/aligned/array и матрицы):
 *  - если окружение \begin{...} пришло БЕЗ обрамляющих $ — оно всё равно отрисуется;
 *  - если строки системы разделены переносами строк или «съеденным» одиночным \ (частый
 *    дефект слабых LLM) — разделители восстанавливаются в \\, чтобы строки не слипались.
 */

type Segment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; display: boolean };

// LaTeX-окружения, которые имеет смысл авто-распознавать в «голом» тексте без $.
const ENV_RE =
  /\\begin\{(cases|aligned|align\*?|array|matrix|pmatrix|bmatrix|vmatrix|Bmatrix)\}[\s\S]*?\\end\{\1\}/g;

/**
 * Восстанавливает разделители строк \\ внутри многострочных окружений.
 * Слабые модели пишут систему по строкам (через перенос) или с одиночным \,
 * который при JSON-парсинге теряется — тогда KaTeX рисует все строки в одну.
 */
function normalizeEnvironments(tex: string): string {
  return tex.replace(
    /(\\begin\{(cases|aligned|align\*?|array|matrix|pmatrix|bmatrix|vmatrix|Bmatrix)\})([\s\S]*?)(\\end\{\2\})/g,
    (_full, begin: string, _env: string, body: string, end: string) => {
      let b = body;
      if (!/\\\\/.test(b)) {
        b = b.replace(/[ \t]*\r?\n[ \t]*/g, ' \\\\ ');
        b = b.replace(/([^\\])\\(?=[ \t]|$)/g, '$1\\\\ ');
      }
      return `${begin}${b}${end}`;
    },
  );
}

/**
 * Делит текстовый фрагмент (вне $...$) на части, выделяя «голые» LaTeX-окружения
 * в отдельные выносные формулы — чтобы система без $ всё равно отрисовалась.
 */
function splitBareEnvironments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  ENV_RE.lastIndex = 0;
  while ((m = ENV_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'math', value: m[0], display: true });
    last = ENV_RE.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function tokenize(input: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    if (value.includes('\\begin{')) {
      segments.push(...splitBareEnvironments(value));
    } else {
      segments.push({ type: 'text', value });
    }
  };

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) pushText(input.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('$$')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: true });
    } else {
      segments.push({ type: 'math', value: token.slice(1, -1), display: false });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < input.length) pushText(input.slice(lastIndex));
  return segments;
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(normalizeEnvironments(tex), {
      displayMode: display,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}

export function MathText({ children, className, style }: { children: string | null | undefined; className?: string; style?: CSSProperties }) {
  const segments = useMemo(() => tokenize(children ?? ''), [children]);

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', ...style }}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.value, seg.display) }}
          />
        ),
      )}
    </span>
  );
}
