import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '../../api/forms.api';
import type { FormAssignment, FormStudentItem } from '../../types/api';

const LP = "'Littera Plain', sans-serif";

const BASE_URL = window.location.origin;

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function CopyButton({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '5px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px',
        background: copied ? '#f0faf2' : '#fff', cursor: 'pointer',
        fontSize: '12px', fontFamily: LP, color: copied ? '#21a038' : '#555',
        flexShrink: 0, transition: 'all 0.15s',
      }}
    >
      {copied ? '✓ Скопировано' : label}
    </button>
  );
}

function LinkRow({ label, token }: { label: string; token: string }) {
  const url = `${BASE_URL}/form/${token}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '2px' }}>{label}</p>
        <p style={{
          fontFamily: 'monospace', fontSize: '12px', color: '#0b8acb',
          background: '#f0f7ff', borderRadius: '6px', padding: '4px 8px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{url}</p>
      </div>
      <CopyButton text={url} />
    </div>
  );
}

function StudentLinkRow({ student }: { student: FormStudentItem }) {
  const url = `${BASE_URL}/form/${student.accessToken}`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '7px 12px', borderBottom: '1px solid #f9f9f9',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: LP, fontSize: '13px', color: '#333' }}>{student.fullName}</span>
        <span style={{ fontFamily: LP, fontSize: '12px', color: '#888', marginLeft: '8px' }}>
          Вариант {student.variantIndex}
        </span>
        <p style={{
          fontFamily: 'monospace', fontSize: '11px', color: '#0b8acb',
          margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{url}</p>
      </div>
      <CopyButton text={url} />
    </div>
  );
}

interface Props {
  projectId: string;
  onClose: () => void;
  tourMode?: boolean;
}

export function FormExportDialog({ projectId, onClose, tourMode }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'CLASS_LIST' | 'INDIVIDUAL_LINKS'>('CLASS_LIST');
  const [studentsText, setStudentsText] = useState('');
  const [newAssignment, setNewAssignment] = useState<FormAssignment | null>(null);
  const [forceNew, setForceNew] = useState(false);
  const [addStudentsText, setAddStudentsText] = useState('');
  const [addError, setAddError] = useState('');

  const { data: existingAssignments, isLoading: loadingExisting } = useQuery({
    queryKey: ['forms', projectId],
    queryFn: () => formsApi.listAssignments(projectId),
    enabled: !tourMode,
  });

  // Derive assignment without async effect: immediately use query cache
  const latestExisting = existingAssignments && existingAssignments.length > 0
    ? existingAssignments[existingAssignments.length - 1]
    : null;
  const assignment: FormAssignment | null = newAssignment ?? (!forceNew ? latestExisting : null);

  const createMutation = useMutation({
    mutationFn: () => formsApi.createAssignment(projectId, {
      mode,
      students: mode === 'CLASS_LIST' ? studentsText.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
    }),
    onSuccess: (data) => {
      setNewAssignment(data);
      setForceNew(false);
      queryClient.invalidateQueries({ queryKey: ['forms', projectId] });
    },
  });

  const addStudentsMutation = useMutation({
    mutationFn: (students: string[]) => formsApi.addStudents(assignment!.id, students),
    onSuccess: (data) => {
      setNewAssignment(data);
      setAddStudentsText('');
      setAddError('');
      queryClient.invalidateQueries({ queryKey: ['forms', projectId] });
    },
    onError: () => setAddError('Не удалось добавить учеников'),
  });

  function handleAddStudents() {
    const names = addStudentsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    addStudentsMutation.mutate(names);
  }

  function buildAllLinksText(students: FormStudentItem[]): string {
    return students
      .slice().sort((a, b) => a.variantIndex - b.variantIndex)
      .map(s => `${s.fullName} (Вариант ${s.variantIndex}): ${BASE_URL}/form/${s.accessToken}`)
      .join('\n');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '108px', paddingBottom: '24px', overflowY: 'auto' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative', background: '#fff', borderRadius: '20px',
          boxShadow: '0 8px 40px rgba(0,0,0,.18)', width: '100%', maxWidth: '520px',
          margin: '0 16px', maxHeight: 'calc(100vh - 132px)', overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 24px 16px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <h2 style={{ fontFamily: LP, fontSize: '18px', fontWeight: 700, color: '#111' }}>
            Онлайн-форма для учеников
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#888', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          {loadingExisting ? (
            <p style={{ fontFamily: LP, color: '#888', textAlign: 'center', padding: '20px 0' }}>Загрузка...</p>
          ) : assignment === null ? (
            <>
              {/* Mode selection */}
              <p style={{ fontFamily: LP, fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Режим
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {([
                  { id: 'CLASS_LIST', label: 'Список класса', desc: 'Одна ссылка, ученик вводит фамилию', tourId: 'form-mode-class' },
                  { id: 'INDIVIDUAL_LINKS', label: 'Отдельные ссылки', desc: 'Каждый вариант — своя ссылка', tourId: 'form-mode-individual' },
                ] as const).map(({ id, label, desc, tourId }) => (
                  <button
                    key={id}
                    data-tour={tourId}
                    onClick={() => setMode(id)}
                    style={{
                      flex: 1, padding: '12px', border: `2px solid ${mode === id ? '#21a038' : '#e5e7eb'}`,
                      borderRadius: '12px', background: mode === id ? '#f0faf2' : '#fff',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    }}
                  >
                    <p style={{ fontFamily: LP, fontSize: '14px', fontWeight: 700, color: mode === id ? '#21a038' : '#333', marginBottom: '4px' }}>{label}</p>
                    <p style={{ fontFamily: LP, fontSize: '12px', color: '#888' }}>{desc}</p>
                  </button>
                ))}
              </div>

              {mode === 'CLASS_LIST' && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontFamily: LP, fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                    Список учеников (по одному на строке)
                  </p>
                  <textarea
                    data-tour="form-students-textarea"
                    value={studentsText}
                    onChange={(e) => setStudentsText(e.target.value)}
                    rows={7}
                    placeholder={'Иванов Иван\nПетрова Мария\nСидоров Алексей'}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb',
                      borderRadius: '12px', fontFamily: LP, fontSize: '14px', color: '#222',
                      resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {createMutation.isError && (
                <p style={{ fontFamily: LP, color: '#e53e3e', fontSize: '14px', marginBottom: '12px' }}>
                  Не удалось создать задание. Попробуйте ещё раз.
                </p>
              )}

              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                style={{
                  width: '100%', padding: '13px', background: createMutation.isPending ? '#9ca3af' : '#21a038',
                  color: '#fff', border: 'none', borderRadius: '12px', fontFamily: LP,
                  fontSize: '15px', fontWeight: 700, cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {createMutation.isPending ? 'Создаю...' : 'Создать задание'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: LP, fontSize: '14px', color: '#21a038', fontWeight: 700, marginBottom: '20px' }}>
                ✓ Задание создано!
              </p>

              {/* CLASS_LIST: single link + student management */}
              {assignment.mode === 'CLASS_LIST' && assignment.accessToken && (
                <>
                  <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 700, color: '#555', marginBottom: '8px' }}>
                    Ссылка для всего класса:
                  </p>
                  <LinkRow label="Ссылка на задание" token={assignment.accessToken} />
                  <p style={{ fontFamily: LP, fontSize: '12px', color: '#888', margin: '4px 0 20px' }}>
                    Ученик перейдёт по ссылке и введёт свою фамилию — система откроет его вариант.
                  </p>

                  {/* Add students section */}
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '16px' }}>
                    <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '8px' }}>
                      Добавить учеников:
                    </p>
                    <textarea
                      value={addStudentsText}
                      onChange={(e) => setAddStudentsText(e.target.value)}
                      rows={4}
                      placeholder={'Кузнецов Дмитрий\nНовикова Анна'}
                      style={{
                        width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb',
                        borderRadius: '10px', fontFamily: LP, fontSize: '14px', resize: 'vertical',
                        outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
                      }}
                    />
                    {addError && <p style={{ color: '#e53e3e', fontSize: '13px', marginBottom: '8px' }}>{addError}</p>}
                    <button
                      onClick={handleAddStudents}
                      disabled={addStudentsMutation.isPending || !addStudentsText.trim()}
                      style={{
                        padding: '8px 18px', background: '#0b8acb', color: '#fff', border: 'none',
                        borderRadius: '10px', fontFamily: LP, fontSize: '14px', fontWeight: 700,
                        cursor: (addStudentsMutation.isPending || !addStudentsText.trim()) ? 'not-allowed' : 'pointer',
                        opacity: !addStudentsText.trim() ? 0.5 : 1,
                      }}
                    >
                      {addStudentsMutation.isPending ? 'Добавляю...' : 'Добавить'}
                    </button>
                  </div>

                  {/* Student list with individual links */}
                  {assignment.students.length > 0 && (
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 700, color: '#333' }}>
                          Учеников в списке: {assignment.students.length}
                        </p>
                        <CopyButton
                          text={buildAllLinksText(assignment.students)}
                          label="Скопировать все ссылки"
                        />
                      </div>
                      <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: '10px', overscrollBehavior: 'contain' }}>
                        {assignment.students
                          .slice().sort((a, b) => a.variantIndex - b.variantIndex)
                          .map((s) => <StudentLinkRow key={s.id} student={s} />)
                        }
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* INDIVIDUAL_LINKS: per-variant links */}
              {assignment.mode === 'INDIVIDUAL_LINKS' && (
                <>
                  <p style={{ fontFamily: LP, fontSize: '13px', fontWeight: 700, color: '#555', marginBottom: '10px' }}>
                    Ссылки по вариантам:
                  </p>
                  {assignment.variantTokens
                    .slice().sort((a, b) => a.variantIndex - b.variantIndex)
                    .map((vt) => (
                      <LinkRow key={vt.id} label={`Вариант ${vt.variantIndex}`} token={vt.accessToken} />
                    ))}
                </>
              )}

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => { setForceNew(true); setNewAssignment(null); setStudentsText(''); }}
                  style={{
                    flex: 1, padding: '11px', border: '1.5px solid #e5e7eb',
                    borderRadius: '12px', fontFamily: LP, fontSize: '14px', background: '#fff',
                    cursor: 'pointer', color: '#888',
                  }}
                >
                  Создать новое задание
                </button>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: '11px', border: '1.5px solid #e5e7eb',
                    borderRadius: '12px', fontFamily: LP, fontSize: '15px', background: '#fff',
                    cursor: 'pointer', color: '#555', fontWeight: 700,
                  }}
                >
                  Закрыть
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
