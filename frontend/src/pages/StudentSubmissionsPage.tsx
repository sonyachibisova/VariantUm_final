import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { submissionsApi } from '../api/submissions.api';
import type { Submission, AutoScoreEntry, TaskAnswer, TeacherReviewEntry } from '../types/api';

const LP = "'Littera Plain', sans-serif";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function parseJson<T>(json?: string): T[] {
  if (!json) return [];
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

function ScoreBadge({ correct }: { correct: boolean | null }) {
  if (correct === null) return <span style={{ color: '#888', fontSize: '13px' }}>— ждёт проверки</span>;
  return correct
    ? <span style={{ color: '#21a038', fontWeight: 700 }}>✅ верно</span>
    : <span style={{ color: '#e53e3e', fontWeight: 700 }}>❌ неверно</span>;
}

function SubmissionDetail({
  submission,
  onClose,
}: {
  submission: Submission;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId } = useParams<{ projectId: string }>();

  const answers = parseJson<TaskAnswer>(submission.answersJson);
  const autoScores = parseJson<AutoScoreEntry>(submission.autoScore);
  const reviews = parseJson<TeacherReviewEntry>(submission.teacherReview);
  const scoreMap = Object.fromEntries(autoScores.map((s) => [s.taskId, s.correct]));
  const reviewMap = Object.fromEntries(reviews.map((r) => [r.taskId, r]));

  const [localReviews, setLocalReviews] = useState<Record<string, { comment: string; grade: string }>>(
    Object.fromEntries(
      reviews.map((r) => [r.taskId, { comment: r.comment ?? '', grade: r.grade ?? '' }])
    ),
  );

  const saveReview = useMutation({
    mutationFn: (taskReviews: TeacherReviewEntry[]) =>
      submissionsApi.saveReview(submission.id, taskReviews),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', projectId] });
    },
  });

  function handleSave() {
    const taskReviews: TeacherReviewEntry[] = answers.map((a) => ({
      taskId: a.taskId,
      comment: localReviews[a.taskId]?.comment ?? '',
      grade: localReviews[a.taskId]?.grade ?? '',
    }));
    saveReview.mutate(taskReviews);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '108px 16px 32px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', maxWidth: '700px', width: '100%', padding: '32px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#888', lineHeight: 1 }}
        >×</button>

        <h2 style={{ fontFamily: LP, fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>
          {submission.studentName}
        </h2>
        <p style={{ fontFamily: LP, fontSize: '14px', color: '#888', marginBottom: '24px' }}>
          Вариант {submission.variantIndex} · {formatDate(submission.submittedAt)}
        </p>

        {answers.map((a, idx) => {
          const correct = scoreMap[a.taskId];
          const rv = localReviews[a.taskId] ?? { comment: reviewMap[a.taskId]?.comment ?? '', grade: reviewMap[a.taskId]?.grade ?? '' };
          const needsReview = correct === null;

          return (
            <div key={a.taskId} style={{ borderTop: '1px solid #f0f0f0', paddingTop: '20px', marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontFamily: LP, fontWeight: 700, fontSize: '13px', color: '#555' }}>
                  Задание {idx + 1}
                </span>
                <ScoreBadge correct={correct ?? null} />
              </div>

              <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                <p style={{ fontFamily: LP, fontSize: '13px', color: '#888', marginBottom: '4px' }}>Ответ ученика:</p>
                <p style={{ fontFamily: LP, fontSize: '15px', color: '#222' }}>{a.answer || '—'}</p>
              </div>

              {needsReview && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Комментарий"
                    value={rv.comment}
                    onChange={(e) => setLocalReviews((prev) => ({ ...prev, [a.taskId]: { ...rv, comment: e.target.value } }))}
                    style={{ flex: 1, minWidth: '160px', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontFamily: LP, fontSize: '14px', outline: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="Оценка"
                    value={rv.grade}
                    onChange={(e) => setLocalReviews((prev) => ({ ...prev, [a.taskId]: { ...rv, grade: e.target.value } }))}
                    style={{ width: '80px', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontFamily: LP, fontSize: '14px', outline: 'none', textAlign: 'center' }}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontFamily: LP, fontSize: '15px', background: '#fff', cursor: 'pointer', color: '#555' }}
          >
            Закрыть
          </button>
          <button
            onClick={handleSave}
            disabled={saveReview.isPending}
            style={{ flex: 2, padding: '11px', background: saveReview.isPending ? '#9ca3af' : '#21a038', color: '#fff', border: 'none', borderRadius: '12px', fontFamily: LP, fontSize: '15px', fontWeight: 700, cursor: saveReview.isPending ? 'not-allowed' : 'pointer' }}
          >
            {saveReview.isPending ? 'Сохраняю...' : saveReview.isSuccess ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', flexShrink: 0 }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111' }}>Ответы учеников</h1>
            <p style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>{list.length} {list.length === 1 ? 'работа' : list.length < 5 ? 'работы' : 'работ'}</p>
          </div>
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
          const correct = scores.filter((s) => s.correct === true).length;
          const total = scores.length;
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
                <p style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>
                  Вариант {sub.variantIndex} · {formatDate(sub.submittedAt)}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                {total > 0
                  ? <p style={{ fontSize: '15px', fontWeight: 700, color: correct === total ? '#21a038' : '#e08050' }}>{correct}/{total}</p>
                  : <p style={{ fontSize: '13px', color: '#bbb' }}>—</p>
                }
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
