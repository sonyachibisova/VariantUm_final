import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/projects.api';
import { filesApi } from '../api/files.api';
import { useDraftStore } from '../store/draftStore';
import { useAuthStore } from '../store/authStore';
import { useLimitsStore } from '../store/limitsStore';
import { LimitsBadge } from '../components/LimitsBadge';
import { authApi } from '../api/auth.api';
import { useTour } from '../context/TourContext';
import { buildTourFromPage } from '../tour/paths/choicePath';
import { TOUR_MOCK_REFERENCE_TEXT } from '../tour/tourMockData';

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

const ACCEPT = '.pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,.heic';
const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']);
const MAX_FILES = 3;
const MAX_TEXT_LENGTH = 3000;

const LP = "'Littera Plain', sans-serif";

function isImageFile(file: File) {
  if (IMAGE_MIMES.has(file.type)) return true;
  return /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name);
}

const TOUR_PANEL_IDS = new Set([
  'upload-variant-count', 'upload-quick-buttons',
  'upload-generate-btn', 'upload-settings-link',
]);

const MOCK_TEXT = 'Задача 1. Решите уравнение: 2x + 5 = 15\nЗадача 2. Найдите значение выражения: 3a² − 2a + 1 при a = 4';

type Attachment = {
  type: 'image' | 'file';
  name: string;
  size: number;
  file: File;
  preview?: string;
};

// ── Хелперы аватара ──────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#21a038', '#0b8acb', '#30b0ba', '#95c949'];
function avatarBg(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function getInitial(fullName: string) {
  return fullName?.trim()?.[0]?.toUpperCase() ?? '?';
}

// ── Иконки мобильной шапки ───────────────────────────────────────────────────
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

// ── Иконки ─────────────────────────────────────────────────────────────────────

function IcoPaperclip() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IcoUploadLarge() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function IcoFileCard() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
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

function IcoCheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="7 12 10.5 15.5 17 9" />
    </svg>
  );
}

function IcoSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  );
}

function IcoSparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ── Чипы вложений ───────────────────────────────────────────────────────────────

function ImageChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  return (
    <div className="relative group flex-shrink-0" style={{ width: 72 }}>
      <div className="w-full h-16 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
        <img src={att.preview} alt={att.name} className="w-full h-full object-cover" />
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] text-center py-0.5 rounded-b-xl font-medium tracking-wide">
        OCR
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-900"
      >
        ×
      </button>
      <p className="text-[10px] text-gray-400 truncate mt-1 text-center">{att.name}</p>
    </div>
  );
}

function FileChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 max-w-[220px] group">
      <IcoFileCard />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{att.name}</p>
        <p className="text-[10px] text-gray-400">{formatSize(att.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="text-gray-300 hover:text-gray-600 flex-shrink-0 text-base leading-none transition-colors ml-1"
      >
        ×
      </button>
    </div>
  );
}

// ── Панель быстрого запуска ──────────────────────────────────────────────────────

const QUICK_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const MIN_VARIANTS = 2;
const MAX_VARIANTS = 10;

function pluralVariants(n: number) {
  if (n === 1) return 'вариант';
  if (n < 5) return 'варианта';
  return 'вариантов';
}

function QuickLaunchPanel({
  variantCount, setVariantCount, onGenerate, onViewEditor, busy, costHint,
}: {
  variantCount: number;
  setVariantCount: (fn: number | ((v: number) => number)) => void;
  onGenerate: () => void;
  onViewEditor: () => void;
  busy: boolean;
  costHint?: string;
}) {
  return (
    <div data-tour="upload-variant-count" className="mt-6 rounded-2xl border border-[#22a139]/30 bg-[#f0fdf4]">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#22a139]/20 text-[#22a139] rounded-t-2xl overflow-hidden">
        <IcoCheckCircle />
        <span className="text-sm font-semibold">Задание готово к генерации</span>
      </div>

      <div className="px-5 py-4">
        <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Сколько вариантов создать?</p>

        {/* Строка 1: счётчик − / число / + */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setVariantCount(v => Math.max(MIN_VARIANTS, v - 1))}
            disabled={variantCount <= MIN_VARIANTS}
            className="w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-600 font-bold text-lg flex items-center justify-center hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span className="text-2xl font-bold text-gray-800 w-8 text-center">{variantCount}</span>
          <button
            onClick={() => setVariantCount(v => Math.min(MAX_VARIANTS, v + 1))}
            disabled={variantCount >= MAX_VARIANTS}
            className="w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-600 font-bold text-lg flex items-center justify-center hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>

        {/* Строка 2: текст "от 2 до 10" */}
        <div className="-mt-1 mb-2">
          <span className="text-xs text-gray-400">от 2 до 10</span>
        </div>

        {/* Строка 3: быстрые кубики 2–10 */}
        <div data-tour="upload-quick-buttons" className="flex items-center gap-1.5 mb-4">
          {QUICK_COUNTS.map(v => (
            <button
              key={v}
              onClick={() => setVariantCount(v)}
              style={{ fontFamily: LP, fontWeight: 700, fontSize: '14px' }}
              className={`w-9 h-9 rounded-xl border transition-all ${
                variantCount === v
                  ? 'bg-[#22a139] text-white border-[#22a139]'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            data-tour="upload-generate-btn"
            onClick={onGenerate}
            disabled={busy}
            style={{ fontFamily: LP, fontWeight: 700, fontSize: '14px' }}
            className="flex items-center gap-2 px-6 py-3 bg-[#22a139] hover:bg-[#1a8a30] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            <IcoSparkle />
            {busy ? 'Обрабатываю...' : `Сгенерировать ${variantCount} ${pluralVariants(variantCount)}`}
          </button>

          <button
            data-tour="upload-settings-link"
            onClick={onViewEditor}
            disabled={busy}
            style={{ fontFamily: LP, fontWeight: 400, fontSize: '13px', color: '#6b7280' }}
            className="flex items-center gap-1.5 hover:text-[#0b8acb] transition-colors disabled:opacity-60"
          >
            <IcoSettings />
            Просмотр и настройки
          </button>
        </div>

        {costHint && (
          <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
            💡 {costHint}
          </p>
        )}
        {busy && (
          <div className="flex flex-col items-center gap-2 mt-3">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-[#0b8acb] rounded-full animate-bounce" />
            </div>
            <p className="text-center text-sm text-gray-400">
              GigaChat генерирует варианты — это займёт 10–30 секунд...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Страница ──────────────────────────────────────────────────────────────────────

export function FromReferencePage() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [variantCount, setVariantCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (window.visualViewport?.width ?? window.innerWidth) < 768);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setReferenceDraft = useDraftStore(s => s.setReferenceDraft);
  const { user, clear } = useAuthStore();
  const refreshLimits = useLimitsStore(s => s.refresh);
  const estimateParse = useLimitsStore(s => s.estimateParse);
  const { tourActive, steps, currentStep, startTour } = useTour();

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
    const { steps: tourSteps, phaseIndex, startStep } = buildTourFromPage('upload');
    startTour('upload', tourSteps, phaseIndex, startStep);
  }

  useEffect(() => {
    if (!tourActive || !steps.length) return;
    const step = steps[currentStep];
    if (!step || !TOUR_PANEL_IDS.has(step.tourId ?? '')) return;
    setText(prev => prev.trim() ? prev : MOCK_TEXT);
  }, [tourActive, steps, currentStep]);

  function processFiles(files: File[]) {
    setAttachments(prev => {
      const slots = MAX_FILES - prev.length;
      if (slots <= 0) return prev;
      const allowed = files.slice(0, slots);
      const next: Attachment[] = allowed.map(file => {
        if (isImageFile(file)) {
          return { type: 'image', name: file.name, size: file.size, file, preview: URL.createObjectURL(file) };
        }
        return { type: 'file', name: file.name, size: file.size, file };
      });
      return [...prev, ...next];
    });
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  }

  function removeAttachment(i: number) {
    setAttachments(prev => {
      const att = prev[i];
      if (att.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  const canProceed = text.trim().length > 0 || attachments.length > 0;
  const tourNeedsPanel = tourActive && !!steps[currentStep] && TOUR_PANEL_IDS.has(steps[currentStep]?.tourId ?? '');

  /**
   * Собирает итоговый текст эталона: введённый текст + извлечённый из КАЖДОГО файла/фото.
   * Файлы обрабатываются по очереди; сбой одного файла не прерывает остальные.
   */
  async function buildReferenceText(): Promise<{ text: string; failed: string[] }> {
    const parts: string[] = [];
    const failed: string[] = [];
    if (text.trim()) parts.push(text.trim());
    for (const att of attachments) {
      try {
        const result = await filesApi.upload(att.file);
        if (result.extractedText?.trim()) {
          parts.push(result.extractedText.trim());
        } else {
          failed.push(att.name);
        }
      } catch {
        failed.push(att.name);
      }
    }
    return { text: parts.join('\n\n').trim(), failed };
  }

  async function handleGenerate() {
    if (tourActive) { navigate('/compare'); return; }
    if (!canProceed || busy) return;
    setError(null);
    setBusy(true);
    try {
      const { text: referenceText, failed } = await buildReferenceText();
      if (!referenceText) {
        setError('Не удалось извлечь текст. Проверьте ввод или приложите другой файл.');
        return;
      }
      if (failed.length) {
        setError(`Не удалось обработать: ${failed.join(', ')}. Остальное обработано — продолжаю.`);
      }
      const project = await projectsApi.create({
        mode: 'FROM_REFERENCE',
        referenceText,
        analysis: {
          subject: 'other',
          grade: 9,
          topic: '',
          taskType: 'PROBLEM',
          difficulty: 3,
        },
        params: {
          variantsCount: variantCount,
          variationTypes: ['NUMBERS', 'CONTEXT'],
          difficultyGradation: 'EQUAL',
        },
      });
      navigate(`/projects/${project.projectId}`);
    } catch {
      setError('Ошибка создания комплекта. Попробуйте позже.');
    } finally {
      setBusy(false);
      refreshLimits();
    }
  }

  async function handleViewEditor() {
    if (tourActive) {
      setReferenceDraft({ referenceText: TOUR_MOCK_REFERENCE_TEXT, variantCount });
      navigate('/editor');
      return;
    }
    if (!canProceed || busy) return;
    setError(null);
    setBusy(true);
    try {
      const { text: referenceText, failed } = await buildReferenceText();
      if (!referenceText) {
        setError('Не удалось извлечь текст. Проверьте ввод или приложите другой файл.');
        return;
      }
      if (failed.length) {
        setError(`Не удалось обработать: ${failed.join(', ')}. Перехожу к редактору с остальным текстом.`);
      }
      setReferenceDraft({ referenceText, variantCount, sourceFiles: attachments.map(a => a.file) });
      navigate('/editor');
    } catch {
      setError('Не удалось обработать задание. Попробуйте позже.');
    } finally {
      setBusy(false);
      refreshLimits();
    }
  }

  const boxBorderColor = isDragging ? '#22a139' : 'rgba(34,161,57,0.45)';
  const boxBg = isDragging ? 'rgba(34,161,57,0.04)' : '#fff';

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
              <img src="/logo.png" alt="ВариантУм" style={{ height: '30px', objectFit: 'contain' }} />
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
                  <img src="/logo.png" alt="ВариантУм" style={{ height: '30px', objectFit: 'contain' }} />
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

    <main className="max-w-3xl mx-auto px-6 py-8" style={{ paddingTop: isMobile ? '76px' : undefined }}>
      <button
        onClick={() => navigate('/')}
        style={{ fontFamily: LP, fontWeight: 400, fontSize: '14px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '24px', padding: 0 }}
        className="hover:text-gray-800 transition-colors"
      >
        <IcoBack /> Назад
      </button>

      <h1 style={{ fontFamily: LP, fontWeight: 700, fontSize: '28px', color: '#1a1a1a', marginBottom: '4px' }}>
        Загрузить задание
      </h1>
      <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '16px', color: '#21A038', marginBottom: '24px' }}>
        Сервис поддерживает создание графиков и таблиц. Генерация изображений временно недоступна, однако вы можете загрузить собственный рисунок на странице редактора.
      </p>

      {/* Умная единая зона ввода */}
      <div
        data-tour="upload-dropzone"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          borderRadius: '16px',
          border: `1px solid ${boxBorderColor}`,
          background: boxBg,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Подсказка при перетаскивании */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 pointer-events-none rounded-2xl">
            <div className="text-[#22a139] opacity-70">
              <IcoUploadLarge />
            </div>
            <p className="text-sm font-semibold text-[#22a139]">Отпустите файлы</p>
          </div>
        )}

        {/* Текстовое поле */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          maxLength={MAX_TEXT_LENGTH}
          placeholder={'Вставьте или введите текст задания\nНапример: Решите уравнение: 2x + 5 = 15\n\nИли просто перетащите файл / фото прямо сюда'}
          style={{
            fontFamily: LP, fontWeight: 400, fontSize: '14px',
            color: '#374151', width: '100%', minHeight: '160px',
            padding: '16px', background: 'transparent',
            resize: 'none', outline: 'none', lineHeight: 1.6,
            boxSizing: 'border-box', border: 'none',
            opacity: isDragging ? 0.3 : 1,
            pointerEvents: isDragging ? 'none' : 'auto',
          }}
          className="placeholder-gray-400"
        />
        {text.length > 0 && (
          <div style={{
            textAlign: 'right', paddingRight: '16px', paddingBottom: '4px',
            fontFamily: LP, fontSize: '11px',
            color: text.length >= MAX_TEXT_LENGTH ? '#ef4444' : '#d1d5db',
          }}>
            {text.length} / {MAX_TEXT_LENGTH}
          </div>
        )}

        {/* Чипы вложений */}
        {attachments.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-3 items-start">
            {attachments.map((att, i) =>
              att.type === 'image'
                ? <ImageChip key={i} att={att} onRemove={() => removeAttachment(i)} />
                : <FileChip key={i} att={att} onRemove={() => removeAttachment(i)} />
            )}
          </div>
        )}

        {/* Нижняя панель инструментов */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px 10px',
          borderTop: `1px solid ${boxBorderColor}`,
        }}>
          <button
            data-tour="upload-paperclip"
            onClick={() => attachments.length < MAX_FILES && fileInputRef.current?.click()}
            title={attachments.length >= MAX_FILES ? `Максимум ${MAX_FILES} файла` : 'Прикрепить файл или фото'}
            disabled={attachments.length >= MAX_FILES}
            style={{
              color: attachments.length >= MAX_FILES ? '#e5e7eb' : '#9ca3af',
              background: 'none', border: 'none',
              cursor: attachments.length >= MAX_FILES ? 'not-allowed' : 'pointer',
              padding: '4px', borderRadius: '8px', display: 'flex', alignItems: 'center',
            }}
            className={attachments.length < MAX_FILES ? 'hover:text-[#0b8acb] hover:bg-blue-50 transition-colors' : ''}
          >
            <IcoPaperclip />
          </button>
          <span style={{ fontFamily: LP, fontWeight: 300, fontSize: '12px', color: '#d1d5db', userSelect: 'none' }}>
            PDF, DOCX, TXT · JPG, PNG, WebP, HEIC
            {attachments.length > 0 && (
              <span style={{ marginLeft: '6px', color: attachments.length >= MAX_FILES ? '#f59e0b' : '#d1d5db' }}>
                ({attachments.length}/{MAX_FILES})
              </span>
            )}
          </span>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Подсказка под полем */}
      {!canProceed && (
        <p style={{ fontFamily: LP, fontWeight: 300, fontSize: '12px', color: '#9ca3af', marginTop: '8px', paddingLeft: '4px' }}>
          Можно совмещать: написать текст и приложить файлы одновременно
        </p>
      )}

      {/* Ошибка */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Панель быстрого запуска — появляется когда есть контент или активен тур */}
      {(canProceed || tourNeedsPanel) && (
        <QuickLaunchPanel
          variantCount={variantCount}
          setVariantCount={setVariantCount}
          onGenerate={handleGenerate}
          onViewEditor={handleViewEditor}
          busy={busy}
          costHint={
            (attachments.length > 0
              ? `Разбор файлов спишет ≈${estimateParse(attachments.length)}% от дневного лимита. `
              : '') +
            `Генерация спишет примерно по 0.2–0.5% за каждое задание в каждом из ${variantCount} вариантов.`
          }
        />
      )}
    </main>
    </div>
  );
}
