import { useState, useRef, useEffect, useMemo } from 'react';
import katex from 'katex';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useTour } from '../context/TourContext';
import { buildTourFromPage } from '../tour/paths/choicePath';
import { TOUR_MOCK_PROJECT } from '../tour/tourMockData';
import { projectsApi } from '../api/projects.api';
import { useAuthStore } from '../store/authStore';
import { useLimitsStore } from '../store/limitsStore';
import { authApi } from '../api/auth.api';
import { RichText } from '../components/RichText';
import { MathText } from '../components/MathText';
import { TaskEditorField } from '../components/TaskEditorField';
import { LimitsBadge } from '../components/LimitsBadge';
import { HistoryPanel } from '../components/HistoryPanel';
import { FormExportDialog } from '../features/exporter/FormExportDialog';
import type {
  Project, Variant, Task, ExportField, ExportLayout, TaskPatch,
} from '../types/api';

const LP = "'Littera Plain', sans-serif";

// ── Хелперы аватара ──────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#21a038', '#0b8acb', '#30b0ba', '#95c949'];
function avatarBg(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function getInitial(fullName: string) {
  return fullName?.trim()?.[0]?.toUpperCase() ?? '?';
}

// ── Иконки мобильной шапки ────────────────────────────────────────────────────
function MobHomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9L12 2L21 9V21H15V15H9V21H3V9Z" />
    </svg>
  );
}
function MobBookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function MobQuestionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" />
    </svg>
  );
}

// ── Иконки ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IcoChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IcoEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IcoRefresh() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
    </svg>
  );
}

function IcoExport() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IcoFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IcoAI() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IcoDiff() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  );
}

function IcoOrigFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IcoRescan() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 .49-3" />
    </svg>
  );
}

function IcoDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

// ── Подсветка различий с поддержкой LaTeX-формул ─────────────────────────────

type DiffToken = { kind: 'ws' | 'formula' | 'word'; value: string };

function tokenizeForDiff(s: string): DiffToken[] {
  const result: DiffToken[] = [];
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      for (const p of s.slice(last, m.index).split(/(\s+)/)) {
        if (p !== '') result.push({ kind: /^\s+$/.test(p) ? 'ws' : 'word', value: p });
      }
    }
    result.push({ kind: 'formula', value: m[0] });
    last = re.lastIndex;
  }
  if (last < s.length) {
    for (const p of s.slice(last).split(/(\s+)/)) {
      if (p !== '') result.push({ kind: /^\s+$/.test(p) ? 'ws' : 'word', value: p });
    }
  }
  return result;
}

function renderLatex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false });
  } catch {
    return tex;
  }
}

function DiffRichText({ text, base }: { text: string; base?: string }) {
  const tokens = useMemo(() => tokenizeForDiff(text), [text]);
  const baseCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!base) return map;
    for (const t of tokenizeForDiff(base)) {
      if (t.kind !== 'ws') map.set(t.value, (map.get(t.value) ?? 0) + 1);
    }
    return map;
  }, [base]);

  if (!base) return <RichText>{text}</RichText>;

  const counts = new Map(baseCounts);

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {tokens.map((t, i) => {
        if (t.kind === 'ws') return <span key={i}>{t.value}</span>;

        const c = counts.get(t.value) ?? 0;
        const isNew = c === 0;
        if (c > 0) counts.set(t.value, c - 1);

        if (t.kind === 'formula') {
          const isDisplay = t.value.startsWith('$$');
          const inner = isDisplay ? t.value.slice(2, -2) : t.value.slice(1, -1);
          const html = renderLatex(inner, isDisplay);
          return isNew
            ? <mark key={i} className="bg-yellow-200 rounded px-0.5 inline-block align-middle">
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </mark>
            : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }

        return isNew
          ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{t.value}</mark>
          : <span key={i}>{t.value}</span>;
      })}
    </span>
  );
}

// ── Метка сложности (число 1..5 → цветной бейдж) ──────────────────────────────

function difficultyBadge(d?: number): { label: string; color: string } | null {
  if (!d) return null;
  if (d <= 2) return { label: 'базовый', color: 'bg-[#22a139]' };
  if (d === 3) return { label: 'средний', color: 'bg-yellow-400' };
  return { label: 'сложный', color: 'bg-rose-400' };
}

function variantsLabel(n: number) {
  if (n === 1) return 'вариант';
  if (n >= 2 && n <= 4) return 'варианта';
  return 'вариантов';
}

function minutesLabel(total: number): string {
  return `~${total} мин`;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика', physics: 'Физика', chemistry: 'Химия',
  biology: 'Биология', russian: 'Русский язык', literature: 'Литература',
  english: 'Английский', history: 'История', social_studies: 'Обществознание',
  geography: 'География', informatics: 'Информатика', other: 'Другое',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  PROBLEM: 'Задачи', TEST: 'Тест', EXERCISE: 'Упражнения',
  OPEN_QUESTION: 'Открытые вопросы', MIXED: 'Смешанный',
};

// ── Модал промпта ИИ ─────────────────────────────────────────────────────────

function PromptModal({
  title, placeholder, onApply, onClose, busy, costHint,
}: {
  title: string; placeholder: string; onApply: (prompt: string) => void; onClose: () => void; busy: boolean;
  costHint?: string;
}) {
  const [prompt, setPrompt] = useState('');
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-[108px] pb-6 overflow-y-auto" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[480px] mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Правка для всего варианта</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#0b8acb] focus:ring-2 focus:ring-[#0b8acb]/20 transition-all"
            rows={4}
            autoFocus
          />
          {costHint && (
            <p className="text-[11px] text-gray-400 mt-2">💡 {costHint}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={() => prompt.trim() && onApply(prompt)}
            disabled={!prompt.trim() || busy}
            className="px-4 py-2 bg-[#0b8acb] hover:bg-[#029bf5] text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          >
            {busy ? 'Применяю...' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Задание внутри карточки варианта ──────────────────────────────────────────

function TaskItem({
  index, task, baseTask, baseText, showDiff, isLast,
  isEditing, editText, onTextChange,
  isThisTaskEditing, onBeginEditThis, onSaveThis, onCancelEditThis, isSavingThis,
  onRegenerateThis, isRegeneratingThis,
  disableEditButton,
}: {
  index: number; task: Task; baseTask?: Task;
  baseText?: string;
  showDiff: boolean; isLast: boolean;
  isEditing: boolean; editText: string;
  onTextChange: (val: string) => void;
  isThisTaskEditing?: boolean;
  onBeginEditThis?: () => void;
  onSaveThis?: () => void;
  onCancelEditThis?: () => void;
  isSavingThis?: boolean;
  onRegenerateThis?: () => void;
  isRegeneratingThis?: boolean;
  disableEditButton?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  // Individual task edit mode — TaskEditorField со своим save/cancel
  if (isThisTaskEditing) {
    return (
      <div className={`px-2 py-2 ${!isLast ? 'border-b border-gray-100' : ''}`}>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-2">Задание {index}</p>
        <TaskEditorField
          text={editText}
          onSave={val => { onTextChange(val); onSaveThis?.(); }}
          onCancel={() => onCancelEditThis?.()}
          isSaving={isSavingThis}
        />
      </div>
    );
  }

  // Bulk edit mode — TaskEditorField с onChange (без кнопок сохранения — save общий на карточке)
  if (isEditing) {
    return (
      <div className={`px-2 py-2 ${!isLast ? 'border-b border-gray-100' : ''}`}>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-2">Задание {index}</p>
        <TaskEditorField
          text={editText}
          onSave={val => onTextChange(val)}
          onCancel={() => {/* handled by variant card */}}
          onChange={val => onTextChange(val)}
          saveLabel="Применить"
        />
      </div>
    );
  }

  // Read-only mode with hover action buttons
  return (
    <div
      className={`px-4 py-3 ${!isLast ? 'border-b border-gray-100' : ''} relative`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="text-sm text-gray-700 leading-relaxed">
        <span className="text-xs font-semibold text-gray-400 mr-1.5">{index}.</span>
        {showDiff
          ? <DiffRichText text={task.text} base={baseText ?? baseTask?.text} />
          : <RichText>{task.text}</RichText>}
      </div>
      {task.answer && (
        <details className="mt-2">
          <summary className="text-xs text-[#0b8acb] cursor-pointer select-none">Ответ</summary>
          <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
            <MathText>{task.answer}</MathText>
          </div>
        </details>
      )}
      {task.photoUrl && (
        <div className="mt-2">
          <img src={task.photoUrl} alt="фото к заданию" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
        </div>
      )}
      {!disableEditButton && (onBeginEditThis || onRegenerateThis) && (
        <div
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          className="absolute top-2.5 right-2.5 flex items-center gap-1"
        >
          {onRegenerateThis && (
            <button
              onClick={onRegenerateThis}
              disabled={isRegeneratingThis}
              className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg text-[11px] text-gray-400 bg-white hover:border-gray-300 hover:text-[#0b8acb] disabled:opacity-50"
              title="Перегенерировать это задание"
            >
              {isRegeneratingThis ? <Spinner /> : <IcoRefresh />}
              {isRegeneratingThis ? '...' : 'Заново'}
            </button>
          )}
          {onBeginEditThis && (
            <button
              onClick={onBeginEditThis}
              className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg text-[11px] text-gray-400 bg-white hover:border-gray-300 hover:text-gray-600"
              title="Редактировать это задание"
            >
              <IcoEdit /> Изменить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Карточка варианта ─────────────────────────────────────────────────────────

function VariantCard({
  variant, index, topicLabel, projectId, busy, setBusy, onError, baseTasks, showDiff, refText, isFirst,
}: {
  variant: Variant; index: number; topicLabel?: string | null; projectId: string;
  busy: boolean; setBusy: (b: boolean) => void; onError: (msg: string) => void;
  baseTasks?: Task[];
  showDiff: boolean;
  /** Текст эталона (FROM_REFERENCE) — используется как база для diff-подсветки ВСЕХ вариантов. */
  refText?: string;
  isFirst?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editingTaskIdx, setEditingTaskIdx] = useState<number | null>(null);
  const [taskTexts, setTaskTexts] = useState<string[]>(variant.tasks.map(t => t.text));
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const refreshLimits = useLimitsStore(s => s.refresh);
  const update = (u: Project) => { queryClient.setQueryData(['project', projectId], u); setBusy(false); refreshLimits(); };
  const fail = (msg: string) => { setBusy(false); onError(msg); };

  const saveManual = useMutation({
    mutationFn: () => {
      const tasks: TaskPatch[] = variant.tasks.map((t, i) => ({
        taskId: t.taskId,
        text: taskTexts[i],
      }));
      return projectsApi.updateVariant(projectId, variant.variantId, { tasks });
    },
    onMutate: () => setBusy(true),
    onSuccess: (u) => { update(u); setIsEditing(false); },
    onError: () => fail('Не удалось сохранить правки. Проверьте соединение.'),
  });

  const regenerate = useMutation({
    mutationFn: () => projectsApi.regenerateVariant(projectId, variant.variantId),
    onMutate: () => setBusy(true),
    onSuccess: update,
    onError: () => fail('GigaChat не смог перегенерировать вариант. Попробуйте ещё раз.'),
  });

  const aiEdit = useMutation({
    mutationFn: (prompt: string) => projectsApi.aiEditVariant(projectId, variant.variantId, { prompt }),
    onMutate: () => setBusy(true),
    onSuccess: (u) => { update(u); setAiModalOpen(false); },
    onError: () => fail('GigaChat не смог применить правку. Попробуйте переформулировать запрос.'),
  });

  const remove = useMutation({
    mutationFn: () => projectsApi.deleteVariant(projectId, variant.variantId),
    onMutate: () => setBusy(true),
    onSuccess: update,
    onError: () => fail('Не удалось удалить вариант.'),
  });

  const saveOneTask = useMutation({
    mutationFn: (idx: number) =>
      projectsApi.updateVariant(projectId, variant.variantId, {
        tasks: [{ taskId: variant.tasks[idx].taskId, text: taskTexts[idx] }],
      }),
    onMutate: () => setBusy(true),
    onSuccess: (u) => { update(u); setEditingTaskIdx(null); },
    onError: () => fail('Не удалось сохранить задание.'),
  });

  const regenerateOneTask = useMutation({
    mutationFn: (taskId: string) =>
      projectsApi.regenerateTask(projectId, variant.variantId, taskId),
    onMutate: () => setBusy(true),
    onSuccess: update,
    onError: () => fail('GigaChat не смог перегенерировать задание. Попробуйте ещё раз.'),
  });

  function beginEdit() {
    setTaskTexts(variant.tasks.map(t => t.text));
    setEditingTaskIdx(null);
    setIsEditing(true);
  }

  function beginEditTask(idx: number) {
    setTaskTexts(variant.tasks.map(t => t.text));
    setIsEditing(false);
    setEditingTaskIdx(idx);
  }

  function handleCancel() {
    setTaskTexts(variant.tasks.map(t => t.text));
    setIsEditing(false);
    setEditingTaskIdx(null);
  }

  const badge = difficultyBadge(variant.difficulty);
  const actionBtn = 'flex items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium text-gray-500 whitespace-nowrap transition-all disabled:opacity-50';

  return (
    <>
      <div data-tour={isFirst ? 'compare-variant-card' : undefined} className={`border bg-white rounded-2xl overflow-hidden flex flex-col transition-all duration-200 ${
        isEditing ? 'border-[#0b8acb] shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}>
        {/* Шапка карточки */}
        <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {index}
              </span>
              {topicLabel ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#30b0ba]/15 text-[#30b0ba] max-w-[120px] truncate" title={topicLabel}>
                  {topicLabel}
                </span>
              ) : (
                <span className="text-sm font-medium text-gray-700">Вариант</span>
              )}
            </div>
            {badge && (
              <span data-tour={isFirst ? 'compare-difficulty-badge' : undefined} className={`text-xs font-semibold px-2.5 py-0.5 rounded-full text-white ${badge.color}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 print:hidden">
            {variant.totalEstimatedMinutes
              ? minutesLabel(variant.totalEstimatedMinutes)
              : `${variant.tasks.length} ${variant.tasks.length === 1 ? 'задание' : variant.tasks.length <= 4 ? 'задания' : 'заданий'}`}
          </p>
        </div>

        {/* Задания */}
        <div className="flex-1">
          {variant.tasks.map((task, idx) => (
            <div key={task.taskId} data-tour={isFirst && idx === 0 ? 'compare-task-edit' : undefined}>
            <TaskItem
              index={idx + 1}
              task={task}
              baseTask={showDiff && !refText && baseTasks ? baseTasks[idx] : undefined}
              baseText={showDiff && refText ? refText : undefined}
              showDiff={showDiff}
              isLast={idx === variant.tasks.length - 1}
              isEditing={isEditing}
              editText={taskTexts[idx]}
              onTextChange={val => setTaskTexts(prev => prev.map((t, i) => i === idx ? val : t))}
              isThisTaskEditing={editingTaskIdx === idx}
              onBeginEditThis={() => beginEditTask(idx)}
              onSaveThis={() => saveOneTask.mutate(idx)}
              onCancelEditThis={() => setEditingTaskIdx(null)}
              isSavingThis={saveOneTask.isPending && editingTaskIdx === idx}
              onRegenerateThis={() => regenerateOneTask.mutate(task.taskId)}
              isRegeneratingThis={regenerateOneTask.isPending && regenerateOneTask.variables === task.taskId}
              disableEditButton={isEditing || editingTaskIdx !== null}
            />
            </div>
          ))}
        </div>

        {/* Футер — все действия в одну строку */}
        <div className="px-3 pb-3 pt-3 border-t border-gray-100 flex items-center gap-1 flex-shrink-0 flex-wrap">
          {isEditing ? (
            <>
              <button
                onClick={() => saveManual.mutate()}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#22a139] hover:bg-[#1e9231] text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              >
                <IcoCheck /> {saveManual.isPending ? 'Сохраняю...' : 'Сохранить'}
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-all"
              >
                Отмена
              </button>
            </>
          ) : (
            <>
              <button onClick={beginEdit} disabled={busy} title="Редактировать вручную" className={`${actionBtn} hover:border-gray-300 hover:text-gray-700`}>
                <IcoEdit /> Править
              </button>
              <button data-tour={isFirst ? 'compare-edit-prompt-btn' : undefined} onClick={() => setAiModalOpen(true)} disabled={busy} title="Править с помощью ИИ" className={`${actionBtn} hover:border-gray-300 hover:text-gray-700`}>
                <IcoAI /> С ИИ
              </button>
              <button onClick={() => regenerate.mutate()} disabled={busy} title="Перегенерировать вариант" className={`${actionBtn} hover:border-gray-300 hover:text-gray-700`}>
                <IcoRefresh /> {regenerate.isPending ? '...' : 'Заново'}
              </button>
              <button
                onClick={() => { if (confirm(`Удалить вариант ${index}?`)) remove.mutate(); }}
                disabled={busy}
                title="Удалить вариант"
                className={`${actionBtn} hover:border-rose-300 hover:text-rose-500`}
              >
                <IcoTrash /> Удалить
              </button>
            </>
          )}
        </div>
      </div>

      {aiModalOpen && (
        <PromptModal
          title={`Правка с ИИ — Вариант ${index}`}
          placeholder="Например: сделать задачи проще, заменить персонажей..."
          onApply={prompt => aiEdit.mutate(prompt)}
          onClose={() => setAiModalOpen(false)}
          busy={aiEdit.isPending}
          costHint={`Спишется примерно по 0.2–0.5% за каждое из ${variant.tasks.length} заданий варианта`}
        />
      )}
    </>
  );
}

// ── Хелперы предпросмотра файла ──────────────────────────────────────────────

function refFileIsImage(fileName: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
}
function refFileIsPdf(fileName: string) {
  return /\.pdf$/i.test(fileName);
}

// ── Исходное задание (сворачиваемое, редактируемое) ──────────────────────────

function OriginalTask({
  referenceText, isOpen, onToggle, onSaveText, isSavingText,
  projectId, referenceFileId, referenceFileName,
}: {
  referenceText: string | null | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onSaveText?: (text: string) => void;
  isSavingText?: boolean;
  projectId?: string;
  referenceFileId?: string;
  referenceFileName?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [fileFetching, setFileFetching] = useState(false);
  const [fileFetchFailed, setFileFetchFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !projectId || !referenceFileId || fileBlobUrl || fileFetching) return;
    setFileFetching(true);
    projectsApi.getReferenceFileBlobUrl(projectId)
      .then(url => setFileBlobUrl(url))
      .catch(() => { setFileFetchFailed(true); })
      .finally(() => setFileFetching(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl); };
  }, [fileBlobUrl]);

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-200 mb-4 ${
      isOpen ? 'border-gray-300 shadow-sm' : 'border-gray-200'
    }`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors cursor-pointer select-none"
      >
        <span className="text-gray-400 flex-shrink-0"><IcoFile /></span>
        <span className="flex-1 text-sm font-medium text-gray-700">
          Исходный вариант (оригинал)
        </span>
        {referenceFileId && referenceFileName && projectId && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); projectsApi.viewReferenceFile(projectId); }}
            title={`Открыть исходный файл: ${referenceFileName}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-400 hover:text-[#0b8acb] hover:bg-blue-50 transition-all flex-shrink-0 mr-1"
          >
            <IcoOrigFile /> Открыть файл
          </button>
        )}
        <span className="text-gray-400"><IcoChevron open={isOpen} /></span>
      </div>

      <div className="overflow-hidden transition-all duration-300 ease-in-out" style={{ maxHeight: isOpen ? '3600px' : '0px' }}>
        <div className="border-t border-gray-100 px-5 py-4">

          {/* Предпросмотр исходного файла */}
          {referenceFileId && referenceFileName && (
            <div className="mb-4">
              {fileFetching && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <span className="w-4 h-4 border-2 border-gray-200 border-t-[#0b8acb] rounded-full animate-spin flex-shrink-0" />
                  Загрузка файла…
                </div>
              )}
              {!fileFetching && fileBlobUrl && refFileIsImage(referenceFileName) && (
                <img
                  src={fileBlobUrl}
                  alt={referenceFileName}
                  className="max-w-full rounded-xl border border-gray-200 object-contain mb-2"
                  style={{ maxHeight: '600px' }}
                />
              )}
              {!fileFetching && fileBlobUrl && refFileIsPdf(referenceFileName) && (
                <embed
                  src={fileBlobUrl}
                  type="application/pdf"
                  className="w-full rounded-xl border border-gray-200 mb-2"
                  style={{ height: '600px' }}
                />
              )}
              {!fileFetching && fileBlobUrl && !refFileIsImage(referenceFileName) && !refFileIsPdf(referenceFileName) && (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 mb-2">
                  <IcoFile />
                  <span className="truncate">{referenceFileName}</span>
                  <span className="text-gray-400 flex-shrink-0">— предпросмотр недоступен</span>
                </div>
              )}
              {!fileFetching && !fileBlobUrl && fileFetchFailed && projectId && (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 mb-2">
                  <IcoFile />
                  <span className="truncate flex-1">{referenceFileName}</span>
                  <button
                    onClick={() => projectsApi.viewReferenceFile(projectId)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 hover:border-[#0b8acb] hover:text-[#0b8acb] transition-all flex-shrink-0"
                  >
                    <IcoFile /> Открыть файл
                  </button>
                </div>
              )}
              {(fileBlobUrl || fileFetchFailed) && referenceText && (
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3 mt-2">
                  Считанный текст
                </p>
              )}
            </div>
          )}

          {isEditing ? (
            <TaskEditorField
              text={referenceText ?? ''}
              onSave={text => { onSaveText?.(text); setIsEditing(false); }}
              onCancel={() => setIsEditing(false)}
              isSaving={isSavingText}
            />
          ) : (
            <>
              {referenceText ? (
                <div className="text-sm text-gray-700 leading-relaxed mb-3">
                  <RichText>{referenceText}</RichText>
                </div>
              ) : (
                referenceFileId && (
                  <p className="text-xs text-gray-400 italic mb-3">
                    Текст не был распознан из файла
                  </p>
                )
              )}
              {onSaveText && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:border-[#0b8acb] hover:text-[#0b8acb] transition-all"
                >
                  <IcoEdit /> Редактировать эталон
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Диалог экспорта (как Export.jsx) ──────────────────────────────────────────

const PRINT_FIELDS: { id: ExportField; label: string }[] = [
  { id: 'studentName', label: 'Ф.И.О. ученика' },
  { id: 'className', label: 'Класс' },
  { id: 'date', label: 'Дата' },
  { id: 'grade', label: 'Оценка' },
];

const FORMATS: { id: 'PDF' | 'DOCX'; enabled: boolean }[] = [
  { id: 'PDF', enabled: true },
  { id: 'DOCX', enabled: true },
];

const LAYOUTS: { label: string; value: ExportLayout }[] = [
  { label: 'По одному варианту на лист', value: 'ONE_PER_PAGE' },
  { label: 'Непрерывный список', value: 'CONTINUOUS' },
];

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group select-none" onClick={() => onChange(!checked)}>
      <span
        className={`w-[18px] h-[18px] rounded border flex-shrink-0 flex items-center justify-center transition-all ${
          checked ? 'bg-[#0b8acb] border-[#0b8acb]' : 'border-gray-300 bg-white group-hover:border-gray-400'
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polyline points="2 5 4 7 8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function ExportDialog({ projectId, defaultName, onClose }: { projectId: string; defaultName: string; onClose: () => void }) {
  const [fileName, setFileName] = useState(defaultName);
  const [format, setFormat] = useState<'PDF' | 'DOCX'>('PDF');
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [includeCriteria, setIncludeCriteria] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [includeKitName, setIncludeKitName] = useState(false);
  const [kitName, setKitName] = useState('');
  const [enabledFields, setEnabledFields] = useState<ExportField[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleField(id: ExportField) {
    setEnabledFields(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }

  async function handleExport() {
    setLoading(true);
    setSuccess(false);
    setError(null);
    try {
      await projectsApi.exportFile(projectId, format.toLowerCase() as 'pdf' | 'docx', {
        includeFields: enabledFields,
        layout: LAYOUTS[layoutIdx].value,
        includeAnswers,
        includeCriteria,
        showDifficulty,
        kitName: includeKitName && kitName.trim() ? kitName.trim() : undefined,
      });
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch {
      setLoading(false);
      setError('Не удалось сформировать файл. Попробуйте позже.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[108px] pb-6 overflow-y-auto">
      {/* Затемнение */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Карточка модала */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 z-10 overflow-visible max-h-[calc(100vh-132px)] overflow-y-auto">
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Экспорт комплекта</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <IcoX />
          </button>
        </div>

        {/* Тело */}
        <div className="px-6 py-5 space-y-5">
          {/* Название файла */}
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Название файла</p>
            <input
              type="text"
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-[#0b8acb] focus:ring-2 focus:ring-[#0b8acb]/10 transition-all"
              placeholder="Введите название"
            />
          </div>

          {/* Формат */}
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Формат</p>
            <div className="flex gap-2">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => f.enabled && setFormat(f.id)}
                  disabled={!f.enabled}
                  title={f.enabled ? undefined : 'Формат пока недоступен'}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    !f.enabled
                      ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                      : format === f.id
                        ? 'bg-[#0b8acb] text-white border-[#0b8acb]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {f.id}
                </button>
              ))}
            </div>
          </div>

          {/* Поля для печати */}
          <div data-tour="export-header-fields">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Поля для печати</p>
            <div className="flex flex-wrap gap-2">
              {PRINT_FIELDS.map(field => {
                const active = enabledFields.includes(field.id);
                return (
                  <button
                    key={field.id}
                    onClick={() => toggleField(field.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-[#0b8acb]/10 text-[#0b8acb] border-[#0b8acb]/30'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {field.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Раскладка */}
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Раскладка</p>
            <div className="relative">
              <select
                value={layoutIdx}
                onChange={e => setLayoutIdx(Number(e.target.value))}
                className="w-full appearance-none px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-[#0b8acb] focus:ring-2 focus:ring-[#0b8acb]/10 transition-all bg-white pr-9 cursor-pointer"
              >
                {LAYOUTS.map((l, i) => (
                  <option key={l.label} value={i}>{l.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>

          {/* Название комплекта */}
          <div className="space-y-2">
            <CheckRow checked={includeKitName} onChange={setIncludeKitName} label="Добавить название комплекта перед каждым вариантом" />
            {includeKitName && (
              <input
                type="text"
                value={kitName}
                onChange={e => setKitName(e.target.value)}
                placeholder="Например: Контрольная работа по русскому языку"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-[#0b8acb] focus:ring-2 focus:ring-[#0b8acb]/10 transition-all"
              />
            )}
          </div>

          {/* Чекбоксы */}
          <div className="space-y-3 pt-1">
            <CheckRow checked={includeAnswers} onChange={setIncludeAnswers} label="Добавить раздел с ответами (для учителя)" />
            <CheckRow checked={includeCriteria} onChange={setIncludeCriteria} label="Добавить критерии оценивания" />
            <CheckRow checked={showDifficulty} onChange={setShowDifficulty} label="Показывать уровень сложности у каждого варианта" />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        {/* Футер */}
        <div className="px-6 pb-5 pt-1 flex gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            Отмена
          </button>
          <button
            data-tour="export-download-btn"
            onClick={handleExport}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              loading
                ? 'bg-[#0b8acb]/60 text-white cursor-not-allowed'
                : success
                  ? 'bg-[#22a139] text-white'
                  : 'bg-[#0b8acb] hover:bg-[#029bf5] text-white shadow-sm'
            }`}
          >
            {loading ? (
              <><Spinner /> Генерируется...</>
            ) : success ? (
              <><IcoCheck /> Готово!</>
            ) : (
              <><IcoDownload /> Скачать {format}</>
            )}
          </button>
        </div>

        {/* Тост */}
        {success && (
          <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 bg-[#22a139] text-white text-sm font-semibold rounded-2xl shadow-lg whitespace-nowrap animate-fade-slide-up">
            <IcoCheck />
            {format}-файл готов — скачивание начнётся автоматически
          </div>
        )}
      </div>
    </div>
  );
}

// ── Страница ──────────────────────────────────────────────────────────────────

export function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tourActive, steps, currentStep, startTour } = useTour();
  const { user, clear } = useAuthStore();
  const refreshLimits = useLimitsStore(s => s.refresh);

  // Мобильная шапка
  const [isMobile, setIsMobile] = useState(() => (window.visualViewport?.width ?? window.innerWidth) < 768);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const upd = () => setIsMobile((window.visualViewport?.width ?? window.innerWidth) < 768);
    window.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('resize', upd);
    return () => {
      window.removeEventListener('resize', upd);
      window.visualViewport?.removeEventListener('resize', upd);
    };
  }, []);

  useEffect(() => {
    const onOut = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    try { await authApi.logout(); } catch { /* ignore */ }
    clear();
    navigate('/login');
  }

  function handleStartTour() {
    setHamburgerOpen(false);
    const { steps: tourSteps, phaseIndex, startStep } = buildTourFromPage('project');
    startTour('project', tourSteps, phaseIndex, startStep);
  }

  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [aiAllOpen, setAiAllOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [fileDownloading, setFileDownloading] = useState(false);
  const [fileViewing, setFileViewing] = useState(false);

  const reparseRef = useMutation({
    mutationFn: () => projectsApi.reparseReference(projectId!),
    onMutate: () => { setBusy(true); setErrorMsg(null); },
    onSuccess: u => { queryClient.setQueryData(['project', projectId], u); setBusy(false); },
    onError: () => showError('Не удалось распознать файл повторно. Возможно, файл недоступен или сервис занят — попробуйте позже.'),
  });

  // Авто-открываем модал экспорта, когда тур на него указывает
  useEffect(() => {
    if (!tourActive || !steps.length || currentStep >= steps.length) return;
    if (steps[currentStep]?.openExportModal) {
      setExportOpen(true);
    }
  }, [tourActive, currentStep, steps]);

  // Авто-открываем/закрываем модал онлайн-формы во время тура
  useEffect(() => {
    if (!tourActive || !steps.length || currentStep >= steps.length) return;
    const step = steps[currentStep];
    if (step?.openFormModal) {
      setFormOpen(true);
    } else if (step?.tourId && !step.tourId.startsWith('form-')) {
      setFormOpen(false);
    }
  }, [tourActive, currentStep, steps]);

  const isTourMode = !projectId;

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
    refetchInterval: q => (q.state.data?.status === 'GENERATING' ? 3000 : false),
  });

  // В тур-моде используем мок-проект вместо API
  const effectiveProject = isTourMode ? TOUR_MOCK_PROJECT : project;

  const showError = (msg: string) => { setErrorMsg(msg); setBusy(false); };

  const retryGeneration = useMutation({
    mutationFn: () => projectsApi.retryGeneration(projectId!),
    onMutate: () => { setBusy(true); setErrorMsg(null); },
    onSuccess: u => { queryClient.setQueryData(['project', projectId], u); setBusy(false); refreshLimits(); },
    onError: () => { setBusy(false); showError('GigaChat не смог сгенерировать задания. Попробуйте ещё раз или уменьшите число вариантов.'); },
  });

  const aiEditAll = useMutation({
    mutationFn: (prompt: string) => projectsApi.aiEditAll(projectId!, { prompt }),
    onMutate: () => { setBusy(true); setErrorMsg(null); },
    onSuccess: u => { queryClient.setQueryData(['project', projectId], u); setBusy(false); setAiAllOpen(false); refreshLimits(); },
    onError: () => showError('GigaChat не смог применить правку ко всему комплекту. Попробуйте уменьшить запрос или правьте варианты по одному.'),
  });

  const addVariant = useMutation({
    mutationFn: () => projectsApi.addVariant(projectId!),
    onMutate: () => { setBusy(true); setErrorMsg(null); },
    onSuccess: u => { queryClient.setQueryData(['project', projectId], u); setBusy(false); refreshLimits(); },
    onError: () => showError('Не удалось добавить вариант. Попробуйте ещё раз.'),
  });

  const updateRefText = useMutation({
    mutationFn: (text: string) => projectsApi.updateReferenceText(projectId!, text),
    onMutate: () => { setBusy(true); setErrorMsg(null); },
    onSuccess: u => { queryClient.setQueryData(['project', projectId], u); setBusy(false); },
    onError: () => showError('Не удалось сохранить эталонный текст. Проверьте соединение.'),
  });

  if (!isTourMode && isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-8 text-center text-gray-400">
        Загрузка проекта...
      </main>
    );
  }

  if (!isTourMode && (isError || !project)) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-8 text-center">
        <p className="text-red-500 mb-4">Не удалось загрузить проект</p>
        <Link to="/library" className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-semibold transition-colors">
          В библиотеку
        </Link>
      </main>
    );
  }

  const subjectLabel = effectiveProject!.subject ? (SUBJECT_LABELS[effectiveProject!.subject] ?? effectiveProject!.subject) : null;

  // Короткая тема для плашки на карточках вариантов
  const topicShort = effectiveProject!.topic ? effectiveProject!.topic.trim().split(/\s+/).slice(0, 2).join(' ') : null;

  return (
    <div>
      {/* ── Мобильная шапка ── */}
      {isMobile && (
        <>
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
            background: '#fff', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', padding: '0 16px',
            justifyContent: 'space-between', zIndex: 50,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setHamburgerOpen(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', gap: '5px' }}
                aria-label="Меню"
              >
                <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
                <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
                <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
              </button>
              <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                <img src="/logo.png" alt="ВариантУм" style={{ height: '30px', objectFit: 'contain' }} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user && <LimitsBadge scale={0.9} />}
            <div ref={menuRef} style={{ position: 'relative' }}>
              {user && (
                <>
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                    }}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: avatarBg(user.fullName),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontFamily: LP, fontWeight: 400, fontSize: '14px', color: '#fff', lineHeight: 1 }}>
                        {getInitial(user.fullName)}
                      </span>
                    </div>
                    <span style={{ fontFamily: LP, fontSize: '16px', color: '#000', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.fullName.split(' ')[0]}
                    </span>
                    <svg width="11" height="7" viewBox="0 0 12 7" fill="none" style={{ transition: 'transform .2s', transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
                      <path d="M1 1L6 6L11 1" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                      background: '#fff', border: '1px solid #e0e0e0',
                      borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.15)',
                      minWidth: '180px', zIndex: 100, overflow: 'hidden',
                    }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                        <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '14px', margin: 0, color: '#000' }}>{user.fullName}</p>
                        <p style={{ fontFamily: LP, fontSize: '12px', margin: '2px 0 0', color: '#888' }}>{user.email}</p>
                      </div>
                      <button onClick={handleLogout} style={{
                        width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: LP, fontSize: '14px', color: '#e53e3e', textAlign: 'left',
                      }}>
                        Выйти
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </div>

          {/* ── Гамбургер-меню (drawer) ── */}
          {hamburgerOpen && (
            <>
              <div
                onClick={() => setHamburgerOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 200 }}
              />
              <div style={{
                position: 'fixed', left: 0, top: 0, bottom: 0,
                width: '62%', maxWidth: '280px',
                background: '#fff', zIndex: 201,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  height: '60px', display: 'flex', alignItems: 'center',
                  padding: '0 16px', borderBottom: '1px solid #e5e7eb', gap: '10px',
                }}>
                  <button
                    onClick={() => setHamburgerOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}
                    aria-label="Закрыть меню"
                  >
                    <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
                    <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
                    <span style={{ display: 'block', width: '22px', height: '2.5px', background: '#21a038', borderRadius: '2px' }} />
                  </button>
                  <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                    <img src="/logo.png" alt="ВариантУм" style={{ height: '30px', objectFit: 'contain' }} />
                  </button>
                </div>
                <nav style={{ flex: 1, overflowY: 'auto' }}>
                  {[
                    { icon: <MobHomeIcon />, label: 'Главная страница', action: () => { setHamburgerOpen(false); navigate('/'); } },
                    { icon: <MobBookIcon />, label: 'Моя библиотека', action: () => { setHamburgerOpen(false); navigate('/library'); } },
                    { icon: <MobQuestionIcon />, label: 'Инструкция', action: handleStartTour },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '18px 20px', background: 'none', border: 'none',
                        borderBottom: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {icon}
                      <span style={{ fontFamily: LP, fontSize: '17px', color: '#000' }}>{label}</span>
                    </button>
                  ))}
                  {user && (
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
                      <LimitsBadge scale={1} inlineExpand />
                    </div>
                  )}
                </nav>
              </div>
            </>
          )}
        </>
      )}

    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8" style={{ paddingTop: isMobile ? '76px' : undefined }}>
      {/* Хлебная крошка */}
      <Link
        to="/library"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <IcoBack /> В библиотеку
      </Link>

      {/* Заголовок */}
      <div className="flex flex-col gap-2 mb-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Сравнение вариантов</h1>
          <p className="text-sm text-gray-400 mt-1">Проверьте комплект вариантов</p>
        </div>
        {effectiveProject!.status === 'READY' && effectiveProject!.variants.length > 0 && (
          <div className="flex gap-2 flex-shrink-0 self-start sm:mt-1">
            <button
              data-tour="compare-export-btn"
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#22a139] hover:bg-[#1a8a30] text-white rounded-xl text-sm font-semibold transition-all"
            >
              <IcoExport /> Экспорт
            </button>
            <button
              data-tour={tourActive ? 'compare-online-form' : undefined}
              onClick={() => { if (!tourActive) setFormOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#0b8acb] hover:bg-[#029bf5] text-white rounded-xl text-sm font-semibold transition-all"
              title="Создать онлайн-форму для сдачи работы учениками"
            >
              🔗 Онлайн-форма
            </button>
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-5 mb-4 sm:mb-5">
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          <p className="text-sm sm:text-2xl font-bold text-gray-800 truncate">{subjectLabel ?? '—'}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{effectiveProject!.grade ? `${effectiveProject!.grade} класс` : 'класс не указан'}</p>
        </div>
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          <p className="text-sm sm:text-2xl font-bold text-gray-800">{effectiveProject!.variants.length} {variantsLabel(effectiveProject!.variants.length)}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">в комплекте</p>
        </div>
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          <p className="text-sm sm:text-2xl font-bold text-gray-800 truncate">{TASK_TYPE_LABELS[effectiveProject!.variants[0]?.tasks[0]?.taskType ?? ''] ?? '—'}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">тип заданий</p>
        </div>
      </div>

      {/* Ошибка операции */}
      {errorMsg && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-2 border bg-red-50 text-red-700 border-red-200">
          <span>⚠️</span>
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold">×</button>
        </div>
      )}

      {/* Состояние генерации */}
      {effectiveProject!.status === 'GENERATING' && (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">⏳</div>
          <p>GigaChat генерирует задания...</p>
          <p className="text-sm text-gray-400 mt-1">Страница обновляется автоматически</p>
        </div>
      )}

      {/* Состояние ошибки генерации */}
      {effectiveProject!.status === 'FAILED' && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">❌</div>
          <p className="text-red-600 font-semibold mb-1">Ошибка при генерации</p>
          <p className="text-gray-500 text-sm mb-5">
            GigaChat не смог сгенерировать задания. Попробуйте ещё раз или уменьшите число вариантов.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {projectId && (
              <button
                onClick={() => retryGeneration.mutate()}
                disabled={retryGeneration.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#22a139] hover:bg-[#1a8a30] disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {retryGeneration.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Генерирую...</>
                ) : 'Попробовать снова'}
              </button>
            )}
            <Link
              to={effectiveProject!.mode === 'FROM_REFERENCE' ? '/upload' : '/generate'}
              className="inline-block px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold transition-colors"
            >
              Создать новый
            </Link>
          </div>
        </div>
      )}

      {/* Готовые варианты */}
      {effectiveProject!.status === 'READY' && effectiveProject!.variants.length > 0 && (
        <>
          {/* Панель действий */}
          <div className="flex items-center gap-2 sm:gap-3 mb-4 flex-wrap">
            <button
              onClick={() => addVariant.mutate()}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
            >
              <IcoPlus /> {addVariant.isPending ? 'Добавляю...' : 'Добавить вариант'}
            </button>
            <button
              onClick={() => setAiAllOpen(true)}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
            >
              <IcoAI /> Править все варианты промптом
            </button>
            {/* Переключатель подсветки различий */}
            <button
              onClick={() => setShowDiff(v => !v)}
              title={showDiff ? 'Отключить подсветку различий' : 'Показать различия между вариантами'}
              className={`flex items-center gap-1.5 px-4 py-2 border rounded-xl text-sm font-semibold transition-all ${
                showDiff
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              <IcoDiff />
              {showDiff ? 'Различия вкл.' : 'Различия'}
            </button>
            {/* История версий с откатом */}
            {!isTourMode && (
              <button
                onClick={() => setHistoryOpen(true)}
                title="История изменений и откат к предыдущей версии"
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v5h5" />
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                  <path d="M12 7v5l4 2" />
                </svg>
                История
              </button>
            )}
            {/* Кнопки исходного файла: Открыть + Скачать + Распознать заново (только не в тур-режиме) */}
            {!isTourMode && effectiveProject!.referenceFileId && effectiveProject!.referenceFileName && (
              <>
                <button
                  onClick={async () => {
                    setFileViewing(true);
                    try {
                      await projectsApi.viewReferenceFile(projectId!);
                    } catch { /* ignore */ }
                    setFileViewing(false);
                  }}
                  disabled={fileViewing}
                  title={`Открыть в браузере: ${effectiveProject!.referenceFileName}`}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
                >
                  <IcoFile />
                  {fileViewing ? 'Открываю...' : 'Открыть исходник'}
                </button>
                <button
                  onClick={async () => {
                    setFileDownloading(true);
                    try {
                      await projectsApi.downloadReferenceFile(projectId!, effectiveProject!.referenceFileName!);
                    } catch { /* ignore */ }
                    setFileDownloading(false);
                  }}
                  disabled={fileDownloading}
                  title={`Скачать: ${effectiveProject!.referenceFileName}`}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
                >
                  <IcoOrigFile />
                  {fileDownloading ? 'Скачиваю...' : 'Скачать исходник'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Нейросеть заново прочитает загруженный файл и обновит текст эталона. Текущий текст будет заменён. Продолжить?')) {
                      reparseRef.mutate();
                    }
                  }}
                  disabled={busy || reparseRef.isPending}
                  title="Повторно распознать текст из загруженного файла"
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
                >
                  <IcoRescan />
                  {reparseRef.isPending ? 'Распознаю...' : 'Распознать файл заново'}
                </button>
              </>
            )}
          </div>

          {/* Исходное задание */}
          {effectiveProject!.mode === 'FROM_REFERENCE' && (effectiveProject!.referenceText || effectiveProject!.referenceFileId) && (
            <div data-tour="compare-original">
              <OriginalTask
                referenceText={effectiveProject!.referenceText}
                isOpen={isOriginalOpen}
                onToggle={() => setIsOriginalOpen(v => !v)}
                onSaveText={isTourMode ? undefined : text => updateRefText.mutate(text)}
                isSavingText={updateRefText.isPending}
                projectId={projectId}
                referenceFileId={effectiveProject!.referenceFileId}
                referenceFileName={effectiveProject!.referenceFileName}
              />
            </div>
          )}

          {/* Сетка вариантов */}
          <div id="variants-grid" className="grid grid-cols-1 gap-4 mb-8 items-start sm:grid-cols-2">
            {effectiveProject!.variants.map((variant, idx) => (
              <VariantCard
                key={variant.variantId}
                variant={variant}
                index={idx + 1}
                topicLabel={topicShort}
                projectId={projectId ?? 'tour-mock'}
                busy={busy}
                setBusy={setBusy}
                onError={showError}
                baseTasks={effectiveProject!.variants[0]?.tasks}
                showDiff={showDiff}
                isFirst={idx === 0}
                refText={
                  showDiff && effectiveProject!.mode === 'FROM_REFERENCE' && effectiveProject!.referenceText
                    ? effectiveProject!.referenceText
                    : undefined
                }
              />
            ))}
          </div>

          {/* Кнопка экспорта снизу */}
          <div className="flex justify-center pb-6">
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 px-10 py-3 bg-[#22a139] hover:bg-[#1a8a30] text-white rounded-xl text-sm font-semibold transition-all"
            >
              <IcoExport /> Экспорт комплекта
            </button>
          </div>
        </>
      )}

      {effectiveProject!.status === 'READY' && effectiveProject!.variants.length === 0 && (
        <div className="text-center py-12 text-gray-400">Варианты не найдены</div>
      )}

      {/* Глобальный оверлей */}
      {busy && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-lg px-6 py-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-[#22a139] border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600">GigaChat обрабатывает запрос...</span>
          </div>
        </div>
      )}

      {/* Модал экспорта */}
      {exportOpen && (
        <ExportDialog
          projectId={projectId ?? 'tour-mock'}
          defaultName={effectiveProject!.title || 'Комплект'}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* Модал онлайн-формы */}
      {formOpen && (projectId || isTourMode) && (
        <FormExportDialog
          projectId={projectId ?? 'tour-mock'}
          onClose={() => setFormOpen(false)}
          tourMode={isTourMode}
        />
      )}

      {/* Модал правки всех вариантов */}
      {aiAllOpen && (
        <PromptModal
          title="Правка всех вариантов промптом"
          placeholder="Например: упростить формулировки, изменить тему задач..."
          onApply={prompt => aiEditAll.mutate(prompt)}
          onClose={() => setAiAllOpen(false)}
          busy={aiEditAll.isPending}
          costHint="Спишется примерно по 0.2–0.5% за каждое задание во всех вариантах"
        />
      )}

      {/* Панель истории версий с откатом */}
      {historyOpen && projectId && (
        <HistoryPanel
          projectId={projectId}
          onClose={() => setHistoryOpen(false)}
          onRestored={(p) => { queryClient.setQueryData(['project', projectId], p); refreshLimits(); }}
        />
      )}
    </main>
    </div>
  );
}
