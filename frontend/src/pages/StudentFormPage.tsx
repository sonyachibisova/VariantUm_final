import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { submissionsApi } from '../api/submissions.api';
import { RichText } from '../components/RichText';
import { MathText } from '../components/MathText';
import type { PublicTask, TaskAnswer } from '../types/api';
import 'mathlive';
import 'mathlive/static.css';

const LP = "'Littera Plain', sans-serif";

// ── MathLive — типы и стили ───────────────────────────────────────────────

interface MathFieldEl extends HTMLElement {
  value: string;
  focus(): void;
}

declare global {
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

function initMathLiveKeyboardStyles() {
  if (typeof window === 'undefined') return;
  const STYLE_ID = 'ml-student-styles';
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    math-field::part(menu-toggle) { display: none !important; }
    .ML__keyboard {
      --keyboard-background: #ffffff !important;
      --keyboard-toolbar-background: #f8fafc !important;
      --keyboard-background-border: #e5e7eb !important;
      --keycap-background: #f8fafc !important;
      --keycap-background-hover: #e0f2fe !important;
      --keycap-background-pressed: #bae6fd !important;
      --keycap-text: #374151 !important;
      border-top: 1px solid #e5e7eb !important;
    }
  `;
  document.head.appendChild(s);
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
  borderRadius: '10px', fontFamily: LP, fontSize: '15px', color: '#222',
  outline: 'none', boxSizing: 'border-box',
};

// ── Парсим варианты А)/Б)/В)/Г) из текста задания-теста ───────────────────
function parseTestOptions(text: string): string[] {
  const matches = text.match(/[А-ГA-D]\)\s*[^\nА-ГA-D]+/gu);
  if (matches && matches.length >= 2) return matches.map(m => m.trim());
  return [];
}

// ── Детектируем подпункты а)/б)/в) в тексте задания ──────────────────────
function detectSubParts(text: string): string[] {
  const order = 'абвгд';
  const found: string[] = [];
  for (const letter of order) {
    if (text.includes(`${letter})`)) found.push(letter);
  }
  return found.length >= 2 ? found : [];
}

// ── Поле ввода с поддержкой вставки формулы через MathLive ───────────────
function FormulaAnswerInput({
  value,
  onChange,
  placeholder = 'Введите ответ...',
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string | null;
}) {
  const [showMath, setShowMath] = useState(false);
  const mathFieldRef = useRef<MathFieldEl>(null);

  function handleOpenMath() {
    setShowMath(true);
    setTimeout(() => {
      if (mathFieldRef.current) {
        mathFieldRef.current.value = '';
        mathFieldRef.current.focus();
      }
    }, 50);
  }

  function handleApplyMath() {
    if (!mathFieldRef.current) return;
    const latex = mathFieldRef.current.value.trim();
    if (latex) {
      onChange(value ? `${value} $${latex}$` : `$${latex}$`);
    }
    setShowMath(false);
  }

  const hasMath = value.includes('$') || value.includes('\\');

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...INPUT_STYLE, flex: 1 }}
          onFocus={(e) => (e.target.style.borderColor = '#21a038')}
          onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
        />
        <button
          type="button"
          onClick={handleOpenMath}
          title="Вставить формулу"
          style={{
            padding: '9px 12px',
            border: `1.5px solid ${showMath ? '#0b8acb' : '#c7d9e8'}`,
            borderRadius: '10px',
            background: showMath ? '#eff6ff' : '#f8fbfe',
            color: '#0b8acb',
            cursor: 'pointer',
            fontSize: '13px',
            fontFamily: LP,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>∑</span> Формула
        </button>
      </div>

      {hasMath && !showMath && (
        <div style={{
          marginTop: '6px', padding: '6px 10px',
          background: '#f0fdf4', border: '1px solid #d1fae5',
          borderRadius: '8px', fontSize: '14px',
        }}>
          <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '8px', fontFamily: LP }}>Предпросмотр:</span>
          <MathText>{value}</MathText>
        </div>
      )}

      {showMath && (
        <div style={{
          marginTop: '8px',
          border: '1.5px solid #93c5fd',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#fff',
        }}>
          <div style={{
            padding: '8px 14px',
            background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8', fontFamily: LP }}>
              Конструктор формулы
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowMath(false)}
                style={{
                  padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
                  fontSize: '12px', background: '#fff', cursor: 'pointer', fontFamily: LP, color: '#555',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleApplyMath}
                style={{
                  padding: '4px 14px', border: 'none', borderRadius: '8px',
                  fontSize: '12px', background: '#0b8acb', color: '#fff',
                  cursor: 'pointer', fontFamily: LP, fontWeight: 700,
                }}
              >
                Вставить
              </button>
            </div>
          </div>
          <div style={{ padding: '10px 12px' }}>
            {React.createElement('math-field', {
              ref: mathFieldRef,
              style: {
                width: '100%',
                fontSize: '1.1em',
                border: 'none',
                outline: 'none',
                minHeight: '48px',
                display: 'block',
              },
            })}
          </div>
          <div style={{ padding: '4px 14px 10px', borderTop: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: '11px', color: '#9ca3af', fontFamily: LP, margin: 0 }}>
              Используйте виртуальную клавиатуру для ввода дробей, корней и других символов. Нажмите «Вставить».
            </p>
          </div>
        </div>
      )}

      {hint && (
        <p style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af', fontFamily: LP }}>
          Формат ответа: {hint}
        </p>
      )}
    </div>
  );
}

// ── Поля ввода для задания с несколькими частями (а/б/в) ──────────────────
function MultiPartInput({
  subParts, answer, onChange, hint,
}: {
  subParts: string[]; answer: string; onChange: (v: string) => void; hint?: string | null;
}) {
  const [subAnswers, setSubAnswers] = useState<Record<string, string>>(() => {
    const parts = answer ? answer.split(';').map(s => s.trim()) : [];
    return Object.fromEntries(subParts.map((l, i) => [l, parts[i] ?? '']));
  });

  const handleChange = (letter: string, val: string) => {
    const updated = { ...subAnswers, [letter]: val };
    setSubAnswers(updated);
    onChange(subParts.map(l => updated[l] ?? '').join('; '));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {subParts.map(letter => (
        <div key={letter} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontFamily: LP, fontSize: '15px', fontWeight: 700, color: '#374151', paddingTop: '10px', minWidth: '22px' }}>{letter})</span>
          <div style={{ flex: 1 }}>
            <FormulaAnswerInput
              value={subAnswers[letter] ?? ''}
              onChange={(v) => handleChange(letter, v)}
              placeholder={`Ответ для ${letter})...`}
              hint={hint}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Компонент ввода для одного задания ────────────────────────────────────
function TaskInput({ task, answer, onChange }: {
  task: PublicTask; answer: string; onChange: (v: string) => void;
}) {
  const type = task.taskType ?? 'EXERCISE';
  const hint = task.answerHint;

  if (type === 'TEST') {
    const options = parseTestOptions(task.text);
    if (options.length >= 2) {
      return (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {options.map((opt) => {
              const label = opt.split(')')[0].trim() + ')';
              return (
                <label key={opt} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                  padding: '8px 12px', borderRadius: '10px',
                  border: `1.5px solid ${answer === label ? '#21a038' : '#e5e7eb'}`,
                  background: answer === label ? '#f0faf2' : '#fafafa', transition: 'all 0.15s',
                }}>
                  <input
                    type="radio"
                    name={`task-${task.taskId}`}
                    value={label}
                    checked={answer === label}
                    onChange={() => onChange(label)}
                    style={{ accentColor: '#21a038', width: '16px', height: '16px', flexShrink: 0 }}
                  />
                  <span style={{ fontFamily: LP, fontSize: '15px', color: '#222', lineHeight: 1.4 }}>
                    <MathText>{opt}</MathText>
                  </span>
                </label>
              );
            })}
          </div>
          {hint && (
            <p style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af', fontFamily: LP }}>
              Формат ответа: {hint}
            </p>
          )}
        </div>
      );
    }
  }

  if (type === 'OPEN_QUESTION') {
    return (
      <div>
        <textarea
          value={answer}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="Введите развёрнутый ответ..."
          style={{
            width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
            borderRadius: '10px', fontFamily: LP, fontSize: '15px', color: '#222',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#21a038')}
          onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
        />
        {hint && (
          <p style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af', fontFamily: LP }}>
            Формат ответа: {hint}
          </p>
        )}
      </div>
    );
  }

  const subParts = detectSubParts(task.text);
  if (subParts.length >= 2) {
    return <MultiPartInput subParts={subParts} answer={answer} onChange={onChange} hint={hint} />;
  }

  return <FormulaAnswerInput value={answer} onChange={onChange} hint={hint} />;
}

// ── Диалог подтверждения сдачи ────────────────────────────────────────────
function ConfirmDialog({
  unfilledCount,
  filesCount,
  onConfirm,
  onCancel,
}: {
  unfilledCount: number;
  filesCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '32px 28px',
        maxWidth: '400px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.18)',
      }}>
        <h3 style={{ fontFamily: LP, fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '14px' }}>
          Сдать работу?
        </h3>

        {unfilledCount > 0 && (
          <div style={{
            background: '#fff7ed', border: '1px solid #fed7aa',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '14px',
          }}>
            <p style={{ fontFamily: LP, fontSize: '14px', color: '#92400e' }}>
              Не заполнено {unfilledCount} {unfilledCount === 1 ? 'задание' : unfilledCount < 5 ? 'задания' : 'заданий'}.
              После сдачи изменить ответы нельзя.
            </p>
          </div>
        )}

        {filesCount > 0 && (
          <p style={{ fontFamily: LP, fontSize: '14px', color: '#555', marginBottom: '14px' }}>
            Прикреплено файлов: {filesCount}
          </p>
        )}

        {unfilledCount === 0 && filesCount === 0 && (
          <p style={{ fontFamily: LP, fontSize: '14px', color: '#555', marginBottom: '14px' }}>
            После сдачи изменить ответы нельзя.
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: '12px',
              fontFamily: LP, fontSize: '15px', background: '#fff', cursor: 'pointer', color: '#555',
            }}
          >
            Вернуться
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2, padding: '11px', background: '#21a038', color: '#fff', border: 'none',
              borderRadius: '12px', fontFamily: LP, fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Сдать
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Основная страница ─────────────────────────────────────────────────────
export function StudentFormPage() {
  const { token } = useParams<{ token: string }>();
  const storageKey = `va_form_${token}`;

  useEffect(() => {
    initMathLiveKeyboardStyles();
  }, []);

  const [step, setStep] = useState<'name' | 'tasks' | 'done' | 'already_submitted'>('name');
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [resolving, setResolving] = useState(false);

  const [studentName, setStudentName] = useState('');
  const [studentToken, setStudentToken] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [variantIndex, setVariantIndex] = useState<number>(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Файлы (до 3)
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: formInfo, isLoading, isError } = useQuery({
    queryKey: ['form', token],
    queryFn: () => submissionsApi.getFormInfo(token!),
    enabled: !!token,
    retry: 1,
  });

  // Восстановление ответов из localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setAnswers(JSON.parse(saved)); } catch {}
    }
  }, [storageKey]);

  // Автосохранение ответов
  useEffect(() => {
    if (step === 'tasks' && Object.keys(answers).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    }
  }, [answers, step, storageKey]);

  useEffect(() => {
    if (formInfo?.tokenType === 'VARIANT' && step === 'name' && formInfo.tasks) {
      setTasks(formInfo.tasks);
      setVariantIndex(formInfo.variantIndex ?? 1);
    }
  }, [formInfo, step]);

  function handleVariantNameProceed() {
    if (!nameInput.trim()) { setNameError('Введите ваше имя'); return; }
    setStudentName(nameInput.trim());
    setStep('tasks');
  }

  async function handleResolveName() {
    if (!nameInput.trim()) { setNameError('Введите фамилию'); return; }
    setNameError('');
    setResolving(true);
    try {
      const result = await submissionsApi.resolveName(token!, nameInput.trim());
      setStudentName(result.studentName);
      setStudentToken(result.studentAccessToken ?? null);
      setTasks(result.tasks);
      setVariantIndex(result.variantIndex);
      setStep(result.alreadySubmitted ? 'already_submitted' : 'tasks');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setNameError(msg ?? 'Фамилия не найдена, попробуйте ещё раз');
    } finally {
      setResolving(false);
    }
  }

  async function handleSubmit() {
    setShowConfirm(false);
    setSubmitError('');
    setSubmitting(true);
    const answersArr: TaskAnswer[] = tasks.map((t) => ({ taskId: t.taskId, answer: answers[t.taskId] ?? '' }));
    try {
      const submission = await submissionsApi.submitAnswers(studentToken ?? token!, {
        studentName: studentName || nameInput.trim() || 'Ученик',
        answers: answersArr,
      });
      // Загружаем файлы (не блокируем done при ошибке загрузки)
      if (stagedFiles.length > 0) {
        await Promise.allSettled(
          stagedFiles.map(f => submissionsApi.uploadAttachment(studentToken ?? token!, submission.id, f))
        );
      }
      localStorage.removeItem(storageKey);
      setStep('done');
    } catch {
      setSubmitError('Не удалось отправить работу. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddFiles(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).filter(f => f.size <= 10 * 1024 * 1024);
    setStagedFiles(prev => [...prev, ...newFiles].slice(0, 3));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: LP }}>
        <p style={{ color: '#888', fontSize: '16px' }}>Загрузка...</p>
      </div>
    );
  }

  if (isError || !formInfo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: LP }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e53e3e', fontSize: '18px', fontWeight: 700 }}>Ссылка недействительна</p>
          <p style={{ color: '#888', marginTop: '8px' }}>Проверьте правильность ссылки или обратитесь к учителю.</p>
        </div>
      </div>
    );
  }

  // Прогресс: сколько заданий заполнено
  const filledCount = tasks.filter(t => (answers[t.taskId] ?? '').trim().length > 0).length;
  const unfilledCount = tasks.length - filledCount;
  const progressPct = tasks.length > 0 ? (filledCount / tasks.length) * 100 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: LP }}>
      {showConfirm && (
        <ConfirmDialog
          unfilledCount={unfilledCount}
          filesCount={stagedFiles.length}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center',
      }}>
        <img src="/logo.png" alt="ВариантУм" style={{ height: '32px', objectFit: 'contain' }} />
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
          {formInfo.projectTitle}
        </h1>

        {/* ── Шаг 1а: VARIANT ── */}
        {step === 'name' && formInfo.tokenType === 'VARIANT' && (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,.06)', marginTop: '24px' }}>
            <p style={{ fontSize: '16px', color: '#555', marginBottom: '20px' }}>
              Введите своё имя, чтобы учитель знал, чья это работа.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVariantNameProceed()}
                placeholder="Имя и фамилия"
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', border: `1.5px solid ${nameError ? '#e53e3e' : '#e5e7eb'}`,
                  borderRadius: '12px', fontSize: '16px', color: '#222', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {nameError && <p style={{ color: '#e53e3e', fontSize: '14px', marginTop: '6px' }}>{nameError}</p>}
            </div>
            <button
              onClick={handleVariantNameProceed}
              style={{ width: '100%', padding: '13px', background: '#21a038', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
            >
              Начать
            </button>
          </div>
        )}

        {/* ── Шаг 1б: CLASS_LIST ── */}
        {step === 'name' && formInfo.tokenType === 'CLASS_LIST' && (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,.06)', marginTop: '24px' }}>
            <p style={{ fontSize: '16px', color: '#555', marginBottom: '20px' }}>
              Введите свою фамилию, чтобы получить вариант задания.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResolveName()}
                placeholder="Фамилия (или фамилия и имя)"
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', border: `1.5px solid ${nameError ? '#e53e3e' : '#e5e7eb'}`,
                  borderRadius: '12px', fontSize: '16px', color: '#222', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {nameError && <p style={{ color: '#e53e3e', fontSize: '14px', marginTop: '6px' }}>{nameError}</p>}
            </div>
            <button
              onClick={handleResolveName}
              disabled={resolving}
              style={{
                width: '100%', padding: '13px', background: resolving ? '#9ca3af' : '#21a038',
                color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700,
                cursor: resolving ? 'not-allowed' : 'pointer',
              }}
            >
              {resolving ? 'Поиск...' : 'Найти мой вариант'}
            </button>
          </div>
        )}

        {/* ── Шаг 2: задания ── */}
        {step === 'tasks' && (
          <div style={{ marginTop: '24px' }}>
            {/* Прогресс */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <p style={{ fontSize: '14px', color: '#888' }}>
                  Вариант {variantIndex}{studentName ? ` · ${studentName}` : ''}
                </p>
                <p style={{ fontSize: '13px', color: '#888' }}>
                  {filledCount} / {tasks.length} заданий
                </p>
              </div>
              <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: '#21a038', borderRadius: '2px',
                  width: `${progressPct}%`, transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {tasks.map((task, idx) => (
              <div key={task.taskId} style={{
                background: '#fff', borderRadius: '16px', padding: '24px',
                boxShadow: '0 2px 10px rgba(0,0,0,.05)', marginBottom: '16px',
              }}>
                <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Задание {idx + 1}{task.estimatedMinutes ? ` · ~${task.estimatedMinutes} мин` : ''}
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <RichText>{task.text}</RichText>
                </div>
                <TaskInput
                  task={task}
                  answer={answers[task.taskId] ?? ''}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [task.taskId]: v }))}
                />
              </div>
            ))}

            {/* Прикрепить файлы */}
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '20px 24px',
              boxShadow: '0 2px 10px rgba(0,0,0,.05)', marginBottom: '16px',
            }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#555', marginBottom: '10px' }}>
                Прикрепить фото или файл к работе{' '}
                <span style={{ fontWeight: 400, color: '#9ca3af' }}>(необязательно, до 3 файлов, до 10 МБ)</span>
              </p>

              {stagedFiles.length < 3 && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={(e) => handleAddFiles(e.target.files)}
                    style={{ display: 'none' }}
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px', border: '1.5px dashed #d1d5db',
                      borderRadius: '10px', color: '#6b7280', fontSize: '14px',
                      cursor: 'pointer', fontFamily: LP,
                    }}
                  >
                    + Добавить файл
                  </label>
                </>
              )}

              {stagedFiles.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', background: '#f9fafb', borderRadius: '10px', marginTop: '8px',
                }}>
                  <span style={{ fontSize: '20px' }}>
                    {f.type.startsWith('image/') ? '🖼' : f.type === 'application/pdf' ? '📄' : '📎'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                    <p style={{ fontSize: '12px', color: '#9ca3af' }}>{(f.size / 1024).toFixed(0)} КБ</p>
                  </div>
                  <button
                    onClick={() => setStagedFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 4px' }}
                  >×</button>
                </div>
              ))}
            </div>

            {submitError && (
              <p style={{ color: '#e53e3e', textAlign: 'center', marginBottom: '12px' }}>{submitError}</p>
            )}

            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              style={{
                width: '100%', padding: '14px',
                background: submitting ? '#9ca3af' : '#21a038',
                color: '#fff', border: 'none', borderRadius: '14px', fontSize: '17px', fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer', marginTop: '8px',
              }}
            >
              {submitting ? 'Отправляю...' : 'Сдать работу'}
            </button>
          </div>
        )}

        {/* ── Уже сдано ── */}
        {step === 'already_submitted' && (
          <div style={{ marginTop: '48px', textAlign: 'center', background: '#fff', borderRadius: '20px', padding: '48px 32px', boxShadow: '0 2px 16px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>📋</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>Работа уже сдана</h2>
            <p style={{ color: '#555', fontSize: '16px' }}>
              {studentName ? `${studentName}, вы` : 'Вы'} уже отправили эту работу. Учитель проверит её.
            </p>
          </div>
        )}

        {/* ── Готово ── */}
        {step === 'done' && (
          <div style={{ marginTop: '48px', textAlign: 'center', background: '#fff', borderRadius: '20px', padding: '48px 32px', boxShadow: '0 2px 16px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>Работа сдана!</h2>
            <p style={{ color: '#555', fontSize: '16px' }}>Спасибо! Учитель проверит вашу работу.</p>
          </div>
        )}
      </main>
    </div>
  );
}
