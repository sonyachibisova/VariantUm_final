import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { submissionsApi } from '../api/submissions.api';
import { MathText } from '../components/MathText';
import type { Submission, AutoScoreEntry, TaskAnswer, TeacherReviewEntry, CorrectAnswerEntry, AttachmentInfo, SubmissionTask } from '../types/api';

const LP = "'Littera Plain', sans-serif";

const GRADES = ['2', '3', '4', '5'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function parseJson<T>(json?: string | null): T[] {
  if (!json) return [];
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

// Эффективный результат: override от учителя или авто-оценка
function effectiveScore(
  taskId: string,
  scoreMap: Record<string, boolean | null>,
  overrideMap: Record<string, boolean>,
): boolean | null {
  if (overrideMap[taskId] !== undefined) return overrideMap[taskId];
  return scoreMap[taskId] ?? null;
}

function ScoreBadge({ correct, overridden }: { correct: boolean | null; overridden?: boolean }) {
  if (correct === null) return <span style={{ color: '#888', fontSize: '13px' }}>— ждёт проверки</span>;
  return correct
    ? <span style={{ color: '#21a038', fontWeight: 700 }}>{overridden ? '✅ засчитано вручную' : '✅ верно'}</span>
    : <span style={{ color: '#e53e3e', fontWeight: 700 }}>{overridden ? '❌ не засчитано' : '❌ неверно'}</span>;
}

// ── Экспорт CSV ───────────────────────────────────────────────────────────
function exportCsv(submissions: Submission[], projectTitle: string) {
  const rows: (string | number)[][] = [
    ['Имя ученика', 'Вариант', 'Дата сдачи', 'Верно (авто)', 'Всего (авто)', 'Итоговая оценка'],
  ];
  for (const sub of submissions) {
    const scores = parseJson<AutoScoreEntry>(sub.autoScore);
    const reviews = parseJson<TeacherReviewEntry>(sub.teacherReview);
    const overallEntry = reviews.find(r => r.taskId === '__OVERALL__');
    const overrideMap: Record<string, boolean> = {};
    reviews.forEach(r => { if (r.overrideCorrect !== null && r.overrideCorrect !== undefined) overrideMap[r.taskId] = r.overrideCorrect!; });
    const scoreMap: Record<string, boolean | null> = {};
    scores.forEach(s => { scoreMap[s.taskId] = s.correct; });

    const correct = scores.filter(s => effectiveScore(s.taskId, scoreMap, overrideMap) === true).length;
    const total = scores.length;
    rows.push([
      sub.studentName,
      sub.variantIndex,
      formatDate(sub.submittedAt),
      correct,
      total,
      overallEntry?.grade ?? '',
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `результаты_${projectTitle}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Детальный просмотр работы ─────────────────────────────────────────────
function SubmissionDetail({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { projectId } = useParams<{ projectId: string }>();

  const answers = parseJson<TaskAnswer>(submission.answersJson);
  const autoScores = parseJson<AutoScoreEntry>(submission.autoScore);
  const correctAnswers = parseJson<CorrectAnswerEntry>(submission.correctAnswersJson);
  const taskData = parseJson<SubmissionTask>(submission.tasksJson);
  const attachments = parseJson<AttachmentInfo>(submission.attachmentsJson);

  const initReviews = parseJson<TeacherReviewEntry>(submission.teacherReview);
  const initOverall = initReviews.find(r => r.taskId === '__OVERALL__')?.grade ?? '';

  const scoreMap: Record<string, boolean | null> = Object.fromEntries(autoScores.map(s => [s.taskId, s.correct]));
  const correctMap: Record<string, string> = Object.fromEntries(correctAnswers.map(c => [c.taskId, c.expectedAnswer]));
  const taskTextMap: Record<string, SubmissionTask> = Object.fromEntries(taskData.map(t => [t.taskId, t]));

  type LocalReview = { comment: string; overrideCorrect: boolean | null };
  const [localReviews, setLocalReviews] = useState<Record<string, LocalReview>>(() => {
    const map: Record<string, LocalReview> = {};
    answers.forEach(a => {
      const rv = initReviews.find(r => r.taskId === a.taskId);
      map[a.taskId] = {
        comment: rv?.comment ?? '',
        overrideCorrect: rv?.overrideCorrect ?? null,
      };
    });
    return map;
  });
  const [overallGrade, setOverallGrade] = useState(initOverall);

  // Карта override для отображения
  const overrideMap: Record<string, boolean> = {};
  Object.entries(localReviews).forEach(([id, rv]) => {
    if (rv.overrideCorrect !== null && rv.overrideCorrect !== undefined) {
      overrideMap[id] = rv.overrideCorrect!;
    }
  });

  const saveReview = useMutation({
    mutationFn: (taskReviews: TeacherReviewEntry[]) =>
      submissionsApi.saveReview(submission.id, taskReviews),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', projectId] });
    },
  });

  function handleSave() {
    const taskReviews: TeacherReviewEntry[] = answers.map(a => ({
      taskId: a.taskId,
      comment: localReviews[a.taskId]?.comment ?? '',
      overrideCorrect: localReviews[a.taskId]?.overrideCorrect ?? null,
    }));
    if (overallGrade) {
      taskReviews.push({ taskId: '__OVERALL__', grade: overallGrade, comment: '', overrideCorrect: null });
    }
    saveReview.mutate(taskReviews);
  }

  function setOverride(taskId: string, value: boolean | null) {
    setLocalReviews(prev => ({ ...prev, [taskId]: { ...prev[taskId], overrideCorrect: value } }));
  }

  function setComment(taskId: string, value: string) {
    setLocalReviews(prev => ({ ...prev, [taskId]: { ...prev[taskId], comment: value } }));
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '80px 16px 32px',
    }}>
      <div style={{ background: '#fff', borderRadius: '20px', maxWidth: '720px', width: '100%', padding: '32px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#888', lineHeight: 1 }}
        >×</button>

        {/* Шапка */}
        <h2 style={{ fontFamily: LP, fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
          {submission.studentName}
        </h2>
        <p style={{ fontFamily: LP, fontSize: '14px', color: '#888', marginBottom: '6px' }}>
          Вариант {submission.variantIndex} · {formatDate(submission.submittedAt)}
        </p>

        {/* Итоговая оценка */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: '#f9fafb', borderRadius: '12px', padding: '12px 16px', marginBottom: '24px',
        }}>
          <span style={{ fontFamily: LP, fontSize: '14px', color: '#555', fontWeight: 600 }}>Итоговая оценка:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {GRADES.map(g => (
              <button
                key={g}
                onClick={() => setOverallGrade(overallGrade === g ? '' : g)}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: '1.5px solid',
                  borderColor: overallGrade === g ? '#21a038' : '#e5e7eb',
                  background: overallGrade === g ? '#21a038' : '#fff',
                  color: overallGrade === g ? '#fff' : '#374151',
                  fontFamily: LP, fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                }}
              >{g}</button>
            ))}
          </div>
          {overallGrade && (
            <button
              onClick={() => setOverallGrade('')}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '13px', fontFamily: LP }}
            >Сбросить</button>
          )}
        </div>

        {/* Задания */}
        {answers.map((a, idx) => {
          const autoCorrect = scoreMap[a.taskId];
          const isOverridden = localReviews[a.taskId]?.overrideCorrect !== null &&
            localReviews[a.taskId]?.overrideCorrect !== undefined;
          const effective = effectiveScore(a.taskId, scoreMap, overrideMap);
          const expectedAnswer = correctMap[a.taskId];
          const taskInfo = taskTextMap[a.taskId];

          return (
            <div key={a.taskId} style={{ borderTop: '1px solid #f0f0f0', paddingTop: '20px', marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontFamily: LP, fontWeight: 700, fontSize: '13px', color: '#555' }}>
                  Задание {idx + 1}
                </span>
                <ScoreBadge correct={effective} overridden={isOverridden} />
              </div>

              {/* Текст задания */}
              {taskInfo && (
                <div style={{
                  background: '#f9fafb', borderRadius: '10px', padding: '10px 12px',
                  marginBottom: '10px', fontSize: '14px', color: '#374151', lineHeight: 1.6,
                }}>
                  <MathText>{taskInfo.text}</MathText>
                </div>
              )}

              {/* Ответ ученика */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
                <p style={{ fontFamily: LP, fontSize: '12px', color: '#9ca3af', marginBottom: '3px' }}>Ответ ученика:</p>
                <div style={{ fontFamily: LP, fontSize: '15px', color: '#222' }}>{a.answer ? <MathText>{a.answer}</MathText> : '—'}</div>
              </div>

              {/* Правильный ответ */}
              {expectedAnswer && (
                <div style={{
                  background: effective === true ? '#f0fdf4' : '#fff7ed',
                  borderRadius: '10px', padding: '8px 12px', marginBottom: '10px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ fontFamily: LP, fontSize: '13px', color: '#6b7280' }}>Правильный ответ:</span>
                  <span style={{ fontFamily: LP, fontSize: '14px', fontWeight: 600, color: effective === true ? '#15803d' : '#b45309' }}>
                    <MathText>{expectedAnswer}</MathText>
                  </span>
                </div>
              )}

              {/* Кнопки override */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <button
                  onClick={() => setOverride(a.taskId, true)}
                  style={{
                    padding: '5px 12px', borderRadius: '8px', border: '1.5px solid',
                    borderColor: localReviews[a.taskId]?.overrideCorrect === true ? '#21a038' : '#e5e7eb',
                    background: localReviews[a.taskId]?.overrideCorrect === true ? '#f0faf2' : '#fff',
                    color: '#21a038', fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                  }}
                >✅ Засчитать</button>
                <button
                  onClick={() => setOverride(a.taskId, false)}
                  style={{
                    padding: '5px 12px', borderRadius: '8px', border: '1.5px solid',
                    borderColor: localReviews[a.taskId]?.overrideCorrect === false ? '#e53e3e' : '#e5e7eb',
                    background: localReviews[a.taskId]?.overrideCorrect === false ? '#fff5f5' : '#fff',
                    color: '#e53e3e', fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                  }}
                >❌ Не засчитать</button>
                {isOverridden && (
                  <button
                    onClick={() => setOverride(a.taskId, null)}
                    style={{
                      padding: '5px 12px', borderRadius: '8px', border: '1.5px solid #e5e7eb',
                      background: '#fff', color: '#6b7280', fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                    }}
                  >↺ Авто ({autoCorrect === true ? 'верно' : autoCorrect === false ? 'неверно' : 'н/о'})</button>
                )}
              </div>

              {/* Комментарий */}
              <input
                type="text"
                placeholder="Комментарий для учителя (необязательно)"
                value={localReviews[a.taskId]?.comment ?? ''}
                onChange={(e) => setComment(a.taskId, e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb',
                  borderRadius: '10px', fontFamily: LP, fontSize: '14px', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#21a038')}
                onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>
          );
        })}

        {/* Вложения */}
        {attachments.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid #f0f0f0', paddingTop: '20px' }}>
            <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '10px' }}>
              Прикреплённые файлы ({attachments.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {attachments.map(att => (
                <a
                  key={att.id}
                  href={submissionsApi.getAttachmentUrl(submission.id, att.id)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', background: '#f9fafb',
                    borderRadius: '10px', textDecoration: 'none', color: '#374151',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>
                    {att.mimeType.startsWith('image/') ? '🖼' : att.mimeType === 'application/pdf' ? '📄' : '📎'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: LP, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.fileName}</p>
                    <p style={{ fontFamily: LP, fontSize: '12px', color: '#9ca3af' }}>{formatBytes(att.fileSize)}</p>
                  </div>
                  <span style={{ fontFamily: LP, fontSize: '12px', color: '#21a038' }}>Открыть →</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontFamily: LP, fontSize: '15px', background: '#fff', cursor: 'pointer', color: '#555' }}
          >Закрыть</button>
          <button
            onClick={handleSave}
            disabled={saveReview.isPending}
            style={{
              flex: 2, padding: '11px',
              background: saveReview.isPending ? '#9ca3af' : '#21a038',
              color: '#fff', border: 'none', borderRadius: '12px',
              fontFamily: LP, fontSize: '15px', fontWeight: 700,
              cursor: saveReview.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {saveReview.isPending ? 'Сохраняю...' : saveReview.isSuccess ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Список работ ──────────────────────────────────────────────────────────
export function StudentSubmissionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Submission | null>(null);

  const { data: submissions, isLoading, isError } = useQuery({
    queryKey: ['submissions', projectId],
    queryFn: () => submissionsApi.listSubmissions(projectId!),
    enabled: !!projectId,
  });

  const list = submissions ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: LP }}>
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', flexShrink: 0 }}
          >←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111' }}>Ответы учеников</h1>
            <p style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>
              {list.length} {list.length === 1 ? 'работа' : list.length < 5 ? 'работы' : 'работ'}
            </p>
          </div>
          {list.length > 0 && (
            <button
              onClick={() => exportCsv(list, 'результаты')}
              style={{
                padding: '8px 16px', background: '#fff', border: '1.5px solid #e5e7eb',
                borderRadius: '10px', fontFamily: LP, fontSize: '13px', color: '#555',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              Скачать CSV
            </button>
          )}
        </div>

        {isLoading && <p style={{ color: '#888', textAlign: 'center' }}>Загрузка...</p>}
        {isError && <p style={{ color: '#e53e3e', textAlign: 'center' }}>Не удалось загрузить работы</p>}

        {!isLoading && !isError && list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '16px', color: '#888' }}>Пока никто не сдал работу</p>
            <p style={{ fontSize: '14px', color: '#bbb', marginTop: '6px' }}>Поделитесь ссылкой с учениками</p>
          </div>
        )}

        {list.map((sub) => {
          const scores = parseJson<AutoScoreEntry>(sub.autoScore);
          const reviews = parseJson<TeacherReviewEntry>(sub.teacherReview);
          const overallEntry = reviews.find(r => r.taskId === '__OVERALL__');
          const overrideMap: Record<string, boolean> = {};
          reviews.forEach(r => { if (r.overrideCorrect !== null && r.overrideCorrect !== undefined) overrideMap[r.taskId] = r.overrideCorrect!; });
          const scoreMap: Record<string, boolean | null> = {};
          scores.forEach(s => { scoreMap[s.taskId] = s.correct; });

          const correct = scores.filter(s => effectiveScore(s.taskId, scoreMap, overrideMap) === true).length;
          const total = scores.length;

          // Сколько заданий ждут ручной проверки
          const pendingReview = scores.filter(s =>
            effectiveScore(s.taskId, scoreMap, overrideMap) === null
          ).length;

          const attachmentCount = parseJson<AttachmentInfo>(sub.attachmentsJson).length;

          return (
            <button
              key={sub.id}
              onClick={() => setSelected(sub)}
              style={{
                width: '100%', background: '#fff', border: '1.5px solid #f0f0f0',
                borderRadius: '16px', padding: '18px 20px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '12px', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 1px 6px rgba(0,0,0,.04)', transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,.04)')}
            >
              <div>
                <p style={{ fontWeight: 700, fontSize: '16px', color: '#111' }}>{sub.studentName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#888' }}>
                    Вариант {sub.variantIndex} · {formatDate(sub.submittedAt)}
                  </span>
                  {pendingReview > 0 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: '#fff',
                      background: '#f59e0b', borderRadius: '6px', padding: '2px 7px',
                    }}>
                      {pendingReview} ждёт проверки
                    </span>
                  )}
                  {attachmentCount > 0 && (
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>📎 {attachmentCount}</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                {overallEntry?.grade && (
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#21a038' }}>{overallEntry.grade}</p>
                )}
                {total > 0 && (
                  <p style={{ fontSize: '14px', color: correct === total ? '#21a038' : '#e08050', fontWeight: 600 }}>
                    {correct}/{total}
                  </p>
                )}
                <p style={{ fontSize: '12px', color: '#bbb', marginTop: '2px' }}>Открыть</p>
              </div>
            </button>
          );
        })}
      </main>

      {selected && (
        <SubmissionDetail
          submission={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
