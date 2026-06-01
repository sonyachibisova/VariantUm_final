/**
 * Редактор задания с поддержкой формул — точный порт из VariantUm/src/components/ui/TaskEditorField.jsx.
 * Текстовые сегменты: contentEditable span-ы.
 * Формулы: отображаются через KaTeX; редактируются через MathLive math-field с виртуальной клавиатурой.
 */
import React, { useState, useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'mathlive';
import 'mathlive/static.css';
import { RichText } from './RichText';
import { FunctionGraphEditor } from './FunctionGraphEditor';

// ── Типы ──────────────────────────────────────────────────────────────────────

interface MathFieldEl extends HTMLElement {
  value: string;
  focus(): void;
}

type TextSeg = { type: 'text'; content: string };
type FormulaSeg = { type: 'formula'; content: string };
type GraphSeg = { type: 'graph'; config: { fn: string; xMin: number; xMax: number; yMin?: number; yMax?: number } };
type ImageSeg = { type: 'image'; dataUrl: string };
type Segment = TextSeg | FormulaSeg | GraphSeg | ImageSeg;

type OpenverseImage = {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  creator: string;
  license: string;
  foreign_landing_url: string;
};

type OpenverseAttribution = {
  creator: string;
  license: string;
  source: string;
  title: string;
};

// ── Глобальное объявление math-field ──────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.HTMLAttributes<HTMLElement> & {
        ref?: React.Ref<MathFieldEl>;
        style?: React.CSSProperties;
        value?: string;
      };
    }
  }
}

// ── Стили виртуальной клавиатуры (вызывается один раз) ───────────────────────

function initMathLiveStyles() {
  if (typeof window === 'undefined') return;
  const STYLE_ID = 'ml-style-overrides';
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    math-field::part(menu-toggle) { display: none !important; }
    math-field {
      --selection-background-color-focused: rgba(11,138,203,0.18) !important;
      --selection-color-focused: #0b6a9e !important;
      --caret-color: #0b8acb !important;
      --contains-highlight-background-color: rgba(11,138,203,0.1) !important;
    }
    .ML__focused .ML__selected,
    .ML__selected { background: rgba(11,138,203,0.18) !important; }
    .ML__caret { border-color: #0b8acb !important; }
    .ML__keyboard {
      --keyboard-background: #ffffff !important;
      --keyboard-toolbar-background: #f8fafc !important;
      --keyboard-toolbar-text: #374151 !important;
      --keyboard-background-border: #e5e7eb !important;
      --keycap-background: #f8fafc !important;
      --keycap-background-hover: #e5f3fa !important;
      --keycap-background-pressed: #c5e4f5 !important;
      --keycap-text: #374151 !important;
      --keycap-secondary-text: #6b7280 !important;
      border-top: 1px solid #e5e7eb !important;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.06) !important;
    }
    .ML__keyboard .keycap,
    .ML__keyboard [class~="keycap"] {
      background: #f8fafc !important;
      color: #374151 !important;
      border-color: #e2e8f0 !important;
    }
    .ML__keyboard .action {
      background: #dde3ea !important;
      color: #374151 !important;
    }
    .ML__keyboard .action svg,
    .ML__keyboard .action .ML__svg-glyph { fill: #374151 !important; }
    .ML__keyboard .action.accept-suggestion,
    .ML__keyboard .action[data-command*="commit"],
    .ML__keyboard .action[data-command*="accept"] {
      background: #0b8acb !important;
      color: #ffffff !important;
    }
    .ML__keyboard .action.accept-suggestion svg,
    .ML__keyboard .action[data-command*="commit"] svg,
    .ML__keyboard .action.accept-suggestion .ML__svg-glyph,
    .ML__keyboard .action[data-command*="commit"] .ML__svg-glyph { fill: #ffffff !important; }
    .ML__keyboard .fnbutton, .ML__keyboard .bigfnbutton {
      background: #dde3ea !important;
      color: #374151 !important;
    }
    .ML__keyboard-toolbar, .keyboard-toolbar {
      background: #f8fafc !important;
      border-bottom: 1px solid #e5e7eb !important;
    }
    .ML__keyboard-toolbar .tab, .keyboard-toolbar .tab { color: #6b7280 !important; }
    .ML__keyboard-toolbar .tab.selected, .keyboard-toolbar .tab.selected {
      color: #0b8acb !important;
      border-bottom-color: #0b8acb !important;
    }
  `;
  document.head.appendChild(s);
}

// ── Парсинг текста на сегменты ─────────────────────────────────────────────

function parseTextSegments(raw: string): Segment[] {
  const parts: Segment[] = [];
  const graphRegex = /\[ФУНКЦИЯ:\s*(\{[^\]]*\})\s*\]/g;
  const formulaRegex = /\$([^$]+)\$/g;
  const imageRegex = /\[ИЗОБРАЖЕНИЕ:\s*([^\]]+?)\s*\]/g;

  // Собираем все маркеры (графиков, формул, изображений) с их позициями
  type Token = { type: 'graph' | 'formula' | 'image'; index: number; end: number; content: string };
  const tokens: Token[] = [];

  let m: RegExpExecArray | null;
  graphRegex.lastIndex = 0;
  while ((m = graphRegex.exec(raw)) !== null) {
    tokens.push({ type: 'graph', index: m.index, end: graphRegex.lastIndex, content: m[1] });
  }

  formulaRegex.lastIndex = 0;
  while ((m = formulaRegex.exec(raw)) !== null) {
    tokens.push({ type: 'formula', index: m.index, end: formulaRegex.lastIndex, content: m[1] });
  }

  imageRegex.lastIndex = 0;
  while ((m = imageRegex.exec(raw)) !== null) {
    tokens.push({ type: 'image', index: m.index, end: imageRegex.lastIndex, content: m[1] });
  }

  tokens.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  for (const tok of tokens) {
    if (tok.index > lastIndex) {
      parts.push({ type: 'text', content: raw.slice(lastIndex, tok.index) });
    }
    if (tok.type === 'formula') {
      parts.push({ type: 'formula', content: tok.content });
    } else if (tok.type === 'image') {
      parts.push({ type: 'image', dataUrl: tok.content });
    } else {
      try {
        const cfg = JSON.parse(tok.content) as { fn?: string; xMin?: number; xMax?: number; yMin?: number; yMax?: number };
        if (cfg.fn && cfg.fn.length > 0 && cfg.fn.length < 200) {
          parts.push({ type: 'graph', config: { fn: cfg.fn, xMin: cfg.xMin ?? -5, xMax: cfg.xMax ?? 5, yMin: cfg.yMin, yMax: cfg.yMax } });
        }
      } catch { /* skip invalid graph */ }
    }
    lastIndex = tok.end;
  }
  if (lastIndex < raw.length) {
    parts.push({ type: 'text', content: raw.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', content: raw }];
}

function normalizeSegments(segs: Segment[]): Segment[] {
  if (segs.length === 0 || segs[segs.length - 1].type !== 'text') {
    return [...segs, { type: 'text', content: '' }];
  }
  return segs;
}

function segmentsToText(segs: Segment[]): string {
  return segs
    .filter(s => {
      if (s.type === 'formula') return s.content.trim() !== '';
      return true;
    })
    .map(s => {
      if (s.type === 'formula') return `$${s.content}$`;
      if (s.type === 'graph') {
        const cfg = s.config;
        const json = JSON.stringify({ fn: cfg.fn, xMin: cfg.xMin, xMax: cfg.xMax, ...(cfg.yMin != null && { yMin: cfg.yMin }), ...(cfg.yMax != null && { yMax: cfg.yMax }) });
        return `[ФУНКЦИЯ: ${json}]`;
      }
      if (s.type === 'image') return `[ИЗОБРАЖЕНИЕ: ${s.dataUrl}]`;
      return s.content;
    })
    .join('');
}

function renderFormulaChipHtml(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, strict: false });
  } catch {
    return latex;
  }
}

// ── Иконки ────────────────────────────────────────────────────────────────────

function IcoFormula() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function IcoCheckSave() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IcoGraph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IcoImage() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

// ── ImageChip — отображение изображения как миниатюры ─────────────────────────

function ImageChip({ dataUrl, onRemove }: { dataUrl: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center align-middle mx-0.5 relative group" style={{ verticalAlign: 'middle' }}>
      <img src={dataUrl} alt="" className="rounded border border-gray-200" style={{ maxHeight: 56, maxWidth: 104 }} />
      <button
        type="button"
        onClick={onRemove}
        title="Удалить изображение"
        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-red-500 text-white leading-none text-xs font-bold"
      >
        ×
      </button>
    </span>
  );
}

// ── OpenversePicker — пикер изображений из Openverse ─────────────────────────

function OpenversePicker({ onSelect, onClose }: {
  onSelect: (img: OpenverseImage) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OpenverseImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<OpenverseImage | null>(null);
  const [error, setError] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query.trim())}&page_size=12&license_type=commercial,modification`
      );
      if (!res.ok) throw new Error('API error');
      const data = await res.json() as { results: OpenverseImage[] };
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) setError('Ничего не найдено. Попробуйте другой запрос.');
    } catch {
      setError('Не удалось загрузить результаты. Проверьте подключение к интернету.');
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div ref={containerRef} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Поиск изображений в Openverse</h3>
            <p className="text-xs text-gray-400 mt-0.5">Бесплатные изображения с открытой лицензией</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex gap-2 flex-shrink-0">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search(); }}
            placeholder="Введите запрос на русском или английском..."
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0b8acb] focus:ring-1 focus:ring-[#0b8acb]/20"
          />
          <button
            type="button"
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-4 py-1.5 text-sm bg-[#0b8acb] text-white rounded-lg hover:bg-[#029bf5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Ищу...' : 'Искать'}
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {error && !loading && (
            <p className="text-sm text-gray-400 text-center py-8">{error}</p>
          )}
          {loading && (
            <p className="text-sm text-gray-400 text-center py-8">Загружаю результаты...</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Введите запрос для поиска изображений с открытой лицензией</p>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {results.map(img => {
                const thumbBroken = brokenThumbs.has(img.id);
                const thumbSrc = thumbBroken ? img.url : (img.thumbnail || img.url);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelected(img)}
                    title={img.title}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all focus:outline-none ${
                      selected?.id === img.id
                        ? 'border-[#0b8acb] ring-2 ring-[#0b8acb]/30'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt={img.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          if (!thumbBroken) {
                            setBrokenThumbs(prev => new Set(prev).add(img.id));
                          }
                        }}
                      />
                    ) : null}
                    {(thumbBroken && !img.url) || (!thumbSrc) ? (
                      <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center p-1 gap-1">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span className="text-gray-400 text-center leading-tight" style={{ fontSize: '9px' }}>{img.title?.slice(0, 30)}</span>
                      </div>
                    ) : null}
                    {selected?.id === img.id && (
                      <div className="absolute inset-0 bg-[#0b8acb]/10 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-[#0b8acb] flex items-center justify-center text-white text-xs font-bold">✓</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            {selected ? (
              <>
                <span className="text-gray-600 font-medium">{selected.title || 'Изображение'}</span>
                {selected.creator && <> · {selected.creator}</>}
                {' · '}
                <span className="uppercase">{selected.license}</span>
              </>
            ) : (
              'Нажмите на изображение, чтобы выбрать'
            )}
          </p>
          <button
            type="button"
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="px-4 py-1.5 text-sm font-semibold bg-[#22a139] text-white rounded-lg hover:bg-[#1e9231] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GraphChip — отображение графика как компактного чипа ────────────────────

function GraphChip({
  config,
  isActive,
  onClick,
}: {
  config: { fn: string; xMin: number; xMax: number };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Нажмите для редактирования графика"
      className={`inline-flex items-center align-middle cursor-pointer rounded px-2 mx-0.5 py-1 transition-all gap-1 ${
        isActive
          ? 'bg-[#6366f1]/15 ring-1 ring-[#6366f1]'
          : 'bg-gray-100 hover:bg-[#6366f1]/10 hover:ring-1 hover:ring-[#6366f1]/40'
      }`}
    >
      <IcoGraph />
      <span className="text-xs font-semibold text-gray-700 leading-none">y = {config.fn}</span>
    </button>
  );
}

// ── FormulaChip — отображение формулы как кнопки ─────────────────────────────

function FormulaChip({ latex, isActive, onClick }: { latex: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Нажмите для редактирования формулы"
      dangerouslySetInnerHTML={{ __html: renderFormulaChipHtml(latex || '\\square') }}
      className={`inline-flex items-center align-middle cursor-pointer rounded px-1 mx-0.5 transition-all ${
        isActive
          ? 'bg-[#0b8acb]/15 ring-1 ring-[#0b8acb]'
          : 'bg-gray-100 hover:bg-[#0b8acb]/10 hover:ring-1 hover:ring-[#0b8acb]/40'
      }`}
    />
  );
}

// ── TextSegment — редактируемый текстовый фрагмент ───────────────────────────

function TextSegment({
  value,
  onChange,
  onFocus,
  autoFocusEnd,
}: {
  value: string;
  onChange: (val: string) => void;
  onFocus?: (node: HTMLSpanElement) => void;
  autoFocusEnd?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (ref.current && !isEditingRef.current) {
      ref.current.innerText = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocusEnd && ref.current) {
      ref.current.focus();
      try {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(ref.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => {
        isEditingRef.current = true;
        if (ref.current) onFocus?.(ref.current);
      }}
      onBlur={e => {
        isEditingRef.current = false;
        onChange((e.target as HTMLSpanElement).innerText);
      }}
      className="outline-none"
      style={{ whiteSpace: 'pre-wrap' }}
    />
  );
}

// ── TaskEditorField — основной компонент ─────────────────────────────────────

export interface TaskEditorFieldProps {
  text: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  /** Опционально: колбэк при каждом изменении текста (для режима массового редактирования). */
  onChange?: (text: string) => void;
  isSaving?: boolean;
  saveLabel?: string;
}

async function fetchUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

export function TaskEditorField({ text, onSave, onCancel, onChange, isSaving, saveLabel = 'Сохранить' }: TaskEditorFieldProps) {
  const [segments, setSegments] = useState<Segment[]>(() => normalizeSegments(parseTextSegments(text)));
  const [editingFormulaIdx, setEditingFormulaIdx] = useState<number | null>(null);
  const [editingGraphIdx, setEditingGraphIdx] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showGraphInsertEditor, setShowGraphInsertEditor] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showOpenversePicker, setShowOpenversePicker] = useState(false);
  const [openverseAttribution, setOpenverseAttribution] = useState<OpenverseAttribution | null>(null);
  const mathFieldRef = useRef<MathFieldEl>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageMenuRef = useRef<HTMLDivElement>(null);
  const focusedSegRef = useRef<{ idx: number; node: HTMLSpanElement } | null>(null);
  const latestSegmentsRef = useRef<Segment[]>(segments);
  latestSegmentsRef.current = segments;

  useEffect(() => {
    initMathLiveStyles();
  }, []);

  useEffect(() => {
    if (!showImageMenu) return;
    function handleClick(e: MouseEvent) {
      if (imageMenuRef.current && !imageMenuRef.current.contains(e.target as Node)) {
        setShowImageMenu(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowImageMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showImageMenu]);

  // Уведомляем onChange при каждом изменении сегментов
  useEffect(() => {
    onChange?.(segmentsToText(segments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  function handleOpenFormula(idx: number) {
    setEditingFormulaIdx(idx);
    setTimeout(() => {
      if (mathFieldRef.current) {
        mathFieldRef.current.value = (segments[idx] as FormulaSeg).content;
        mathFieldRef.current.focus();
      }
    }, 50);
  }

  function handleOpenGraph(idx: number) {
    setEditingGraphIdx(idx);
  }

  function handleInsertFormula() {
    const sel = window.getSelection();
    let insertIdx: number | null = null;
    let textBefore = '';
    let textAfter = '';

    if (focusedSegRef.current !== null) {
      const { idx, node } = focusedSegRef.current;
      if (sel && sel.rangeCount > 0 && node.contains(sel.getRangeAt(0).startContainer)) {
        try {
          const range = sel.getRangeAt(0);
          const beforeRange = document.createRange();
          beforeRange.setStart(node, 0);
          beforeRange.setEnd(range.startContainer, range.startOffset);
          textBefore = beforeRange.toString();
          textAfter = (node.innerText || '').slice(textBefore.length);
        } catch {
          textBefore = node.innerText || '';
          textAfter = '';
        }
      } else {
        textBefore = node.innerText || '';
        textAfter = '';
      }
      insertIdx = idx;
    }

    const segs = latestSegmentsRef.current;
    let newSegs: Segment[];
    let formulaIdx: number;

    if (insertIdx !== null) {
      newSegs = normalizeSegments([
        ...segs.slice(0, insertIdx),
        { type: 'text', content: textBefore },
        { type: 'formula', content: '' },
        { type: 'text', content: textAfter },
        ...segs.slice(insertIdx + 1),
      ]);
      formulaIdx = insertIdx + 1;
    } else {
      const lastIdx = segs.length - 1;
      const insertAt = lastIdx >= 0 && segs[lastIdx].type === 'text' ? lastIdx : segs.length;
      formulaIdx = insertAt;
      newSegs = normalizeSegments([
        ...segs.slice(0, insertAt),
        { type: 'formula', content: '' },
        ...segs.slice(insertAt),
      ]);
    }

    setSegments(newSegs);
    setEditingFormulaIdx(formulaIdx);
    setTimeout(() => {
      if (mathFieldRef.current) {
        mathFieldRef.current.value = '';
        mathFieldRef.current.focus();
      }
    }, 50);
  }

  function handleApplyFormula() {
    if (editingFormulaIdx === null || !mathFieldRef.current) return;
    const latex = mathFieldRef.current.value;
    if (latex.trim() === '') {
      setSegments(prev => normalizeSegments(prev.filter((_, i) => i !== editingFormulaIdx)));
    } else {
      setSegments(prev =>
        normalizeSegments(prev.map((s, i) => (i === editingFormulaIdx ? { ...s, content: latex } : s)))
      );
    }
    setEditingFormulaIdx(null);
  }

  function handleCancelFormula() {
    if (editingFormulaIdx !== null) {
      const seg = segments[editingFormulaIdx];
      if (seg && 'content' in seg && seg.content === '') {
        setSegments(prev => normalizeSegments(prev.filter((_, i) => i !== editingFormulaIdx)));
        setEditingFormulaIdx(null);
        return;
      }
    }
    setEditingFormulaIdx(null);
  }

  function handleUpdateGraph(newConfig: GraphSeg['config']) {
    if (editingGraphIdx !== null) {
      setSegments(prev =>
        normalizeSegments(prev.map((s, i) => (i === editingGraphIdx ? { type: 'graph', config: newConfig } : s)))
      );
    }
    setEditingGraphIdx(null);
  }

  function handleCancelGraph() {
    setEditingGraphIdx(null);
  }

  function handleTextChange(idx: number, val: string) {
    setSegments(prev => prev.map((s, i) => (i === idx ? { ...s, content: val } : s)));
  }

  async function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const dataUrl = await compressImage(file);
    if (!dataUrl) return;
    const segs = latestSegmentsRef.current;
    setSegments(normalizeSegments([...segs, { type: 'image', dataUrl }]));
  }

  function handleRemoveImage(idx: number) {
    setSegments(prev => normalizeSegments(prev.filter((_, i) => i !== idx)));
  }

  async function handleInsertOpenverseImage(img: OpenverseImage) {
    setShowOpenversePicker(false);
    setOpenverseAttribution({
      creator: img.creator,
      license: img.license,
      source: img.foreign_landing_url,
      title: img.title,
    });
    const rawUrl = img.thumbnail || img.url;
    const dataUrl = await fetchUrlToDataUrl(rawUrl);
    const segs = latestSegmentsRef.current;
    setSegments(normalizeSegments([...segs, { type: 'image', dataUrl: dataUrl ?? rawUrl }]));
  }

  return (
    <div className="flex flex-col gap-3 bg-blue-50/30 rounded-xl px-3 py-3">
      {/* Заголовок + кнопки тулбара */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-500">
          Редактирование{' '}
          <span className="font-normal text-gray-400">— нажмите на формулу для её изменения</span>
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleInsertFormula}
            disabled={editingFormulaIdx !== null || editingGraphIdx !== null || showGraphInsertEditor}
            className="flex items-center gap-1 px-2.5 py-1 border border-[#0b8acb]/40 rounded-lg text-xs text-[#0b8acb] hover:bg-[#0b8acb]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <IcoFormula /> Формула
          </button>
          <button
            type="button"
            onClick={() => setShowGraphInsertEditor(v => !v)}
            disabled={editingFormulaIdx !== null || editingGraphIdx !== null}
            className={`flex items-center gap-1 px-2.5 py-1 border rounded-lg text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              showGraphInsertEditor
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-indigo-300/60 text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            <IcoGraph /> График
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInsertImage}
          />
          <div ref={imageMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowImageMenu(v => !v)}
              disabled={editingFormulaIdx !== null || editingGraphIdx !== null}
              className={`flex items-center gap-1 px-2.5 py-1 border rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                showImageMenu
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                  : 'border-emerald-300/60 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <IcoImage /> Изображение
            </button>
            {showImageMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52">
                <button
                  type="button"
                  onClick={() => { setShowImageMenu(false); imageInputRef.current?.click(); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Загрузить с устройства
                </button>
                <button
                  type="button"
                  onClick={() => { setShowImageMenu(false); setShowOpenversePicker(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Найти в Openverse
                  <span className="ml-auto text-gray-400 font-normal">CC</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Единое поле редактирования: текст + формулы */}
      <div
        className="border border-[#0b8acb] rounded-xl px-3 py-2.5 bg-white text-sm text-gray-700 leading-relaxed min-h-[60px] cursor-text"
        onClick={e => {
          if (e.target === e.currentTarget) {
            const editables = (e.currentTarget as HTMLElement).querySelectorAll<HTMLSpanElement>('[contenteditable]');
            if (editables.length > 0) {
              const last = editables[editables.length - 1];
              last.focus();
              try {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(last);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
              } catch { /* ignore */ }
            }
          }
        }}
      >
        {segments.map((seg, idx) =>
          seg.type === 'formula' ? (
            <FormulaChip
              key={idx}
              latex={seg.content}
              isActive={editingFormulaIdx === idx}
              onClick={() => handleOpenFormula(idx)}
            />
          ) : seg.type === 'graph' ? (
            <GraphChip
              key={idx}
              config={seg.config}
              isActive={editingGraphIdx === idx}
              onClick={() => handleOpenGraph(idx)}
            />
          ) : seg.type === 'image' ? (
            <ImageChip
              key={idx}
              dataUrl={seg.dataUrl}
              onRemove={() => handleRemoveImage(idx)}
            />
          ) : (
            <TextSegment
              key={idx}
              value={seg.content}
              onChange={val => handleTextChange(idx, val)}
              onFocus={node => { focusedSegRef.current = { idx, node }; }}
            />
          )
        )}
      </div>

      {/* Редактор для добавления нового графика */}
      {showGraphInsertEditor && (
        <FunctionGraphEditor
          onInsert={(cfg) => {
            const segs = latestSegmentsRef.current;
            const config = JSON.parse(cfg.split('[ФУНКЦИЯ: ')[1].slice(0, -1)) as GraphSeg['config'];
            const newSegs: Segment[] = [...segs, { type: 'graph', config }];
            setSegments(normalizeSegments(newSegs));
            setShowGraphInsertEditor(false);
          }}
          onCancel={() => setShowGraphInsertEditor(false)}
        />
      )}

      {/* Редактор для изменения существующего графика */}
      {editingGraphIdx !== null && segments[editingGraphIdx]?.type === 'graph' && (
        <FunctionGraphEditor
          initialConfig={(segments[editingGraphIdx] as GraphSeg).config}
          onInsert={(marker) => {
            const cfg = JSON.parse(marker.split('[ФУНКЦИЯ: ')[1].slice(0, -1)) as GraphSeg['config'];
            handleUpdateGraph(cfg);
          }}
          onCancel={handleCancelGraph}
        />
      )}

      {/* Конструктор формулы — показывается при редактировании формулы */}
      {editingFormulaIdx !== null && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <IcoFormula />
              <span className="text-xs font-semibold text-gray-700">Конструктор формулы</span>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleCancelFormula}
                className="px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleApplyFormula}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0b8acb] hover:bg-[#029bf5] rounded-lg transition-colors"
              >
                Применить
              </button>
            </div>
          </div>
          <div className="p-3">
            {React.createElement('math-field', {
              ref: mathFieldRef,
              style: {
                width: '100%',
                fontSize: '1.15em',
                border: 'none',
                outline: 'none',
                minHeight: '52px',
                display: 'block',
                '--hue': '198',
                '--keyboard-background': '#ffffff',
                '--keycap-background': '#f8fafc',
                '--keycap-text': '#374151',
              },
            })}
          </div>
          <div className="px-3 pb-2">
            <p className="text-xs text-gray-400">
              Используйте панель инструментов или клавиатуру для ввода дробей, корней, интегралов и других символов.
            </p>
          </div>
        </div>
      )}

      {/* Предпросмотр — показывает таблицы и формулы как они будут выглядеть */}
      {showPreview && (
        <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
          <div className="text-xs font-semibold text-slate-400 mb-1.5">Предпросмотр</div>
          <RichText className="text-sm text-gray-700 leading-relaxed">
            {segmentsToText(segments)}
          </RichText>
        </div>
      )}

      {/* Кнопки сохранения */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(segmentsToText(segments))}
          disabled={isSaving || editingFormulaIdx !== null || editingGraphIdx !== null}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#22a139] hover:bg-[#1e9231] text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
        >
          <IcoCheckSave /> {isSaving ? 'Сохраняю...' : saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving || editingFormulaIdx !== null || editingGraphIdx !== null}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-40"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(p => !p)}
          disabled={editingFormulaIdx !== null || editingGraphIdx !== null}
          className={`ml-auto flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs transition-all disabled:opacity-40 ${
            showPreview
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
      </div>

      {/* Блок атрибуции для изображений из Openverse */}
      {openverseAttribution && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <svg className="flex-shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>
            Источник: {openverseAttribution.title && <>{openverseAttribution.title} · </>}
            {openverseAttribution.creator && <>Автор: {openverseAttribution.creator} · </>}
            Лицензия: <span className="font-semibold uppercase">{openverseAttribution.license}</span>
            {' · '}
            <a
              href={openverseAttribution.source}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-900"
            >
              Страница источника
            </a>
          </span>
          <button
            type="button"
            onClick={() => setOpenverseAttribution(null)}
            className="ml-auto flex-shrink-0 text-amber-500 hover:text-amber-700"
            title="Скрыть"
          >
            ×
          </button>
        </div>
      )}

      {/* Пикер Openverse */}
      {showOpenversePicker && (
        <OpenversePicker
          onSelect={handleInsertOpenverseImage}
          onClose={() => setShowOpenversePicker(false)}
        />
      )}
    </div>
  );
}
