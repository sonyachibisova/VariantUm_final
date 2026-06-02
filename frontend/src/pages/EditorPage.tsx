import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import { analyzeApi, type AnalysisResult, type SplitTask } from '../api/analyze.api';
import { filesApi } from '../api/files.api';
import { useDraftStore } from '../store/draftStore';
import { useTour } from '../context/TourContext';
import { buildTourFromPage } from '../tour/paths/choicePath';
import { TOUR_MOCK_TASK_TEXTS } from '../tour/tourMockData';
import { RichText } from '../components/RichText';
import { MathText } from '../components/MathText';
import { TaskEditorField } from '../components/TaskEditorField';
import { useAuthStore } from '../store/authStore';
import { useLimitsStore } from '../store/limitsStore';
import { LimitsBadge } from '../components/LimitsBadge';
import { authApi } from '../api/auth.api';
import type { Subject, TaskType, VariationType } from '../types/api';

const LP = "'Littera Plain', sans-serif";

// ── Константы ─────────────────────────────────────────────────────────────────

type VariationOption = { id: string; label: string; desc: string; checked: boolean };

const PRESETS: { id: string; title: string; desc: string; options: string[] }[] = [
  {
    id: 'standard',
    title: 'Стандарт',
    desc: 'Самый распространённый выбор — меняются числа и ситуация, структура сохраняется',
    options: ['numbers', 'context'],
  },
  {
    id: 'numbers_only',
    title: 'Только числа и имена',
    desc: 'Меняются только цифровые значения и имена, остальное остаётся как в оригинале',
    options: ['numbers', 'names'],
  },
  {
    id: 'full',
    title: 'Полная вариация',
    desc: 'Меняются числа, имена, контекст и формулировки — варианты максимально непохожи',
    options: ['numbers', 'names', 'context', 'order', 'synonyms'],
  },
];

const DEFAULT_VARIATION_OPTIONS: VariationOption[] = [
  { id: 'numbers', label: 'Числа и величины', desc: 'Расстояние, скорости, время — с проверкой корректности ответов', checked: true },
  { id: 'names', label: 'Имена и названия', desc: 'Название городов, имена участников', checked: false },
  { id: 'context', label: 'Контекст ситуации', desc: 'Велосипедист → поезда / пешеходы / лодки — структура сохраняется', checked: true },
  { id: 'order', label: 'Порядок условий', desc: 'Перестановка данных внутри условия — осторожно, влияет на восприятие сложности', checked: false },
  { id: 'synonyms', label: 'Синонимы формулировок', desc: 'Перефразировать ключевые части условия', checked: false },
];

const OPTION_TO_VARIATION: Record<string, VariationType> = {
  numbers: 'NUMBERS', names: 'NAMES', context: 'CONTEXT', order: 'ORDER', synonyms: 'LEXIS',
};

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика', physics: 'Физика', chemistry: 'Химия',
  biology: 'Биология', russian: 'Русский язык', literature: 'Литература',
  english: 'Английский', history: 'История', social_studies: 'Обществознание',
  geography: 'География', informatics: 'Информатика', other: 'Другое',
};

const KNOWN_SUBJECTS = new Set(Object.keys(SUBJECT_LABELS));

const TASK_TYPE_LABELS: Record<string, string> = {
  PROBLEM: 'Задачи', TEST: 'Тест', EXERCISE: 'Упражнения', OPEN_QUESTION: 'Открытый вопрос',
};
const KNOWN_TASK_TYPES = new Set(Object.keys(TASK_TYPE_LABELS));

function difficultyBadge(d?: number): { label: string; color: string } {
  if (!d || d <= 2) return { label: 'базовый', color: 'bg-[#22a139]' };
  if (d === 3) return { label: 'средний', color: 'bg-yellow-400' };
  return { label: 'сложный', color: 'bg-rose-400' };
}

// ── Тип задачи комплекта ──────────────────────────────────────────────────────

type KitTask = {
  id: number;
  fullText: string;
  answer?: string | null;
  variationOptions: VariationOption[];
  complexity: string;
};

/**
 * Убирает строки-метаданные с начала текста (шапка варианта/работы).
 * Типичные примеры: "К-10 В-1", "Вариант 2", "Тема. Обобщение...", "9 класс" и т.п.
 */
function stripHeader(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  // Шапочные строки: К-10 В-1, Вариант 2, Тема. ..., 9 класс, разделители ---
  const headerRe = new RegExp(
    '^(?:' +
    '[КкKk][-–—]\\d+\\s*[Вв][-–—]\\d+' +  // К-10 В-1
    '|(?:Вариант|Контрольная|Работа|Класс|Дата|ФИО|Ф\\.И\\.О\\.)\\s*[\\d.:]*' + // Вариант 1
    '|Тема\\.?\\s.{0,80}' +                                     // Тема. Обобщение...
    '|\\d{1,2}\\s*класс' +                                      // 9 класс
    '|[А-ЯЁ]{1,5}[-–—]\\d+' +                       // К-10, В-3
    '|[\\s—–=_-]{3,}' +                               // ---
    ')$',
    'i'
  );
  // Убираем заголовочные строки в начале (максимум первые 6 строк)
  while (start < Math.min(lines.length, 6)) {
    const trimmed = lines[start].trim();
    if (!trimmed || headerRe.test(trimmed)) {
      start++;
    } else {
      break;
    }
  }
  return lines.slice(start).join('\n').trim();
}

/**
 * Убирает строки с ответами/решениями в конце текста задачи.
 * Учитель нередко вставляет текст вместе с ответами — при генерации они не нужны.
 */
function stripAnswerLines(taskText: string): string {
  const lines = taskText.split('\n');
  const answerRe = /^[ \t]*(?:Ответ|Ответы|Решение|Решения|Правильный ответ)[:.)\s]/i;
  // Убираем строки-ответы С КОНЦА (не больше 5 строк, чтобы не съесть условие)
  let end = lines.length;
  let stripped = 0;
  while (end > 0 && stripped < 5) {
    const line = lines[end - 1].trim();
    if (!line || answerRe.test(line)) {
      end--;
      stripped++;
    } else {
      break;
    }
  }
  const result = lines.slice(0, end).join('\n').trim();
  return result.length > 10 ? result : taskText; // не трогаем, если удалили почти всё
}

/** Создаёт KitTask из текста и (опционально) ответа. */
function makeTask(id: number, fullText: string, answer?: string | null): KitTask {
  return {
    id,
    fullText,
    answer: answer && answer.trim() ? answer.trim() : null,
    variationOptions: DEFAULT_VARIATION_OPTIONS.map(o => ({ ...o })),
    complexity: 'Как есть',
  };
}

/** Превращает результат LLM-разбиения в список задач редактора. */
function tasksFromSplit(split: SplitTask[]): KitTask[] {
  return split
    .filter(t => t.text && t.text.trim())
    .map((t, i) => makeTask(i + 1, t.text.trim(), t.answer));
}

/**
 * Запасное разбиение БЕЗ нейросети (если LLM-разбиение недоступно).
 * Делит ТОЛЬКО по пустым строкам — этот способ не путает варианты ответа теста
 * (1) 2) 3) 4)) с отдельными заданиями. Если абзацев меньше двух — одно задание целиком.
 */
function fallbackSplit(referenceText: string): KitTask[] {
  const text = stripHeader(referenceText.trim());
  if (!text) return [];

  const paragraphs = text.split(/\n[ \t]*\n/).map(s => s.trim()).filter(s => s.length > 20);
  if (paragraphs.length >= 2) {
    return paragraphs.map((p, i) => makeTask(i + 1, stripAnswerLines(p)));
  }
  return [makeTask(1, stripAnswerLines(text))];
}

/**
 * Простая эвристика определения предмета и класса по ключевым словам текста.
 * Используется как резервный вариант, если LLM-анализ недоступен или вернул «other».
 */
function detectSubjectHeuristic(text: string): { subject: string; grade: number | null } {
  const t = text.toLowerCase();

  let subject = 'other';
  if (/тригоно|алгебр|геометр|прямоугол|уравнение|формул[аыу]|площадь|периметр|дробь|числа?|десятичн|целых|корень|квадрат|функци|график|парабол|вектор|логарифм|производн|интеграл|вероятност/.test(t)) {
    subject = 'math';
  } else if (/физик|сила|масса|ускорен|напряжен|электр|ток|тел[оа]|движение|импульс|энергия|теплот|кинетическ|потенциальн|мощность|работ[аы]/.test(t)) {
    subject = 'physics';
  } else if (/хими|молекул|атом|реакци|вещество|элемент|валентн|кислот|щелочь|реагент|ионн|оксид|соль/.test(t)) {
    subject = 'chemistry';
  } else if (/биолог|клетк|организм|растени[ея]|животн|вирус|бактери|генетик|экосистем|белок|фермент|фотосинтез/.test(t)) {
    subject = 'biology';
  } else if (/орфограф|пунктуаци|части речи|подлежащ|сказуемое|предложени[ея]|суффикс|приставк|существительн|прилагательн|глаго[лк]|наречи|местоимен/.test(t)) {
    subject = 'russian';
  } else if (/история|историч|война|государств|революци|царь|век\b|период|событи[ея]|СССР|российск/.test(t)) {
    subject = 'history';
  } else if (/информатик|программ|алгоритм|компьютер|данные|массив|переменн|цикл|условие|функци.*языке|код|python|pascal/.test(t)) {
    subject = 'informatics';
  } else if (/географи|климат|рельеф|карт[аы]|материк|страна|река|горы|океан|континент/.test(t)) {
    subject = 'geography';
  } else if (/обществозна|общество|право|гражданин|конституц|экономика|рынок|государственн|демократи/.test(t)) {
    subject = 'social_studies';
  } else if (/литератур|произведение|герой|автор|стихотворен|роман|повесть|рассказ|поэт|писател/.test(t)) {
    subject = 'literature';
  }

  // Определение класса: «9 класс», «9 кл.», «К-10», «В-3  10 кл», «(10 класс)»
  let grade: number | null = null;
  const gradeMatch = /(?:^|\s|\()(\d{1,2})\s*(?:класс|кл[\s.)])/.exec(text);
  if (gradeMatch) {
    const g = parseInt(gradeMatch[1], 10);
    if (g >= 1 && g <= 11) grade = g;
  }
  if (!grade) {
    // Паттерн типа «К-10» или «В-9»
    const headerMatch = /[КкKk][-–—](\d{1,2})/.exec(text);
    if (headerMatch) {
      const g = parseInt(headerMatch[1], 10);
      if (g >= 1 && g <= 11) grade = g;
    }
  }

  return { subject, grade };
}

/**
 * Подготавливает текст для однострочного превью: убирает блочные формулы ($$...$$),
 * сворачивает переносы строк в пробелы, обрезает до лимита без разрыва инлайн-формул.
 */
function makePreviewText(text: string, rawLimit = 300): string {
  const cleaned = text.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= rawLimit) return cleaned;
  let inFormula = false;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '$') inFormula = !inFormula;
    if (!inFormula && i >= rawLimit) return cleaned.slice(0, i).trimEnd() + '…';
  }
  return cleaned.slice(0, rawLimit).trimEnd() + '…';
}

/**
 * Эвристика определения типа задания по тексту.
 * Используется как резервный вариант, если LLM-анализ недоступен или вернул неверный результат.
 */
function detectTaskTypeHeuristic(text: string): string {
  const t = text.toLowerCase();
  const markers = (t.match(/(?:^|\n)\s*[а-гa-d]\)\s/gim) ?? []).length;
  if (markers >= 3) return 'TEST';
  if (/(?:^|\n)(?:объясн|опиш|охарактериз|дайте?\s+определение|что\s+такое|почему|как\s+вы\s+думаете)/im.test(t)) return 'OPEN_QUESTION';
  if (/^(?:решите?|найдите?|вычислите?|упростите?|раскройте?\s+скобки|разложите?\s+на\s+множители|выполните?)\s+\S/im.test(t.trim())) return 'EXERCISE';
  return 'PROBLEM';
}

/** Обрезает тему до 1-2 коротких слов для плашки. */
function shortenTopic(topic: string): string {
  const words = topic.trim().split(/\s+/);
  // Берём первые слова суммарной длиной ≤ 15 символов
  let result = '';
  for (const w of words) {
    const next = result ? result + ' ' + w : w;
    if (next.length > 15) break;
    result = next;
  }
  return result || words[0]?.slice(0, 15) || topic;
}

// ── Иконки ─────────────────────────────────────────────────────────────────────

function IcoChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IcoBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IcoSparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <polyline points="2 5 4 7 8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

function IcoPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function IcoShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
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

// Хелперы аватара
const AVATAR_COLORS = ['#21a038', '#0b8acb', '#30b0ba', '#95c949'];
function avatarBg(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function getInitial(fullName: string) {
  return fullName?.trim()?.[0]?.toUpperCase() ?? '?';
}

// ── Общие подкомпоненты ──────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[#0b8acb]' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

function CheckboxOption({ option, onToggle, isLast }: { option: VariationOption; onToggle: (id: string) => void; isLast: boolean }) {
  return (
    <label
      className={`flex items-start gap-3 py-3 cursor-pointer hover:bg-gray-50 px-2 -mx-2 rounded-xl transition-colors ${!isLast ? 'border-b border-gray-100' : ''}`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <input type="checkbox" checked={option.checked} onChange={() => onToggle(option.id)} className="sr-only" />
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${option.checked ? 'bg-[#0b8acb] border-[#0b8acb]' : 'bg-white border-gray-300'}`}>
          {option.checked && <IcoCheck />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{option.label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{option.desc}</p>
      </div>
    </label>
  );
}

// ── Предпросмотр исходных файлов ─────────────────────────────────────────────

function fileIsImage(file: File) {
  return file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
}
function fileIsPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function SourceFilesPreview({ files }: { files: File[] }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map(f => URL.createObjectURL(f));
    setUrls(created);
    return () => { created.forEach(u => URL.revokeObjectURL(u)); };
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!files.length) return null;

  const title = files.length === 1
    ? `Исходный файл — ${files[0].name}`
    : `Исходные файлы (${files.length})`;

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400 flex-shrink-0"><IcoFile /></span>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{title}</span>
        <span className="text-gray-400 ml-2"><IcoChevron open={open} /></span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '1400px' : '0px' }}
      >
        <div className="border-t border-gray-100 px-5 py-4 flex flex-col gap-4">
          {files.map((file, i) => {
            const url = urls[i];
            if (!url) return null;
            return (
              <div key={i}>
                {files.length > 1 && (
                  <p className="text-xs text-gray-500 mb-2 font-medium">{file.name}</p>
                )}
                {fileIsImage(file) ? (
                  <img
                    src={url}
                    alt={file.name}
                    className="max-w-full rounded-xl border border-gray-200 object-contain"
                    style={{ maxHeight: '600px' }}
                  />
                ) : fileIsPdf(file) ? (
                  <embed
                    src={url}
                    type="application/pdf"
                    className="w-full rounded-xl border border-gray-200"
                    style={{ height: '600px' }}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                    <IcoFile />
                    <span className="truncate">{file.name}</span>
                    <span className="text-gray-400 flex-shrink-0">— предпросмотр недоступен</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Строка задачи ───────────────────────────────────────────────────────────────

function TaskRow({
  task, index, tag, difficulty, isOpen, onToggle, onDelete, onChangeText, tourTarget,
}: {
  task: KitTask; index: number; tag: string | null; difficulty?: number;
  isOpen: boolean; onToggle: () => void; onDelete: (id: number) => void; onChangeText: (id: number, text: string) => void;
  tourTarget?: boolean;
}) {
  const [complexity, setComplexity] = useState(task.complexity);
  const [variationOptions, setVariationOptions] = useState(task.variationOptions);
  const [isEditing, setIsEditing] = useState(false);
  const [preEditText, setPreEditText] = useState('');

  function toggleVariation(optId: string) {
    setVariationOptions(prev => prev.map(o => o.id === optId ? { ...o, checked: !o.checked } : o));
  }

  const previewText = makePreviewText(task.fullText);
  const diff = difficultyBadge(difficulty);

  return (
    <div className={`border rounded-2xl overflow-hidden transition-shadow ${isOpen ? 'border-gray-300 shadow-sm' : 'border-gray-200'}`}>
      {/* Свёрнутая строка */}
      <button
        data-tour={tourTarget ? 'editor-first-task' : undefined}
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-sm font-semibold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <span className="flex-1 text-sm text-gray-700 min-w-0 overflow-hidden" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          <MathText style={{ whiteSpace: 'nowrap' }}>{previewText}</MathText>
        </span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {tag && (
            <span className="px-3 py-1 rounded-full text-white text-xs font-semibold bg-[#30b0ba] max-w-[140px] truncate">
              {tag}
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-white text-xs font-semibold ${diff.color}`}>
            {diff.label}
          </span>
          <span className="text-gray-400 ml-1"><IcoChevron open={isOpen} /></span>
        </div>
      </button>

      {/* Развёрнутое содержимое */}
      {isOpen && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {/* Редактируемый полный текст */}
          <div className="mt-4 mb-4">
            {isEditing ? (
              <TaskEditorField
                text={preEditText}
                onSave={val => { onChangeText(task.id, val); setIsEditing(false); }}
                onCancel={() => { onChangeText(task.id, preEditText); setIsEditing(false); }}
                onChange={val => onChangeText(task.id, val)}
              />
            ) : (
              <div
                onClick={() => { setPreEditText(task.fullText); setIsEditing(true); }}
                className="relative border border-gray-200 hover:border-gray-300 rounded-xl cursor-text transition-all"
              >
                <span className="absolute top-3 right-3 text-gray-300 pointer-events-none">
                  <IcoPencil />
                </span>
                <div className="text-sm text-gray-700 leading-relaxed px-4 py-3 pr-9 min-h-[72px]">
                  <RichText>{task.fullText}</RichText>
                </div>
              </div>
            )}
          </div>

          {/* Ответ из исходника (если был распознан) */}
          {task.answer && (
            <div className="mb-4 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5 flex-shrink-0">Ответ</span>
              <div className="text-sm text-gray-600 leading-relaxed min-w-0">
                <RichText>{task.answer}</RichText>
              </div>
            </div>
          )}

          {/* Что менять в вариантах */}
          <div className="mb-4" data-tour={tourTarget ? 'editor-task-variation-options' : undefined}>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Что менять в вариантах
            </p>
            <p className="text-xs text-gray-400 mb-2">Скорректируйте галочки при необходимости</p>
            <div className="flex flex-col">
              {variationOptions.map((opt, idx) => (
                <CheckboxOption
                  key={opt.id}
                  option={opt}
                  onToggle={toggleVariation}
                  isLast={idx === variationOptions.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Сложность */}
          <div className="mb-5" data-tour={tourTarget ? 'editor-task-complexity' : undefined}>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
              Сложность
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'Упростить', prefix: '↓', desc: 'Целые числа, меньше шагов, округлённые ответы' },
                { key: 'Как есть', prefix: '·', desc: 'Задача без изменений, как сгенерировано' },
                { key: 'Усложнить', prefix: '↑', desc: 'Дроби, нецелые данные, дополнительное условие' },
              ].map(({ key, prefix, desc }) => (
                <button
                  key={key}
                  onClick={() => setComplexity(key)}
                  className={`py-3 px-3 rounded-xl border text-left transition-all ${
                    complexity === key
                      ? 'bg-[#0b8acb] border-[#0b8acb] text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <p className="text-xs font-semibold mb-1">{prefix} {key}</p>
                  <p className={`text-[10px] leading-snug ${complexity === key ? 'text-white/75' : 'text-gray-400'}`}>
                    {desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Действия */}
          <div className="flex gap-3">
            <button
              onClick={() => onDelete(task.id)}
              className="flex items-center gap-2 px-4 py-2.5 border border-red-200 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 hover:border-red-300 transition-all"
            >
              <IcoTrash /> Удалить задачу
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Страница ──────────────────────────────────────────────────────────────────────

export function EditorPage() {
  const navigate = useNavigate();
  const referenceDraft = useDraftStore(s => s.referenceDraft);
  const setReferenceDraft = useDraftStore(s => s.setReferenceDraft);
  const { currentStep, steps, tourActive, startTour } = useTour();
  const { user, clear } = useAuthStore();
  const refreshLimits = useLimitsStore(s => s.refresh);
  const estimateGeneration = useLimitsStore(s => s.estimateGeneration);

  // Мобильная шапка
  const [isMobile, setIsMobile] = useState(() => (window.visualViewport?.width ?? window.innerWidth) < 768);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [tasks, setTasks] = useState<KitTask[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [taskTypeOverride, setTaskTypeOverride] = useState<string | null>(null);

  // Разбиение текста на задания силами GigaChat (надёжнее регулярок)
  const [splitting, setSplitting] = useState(true);

  // Авто-анализ задания (предмет, класс, тип, сложность)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(true);

  // Глобальные настройки вариации
  const [finetuneOpen, setFinetuneOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>('standard');
  const [variationOptions, setVariationOptions] = useState(DEFAULT_VARIATION_OPTIONS.map(o => ({ ...o })));
  const [globalComplexity, setGlobalComplexity] = useState('Как есть');
  const [checkDuplicates, setCheckDuplicates] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reparsingFiles, setReparsingFiles] = useState(false);

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
    const { steps: tourSteps, phaseIndex, startStep } = buildTourFromPage('editor');
    startTour('editor', tourSteps, phaseIndex, startStep);
  }

  // Нет черновика (прямой переход) — возвращаем на загрузку, но не во время тура
  useEffect(() => {
    if (!referenceDraft && !tourActive) navigate('/upload', { replace: true });
  }, [referenceDraft, tourActive, navigate]);

  // Во время тура без черновика — показываем мок-задачи, пропускаем API
  useEffect(() => {
    if (!tourActive || referenceDraft || tasks.length > 0) return;
    setTasks(TOUR_MOCK_TASK_TEXTS.map(t => makeTask(t.id, t.fullText, t.answer)));
    setSplitting(false);
    setAnalyzing(false);
  }, [tourActive, referenceDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Разбиение текста на отдельные задания через GigaChat (при входе)
  useEffect(() => {
    if (!referenceDraft) return;
    let cancelled = false;
    setSplitting(true);
    analyzeApi.split(referenceDraft.referenceText)
      .then(split => {
        if (cancelled) return;
        const result = tasksFromSplit(split);
        setTasks(result.length > 0 ? result : fallbackSplit(referenceDraft.referenceText));
      })
      .catch(() => {
        // LLM-разбиение недоступно — используем запасное разбиение по абзацам
        if (!cancelled) setTasks(fallbackSplit(referenceDraft.referenceText));
      })
      .finally(() => { if (!cancelled) setSplitting(false); });
    return () => { cancelled = true; };
  }, [referenceDraft]);

  // Запуск анализа при входе
  useEffect(() => {
    if (!referenceDraft) return;
    let cancelled = false;
    setAnalyzing(true);
    analyzeApi.task(referenceDraft.referenceText)
      .then(res => {
        if (cancelled) return;
        // Если LLM вернул «other» или не определил класс — дополняем эвристикой
        const needSubjectFallback = !res.subject || res.subject === 'other';
        const needGradeFallback = !res.grade || res.grade < 1 || res.grade > 11;
        if (needSubjectFallback || needGradeFallback) {
          const hint = detectSubjectHeuristic(referenceDraft.referenceText);
          setAnalysis({
            ...res,
            subject: needSubjectFallback ? hint.subject : res.subject,
            grade: needGradeFallback && hint.grade ? hint.grade : res.grade,
          });
        } else {
          setAnalysis(res);
        }
      })
      .catch(() => {
        // LLM-анализ недоступен — используем эвристику по ключевым словам
        if (!cancelled) {
          const hint = detectSubjectHeuristic(referenceDraft.referenceText);
          const typeHint = detectTaskTypeHeuristic(referenceDraft.referenceText);
          setAnalysis({
            subject: hint.subject,
            grade: hint.grade ?? 9,
            topic: '',
            taskType: typeHint as import('../types/api').TaskType,
            difficulty: 3,
          });
        }
      })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
  }, [referenceDraft]);

  // Авто-открываем первую задачу, когда тур переходит к её внутренним шагам
  useEffect(() => {
    if (!tourActive || !steps[currentStep]) return;
    const sid = steps[currentStep].tourId;
    if (sid === 'editor-task-variation-options' || sid === 'editor-task-complexity') {
      setOpenId(prev => (prev === tasks[0]?.id ? prev : tasks[0]?.id ?? null));
    }
  }, [currentStep, tourActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTask(id: number) {
    setOpenId(prev => (prev === id ? null : id));
  }

  function deleteTask(id: number) {
    setTasks(prev => prev.filter(t => t.id !== id));
    setOpenId(null);
  }

  function changeTaskText(id: number, text: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, fullText: text } : t));
  }

  /** Переразбивает все текущие задания по пустым строкам — кнопка для ручного использования. */
  function resplitByParagraphs() {
    const combined = tasks.map(t => t.fullText.trim()).join('\n\n');
    const parts = combined.split(/\n[ \t]*\n/).map(s => s.trim()).filter(s => s.length > 20);
    if (parts.length >= 2) {
      setTasks(parts.map((p, i) => makeTask(i + 1, stripAnswerLines(p))));
      setOpenId(null);
    }
  }

  /** Заново загружает исходные файлы на сервер (повторное OCR/Vision) и разбивает на задания. */
  async function reparseSourceFiles() {
    if (!referenceDraft?.sourceFiles?.length || reparsingFiles) return;
    setReparsingFiles(true);
    setOpenId(null);
    try {
      const parts: string[] = [];
      for (const file of referenceDraft.sourceFiles) {
        const result = await filesApi.upload(file);
        if (result.extractedText?.trim()) parts.push(result.extractedText.trim());
      }
      const newText = parts.join('\n\n').trim();
      if (!newText) return;
      setReferenceDraft({ ...referenceDraft, referenceText: newText });
      setSplitting(true);
      try {
        const split = await analyzeApi.split(newText);
        const result = tasksFromSplit(split);
        setTasks(result.length > 0 ? result : fallbackSplit(newText));
      } catch {
        setTasks(fallbackSplit(newText));
      } finally {
        setSplitting(false);
      }
    } catch {
      setErrorMsg('Не удалось повторно распознать файл. Попробуйте ещё раз или разбейте задания вручную.');
    } finally {
      setReparsingFiles(false);
    }
  }

  function applyPreset(presetId: string) {
    setActivePreset(presetId);
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setVariationOptions(prev => prev.map(opt => ({ ...opt, checked: preset.options.includes(opt.id) })));
  }

  function toggleGlobalOption(optId: string) {
    setVariationOptions(prev => prev.map(o => o.id === optId ? { ...o, checked: !o.checked } : o));
    setActivePreset(null);
  }

  const checkedCount = variationOptions.filter(o => o.checked).length;

  function handleSetVariantCount(v: number) {
    if (!referenceDraft) return;
    setReferenceDraft({ ...referenceDraft, variantCount: v });
  }

  // Производные значения анализа (с безопасными фолбэками)
  const subjectCode = analysis && KNOWN_SUBJECTS.has(analysis.subject) ? analysis.subject : 'other';
  const subjectLabel = SUBJECT_LABELS[subjectCode];
  const grade = analysis && analysis.grade >= 1 && analysis.grade <= 11 ? analysis.grade : null;
  const taskTypeCode = analysis && KNOWN_TASK_TYPES.has(analysis.taskType) ? analysis.taskType : 'PROBLEM';
  const effectiveTaskType = taskTypeOverride ?? taskTypeCode;
  const topicFull = analysis?.topic && analysis.topic.trim() ? analysis.topic.trim() : null;
  const topicTag = topicFull ? shortenTopic(topicFull) : null;

  const generate = useMutation({
    mutationFn: () => {
      if (tourActive) return Promise.resolve(null as unknown as Awaited<ReturnType<typeof projectsApi.create>>);
      const referenceText = tasks.map(t => t.fullText.trim()).filter(Boolean).join('\n\n');
      const variationTypes = variationOptions.filter(o => o.checked).map(o => OPTION_TO_VARIATION[o.id]);
      return projectsApi.create({
        mode: 'FROM_REFERENCE',
        referenceText,
        analysis: {
          subject: subjectCode as Subject,
          grade: grade ?? 9,
          topic: analysis?.topic ?? '',
          taskType: effectiveTaskType as TaskType,
          difficulty: analysis?.difficulty && analysis.difficulty >= 1 && analysis.difficulty <= 5 ? analysis.difficulty : 3,
        },
        params: {
          variantsCount: referenceDraft?.variantCount ?? 4,
          variationTypes: variationTypes.length > 0 ? variationTypes : ['NUMBERS'],
          difficultyGradation: 'EQUAL',
        },
      });
    },
    onSuccess: (project) => navigate(tourActive || !project ? '/compare' : `/projects/${project.projectId}`),
    onError: () => setErrorMsg('Не удалось сгенерировать варианты. Попробуйте позже.'),
    onSettled: () => refreshLimits(),
  });

  const genVariantCount = referenceDraft?.variantCount ?? 4;
  const genEstimate = estimateGeneration(genVariantCount, Math.max(1, tasks.length));


  if (!referenceDraft && !tourActive) return null;

  const taskWord = tasks.length === 1 ? 'задание' : (tasks.length >= 2 && tasks.length <= 4 ? 'задания' : 'заданий');

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

    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8" style={{ paddingTop: isMobile ? '76px' : undefined }}>
      <button
        onClick={() => navigate('/upload')}
        className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm mb-6 transition-colors"
      >
        <IcoBack /> Назад к загрузке
      </button>

      <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-1">Редактор комплекта</h1>
      <p className="text-gray-500 text-sm sm:text-base mb-6">Проверьте комплект заданий</p>

      {/* Статистика (с авто-анализом) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          <p className="text-sm sm:text-2xl font-bold text-gray-800 truncate">{splitting ? '…' : `${tasks.length} ${taskWord}`}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">в комплекте</p>
        </div>
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          <p className="text-sm sm:text-2xl font-bold text-gray-800 truncate">{analyzing ? '…' : subjectLabel}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{grade ? `${grade} класс` : 'класс не указан'}</p>
        </div>
        <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4">
          {analyzing ? (
            <p className="text-sm sm:text-2xl font-bold text-gray-800">…</p>
          ) : (
            <select
              value={effectiveTaskType}
              onChange={e => setTaskTypeOverride(e.target.value)}
              className="text-sm sm:text-2xl font-bold text-gray-800 bg-transparent border-none outline-none w-full cursor-pointer appearance-none"
              title="Нажмите чтобы изменить тип заданий"
            >
              {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">тип заданий</p>
        </div>
      </div>

      {/* Ошибка */}
      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Идёт разбиение текста на задания */}
      {splitting && (
        <div className="mb-4 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4">
          <span className="w-4 h-4 border-2 border-gray-300 border-t-[#0b8acb] rounded-full animate-spin" />
          <p className="text-sm text-gray-500">GigaChat разбивает текст на отдельные задания…</p>
        </div>
      )}

      {/* Подсказка: одно задание — предлагаем разбить вручную */}
      {!splitting && tasks.length === 1 && tasks[0].fullText.includes('\n\n') && (
        <div className="mb-3 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-500 text-base">⚠️</span>
          <p className="text-sm text-amber-700 flex-1">
            Похоже, в тексте несколько заданий. Если разбивка не сработала автоматически — попробуйте разбить по пустым строкам.
          </p>
          <button
            onClick={resplitByParagraphs}
            className="flex-shrink-0 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors"
          >
            Разбить по абзацам
          </button>
        </div>
      )}

      {/* Исходный файл — сворачиваемый предпросмотр */}
      {referenceDraft?.sourceFiles && referenceDraft.sourceFiles.length > 0 && (
        <SourceFilesPreview files={referenceDraft.sourceFiles} />
      )}

      {/* Кнопка повторного распознавания — показываем когда задания загружены и есть исходный файл */}
      {!splitting && tasks.length > 0 && referenceDraft?.sourceFiles && referenceDraft.sourceFiles.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">Разбиение неверное?</span>
          <button
            onClick={reparseSourceFiles}
            disabled={reparsingFiles}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-60"
            title="Заново запустить распознавание текста из загруженного файла (OCR / GigaChat Vision)"
          >
            {reparsingFiles ? (
              <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
              </svg>
            )}
            {reparsingFiles ? 'Читаю файл...' : 'Распознать файл заново'}
          </button>
        </div>
      )}

      {/* Список задач */}
      <div className="flex flex-col gap-3 mb-4">
        {tasks.map((task, idx) => (
          <TaskRow
            key={task.id}
            task={task}
            index={idx}
            tag={topicTag}
            difficulty={analysis?.difficulty}
            isOpen={openId === task.id}
            onToggle={() => toggleTask(task.id)}
            onDelete={deleteTask}
            onChangeText={changeTaskText}
            tourTarget={idx === 0}
          />
        ))}
      </div>

      {/* ── Глобальные параметры комплекта ─────────────────────────── */}
      <div data-tour="editor-global-settings">

      {/* ── Что менять в вариантах ───────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden mb-4">
        <div className="px-5 pt-4 pb-5">
          <p className="text-sm font-semibold text-gray-700 mb-0.5">Что менять в вариантах</p>
          <p className="text-xs text-gray-400 mb-4">Выберите готовый вариант или настройте вручную</p>

          {/* Пресеты */}
          <div data-tour="editor-presets" className="flex flex-col sm:flex-row gap-3 mb-4">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`flex-1 text-left px-4 py-3.5 rounded-xl border transition-all ${
                  activePreset === preset.id
                    ? 'bg-white border-[#0b8acb] shadow-sm ring-2 ring-[#0b8acb]/15'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-white'
                }`}
              >
                <p className={`text-sm font-semibold mb-1 ${activePreset === preset.id ? 'text-gray-800' : 'text-gray-600'}`}>
                  {preset.title}
                </p>
                <p className="text-xs text-gray-400 leading-snug">{preset.desc}</p>
              </button>
            ))}
          </div>

          {/* Тонкая настройка */}
          <button
            onClick={() => setFinetuneOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            <IcoChevron open={finetuneOpen} />
            Тонкая настройка
          </button>

          <div
            data-tour="editor-task-options"
            style={{
              maxHeight: finetuneOpen ? '600px' : '0',
              overflow: 'hidden',
              transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-3">Скорректируйте галочки при необходимости</p>
              <div className="flex flex-col">
                {variationOptions.map((opt, idx) => (
                  <CheckboxOption
                    key={opt.id}
                    option={opt}
                    onToggle={toggleGlobalOption}
                    isLast={idx === variationOptions.length - 1}
                  />
                ))}
              </div>
              {checkedCount === 0 && (
                <p className="text-xs text-red-400 mt-2">
                  Выберите хотя бы один тип изменений для генерации вариантов
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Сложность варианта ───────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden mb-4">
        <div className="px-5 pt-4 pb-5">
          <p className="text-sm font-semibold text-gray-700 mb-0.5">Сложность варианта</p>
          <p className="text-xs text-gray-400 mb-4">Применится ко всем заданиям комплекта</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: 'Упростить', prefix: '↓', desc: 'Целые числа, меньше шагов, округлённые ответы' },
              { key: 'Как есть', prefix: '·', desc: 'Задачи без изменений, как сгенерировано' },
              { key: 'Усложнить', prefix: '↑', desc: 'Дроби, нецелые данные, дополнительное условие' },
            ].map(({ key, prefix, desc }) => (
              <button
                key={key}
                onClick={() => setGlobalComplexity(key)}
                className={`py-3 px-3 rounded-xl border text-left transition-all ${
                  globalComplexity === key
                    ? 'bg-[#0b8acb] border-[#0b8acb] text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <p className="text-xs font-semibold mb-1">{prefix} {key}</p>
                <p className={`text-[10px] leading-snug ${globalComplexity === key ? 'text-white/75' : 'text-gray-400'}`}>
                  {desc}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Проверять совпадение ответов ─────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <span className="text-gray-400 mt-0.5 flex-shrink-0"><IcoShield /></span>
              <div>
                <p className="text-sm font-semibold text-gray-700">Проверять совпадение ответов</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Перегенерировать вариант, если его ответ совпадает с другим
                </p>
              </div>
            </div>
            <Toggle checked={checkDuplicates} onChange={setCheckDuplicates} />
          </div>
        </div>
      </div>

      {/* ── Количество вариантов ─────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-5 pt-4 pb-5">
          <p className="text-sm font-semibold text-gray-700 mb-0.5">Количество вариантов</p>
          <p className="text-xs text-gray-400 mb-4">Сколько вариантов сгенерировать для комплекта</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSetVariantCount(Math.max(2, genVariantCount - 1))}
                disabled={genVariantCount <= 2}
                className="w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-600 font-bold text-lg flex items-center justify-center hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >−</button>
              <span className="text-2xl font-bold text-gray-800 w-8 text-center">{genVariantCount}</span>
              <button
                onClick={() => handleSetVariantCount(Math.min(10, genVariantCount + 1))}
                disabled={genVariantCount >= 10}
                className="w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-600 font-bold text-lg flex items-center justify-center hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >+</button>
            </div>
            <p className="text-xs text-gray-400">от 2 до 10</p>
          </div>
        </div>
      </div>

      </div>{/* end editor-global-settings */}

      {/* Футер */}
      <div className="flex gap-3">
        <button
          data-tour="editor-generate-btn"
          onClick={() => generate.mutate()}
          disabled={checkedCount === 0 || tasks.length === 0 || generate.isPending}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#22a139] hover:bg-[#1a8a30] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors"
        >
          <IcoSparkle />
          {generate.isPending ? 'Генерирую...' : 'Сгенерировать варианты'}
        </button>
      </div>
      {!generate.isPending && tasks.length > 0 && (
        <p className="text-center text-xs text-gray-400 mt-3">
          💡 Спишется ≈{Math.round(genEstimate * 10) / 10}% от дневного лимита
          ({tasks.length} {tasks.length === 1 ? 'задание' : 'заданий'} × {genVariantCount} вар.)
        </p>
      )}
      {generate.isPending && (
        <div className="flex flex-col items-center gap-2 mt-3">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce" />
          </div>
          <p className="text-sm text-gray-400">
            GigaChat генерирует варианты — это займёт 10–30 секунд...
          </p>
        </div>
      )}
    </main>
    </div>
  );
}
