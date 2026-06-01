import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { submissionsApi } from '../api/submissions.api';
import { RichText } from '../components/RichText';
import { MathText } from '../components/MathText';
import type { PublicTask, TaskAnswer } from '../types/api';

const LP = "'Littera Plain', sans-serif";

// Парсим варианты А)/Б)/В)/Г) из текста задания-теста
function parseTestOptions(text: string): string[] {
  const matches = text.match(/[А-ГA-D]\)\s*[^\nА-ГA-D]+/gu);
  if (matches && matches.length >= 2) return matches.map(m => m.trim());
  return [];
}

function TaskInput({
  task,
  answer,
  onChange,
}: {
  task: PublicTask;
  answer: string;
  onChange: (v: string) => void;
}) {
  const type = task.taskType ?? 'EXERCISE';

  if (type === 'TEST') {
    const options = parseTestOptions(task.text);
    if (options.length >= 2) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map((opt) => {
            const label = opt.split(')')[0].trim() + ')';
            return (
              <label
                key={opt}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  cursor: 'pointer', padding: '8px 12px',
                  borderRadius: '10px', border: `1.5px solid ${answer === label ? '#21a038' : '#e5e7eb'}`,
                  background: answer === label ? '#f0faf2' : '#fafafa',
                  transition: 'all 0.15s',
                }}
              >
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
      );
    }
  }

  if (type === 'OPEN_QUESTION') {
    return (
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
    );
  }

  return (
    <input
      type="text"
      value={answer}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Введите ответ..."
      style={{
        width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
        borderRadius: '10px', fontFamily: LP, fontSize: '15px', color: '#222',
        outline: 'none', boxSizing: 'border-box',
      }}
      onFocus={(e) => (e.target.style.borderColor = '#21a038')}
      onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
    />
  );
}

export function StudentFormPage() {
  const { token } = useParams<{ token: string }>();

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

  const { data: formInfo, isLoading, isError } = useQuery({
    queryKey: ['form', token],
    queryFn: () => submissionsApi.getFormInfo(token!),
    enabled: !!token,
    retry: 1,
  });

  // Если токен ведёт сразу на вариант — сохраняем задания, но оставляем шаг ввода имени
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
    setSubmitError('');
    setSubmitting(true);
    const answersArr: TaskAnswer[] = tasks.map((t) => ({ taskId: t.taskId, answer: answers[t.taskId] ?? '' }));
    try {
      await submissionsApi.submitAnswers(studentToken ?? token!, {
        studentName: studentName || nameInput.trim() || 'Ученик',
        answers: answersArr,
      });
      setStep('done');
    } catch {
      setSubmitError('Не удалось отправить работу. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: LP }}>
      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center',
      }}>
        <img src="/logo.png" alt="ВариантУм" style={{ height: '32px', objectFit: 'contain' }} />
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 20px' }}>
        {/* Project title */}
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
          {formInfo.projectTitle}
        </h1>

        {/* ── Шаг 1а: ввод имени (VARIANT — прямая ссылка) ── */}
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
              style={{
                width: '100%', padding: '13px', background: '#21a038',
                color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              Начать
            </button>
          </div>
        )}

        {/* ── Шаг 1б: ввод имени (CLASS_LIST) ── */}
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
                cursor: resolving ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
              }}
            >
              {resolving ? 'Поиск...' : 'Найти мой вариант'}
            </button>
          </div>
        )}

        {/* ── Шаг 2: задания ── */}
        {step === 'tasks' && (
          <div style={{ marginTop: '24px' }}>
            <p style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
              Вариант {variantIndex}{studentName ? ` · ${studentName}` : ''}
            </p>

            {tasks.map((task, idx) => (
              <div
                key={task.taskId}
                style={{
                  background: '#fff', borderRadius: '16px', padding: '24px',
                  boxShadow: '0 2px 10px rgba(0,0,0,.05)', marginBottom: '16px',
                }}
              >
                <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Задание {idx + 1}
                  {task.estimatedMinutes ? ` · ~${task.estimatedMinutes} мин` : ''}
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <RichText>{task.text}</RichText>
                </div>
                <TaskInput
                  task={task}
                  answer={answers[task.taskId] ?? ''}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [task.taskId]: v }))}
                />
                {task.answerHint && (
                  <p style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af', fontFamily: LP }}>
                    Формат ответа: {task.answerHint}
                  </p>
                )}
              </div>
            ))}

            {submitError && (
              <p style={{ color: '#e53e3e', textAlign: 'center', marginBottom: '12px' }}>{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: '100%', padding: '14px', background: submitting ? '#9ca3af' : '#21a038',
                color: '#fff', border: 'none', borderRadius: '14px', fontSize: '17px', fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
                marginTop: '8px',
              }}
            >
              {submitting ? 'Отправляю...' : 'Сдать работу'}
            </button>
          </div>
        )}

        {/* ── Шаг: уже сдано ── */}
        {step === 'already_submitted' && (
          <div style={{
            marginTop: '48px', textAlign: 'center',
            background: '#fff', borderRadius: '20px', padding: '48px 32px',
            boxShadow: '0 2px 16px rgba(0,0,0,.07)',
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>📋</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
              Работа уже сдана
            </h2>
            <p style={{ color: '#555', fontSize: '16px' }}>
              {studentName ? `${studentName}, вы` : 'Вы'} уже отправили эту работу. Учитель проверит её.
            </p>
          </div>
        )}

        {/* ── Шаг 3: готово ── */}
        {step === 'done' && (
          <div style={{
            marginTop: '48px', textAlign: 'center',
            background: '#fff', borderRadius: '20px', padding: '48px 32px',
            boxShadow: '0 2px 16px rgba(0,0,0,.07)',
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
              Работа сдана!
            </h2>
            <p style={{ color: '#555', fontSize: '16px' }}>
              Спасибо! Учитель проверит вашу работу.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
