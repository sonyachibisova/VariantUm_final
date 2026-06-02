import { useState, useMemo, useRef, useEffect, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth.api';
import { useTour } from '../context/TourContext';
import { buildTourFromPage } from '../tour/paths/choicePath';
import { TOUR_MOCK_LIBRARY_ITEMS } from '../tour/tourMockData';
import { LimitsBadge } from '../components/LimitsBadge';
import './DashboardPage.css';

const W = 1911;
const HEADER_H = 119;

function calcLayout() {
  const vpWidth = window.visualViewport?.width ?? window.innerWidth;
  const scale = Math.min(vpWidth / W, 0.8);
  const marginLeft = Math.max(0, (vpWidth - W * scale) / 2);
  return { scale, marginLeft };
}

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

// ── Цвета и названия предметов ───────────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика', physics: 'Физика', chemistry: 'Химия',
  biology: 'Биология', russian: 'Русский язык', literature: 'Литература',
  english: 'Английский', history: 'История', social_studies: 'Обществознание',
  geography: 'География', informatics: 'Информатика', other: 'Другое',
};

const SUBJECT_BADGE_BG: Record<string, string> = {
  math: '#f6b0b1', physics: '#3d93ac', chemistry: '#0b8acb',
  biology: '#21a038', russian: '#ffdd54', literature: '#95c949',
  english: '#30b0ba', history: '#e08050', social_studies: '#f6b0b1',
  geography: '#30b0ba', informatics: '#3d93ac', other: '#8d8d8d',
};

const SUBJECT_BADGE_TEXT: Record<string, string> = {
  math: '#333', physics: '#fff', chemistry: '#fff',
  biology: '#fff', russian: '#333', literature: '#333',
  english: '#fff', history: '#fff', social_studies: '#333',
  geography: '#fff', informatics: '#fff', other: '#fff',
};

function formatDateRelative(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 14) return '1 неделю назад';
  if (diffDays < 31) return `${Math.floor(diffDays / 7)} нед. назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function variantsLabel(n: number) {
  if (n === 1) return 'вариант';
  if (n >= 2 && n <= 4) return 'варианта';
  return 'вариантов';
}

// ── Иконки ───────────────────────────────────────────────────────────────────

function IconChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="11" y2="11" />
      <line x1="11" y1="1" x2="1" y2="11" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconSort({ asc }: { asc: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {asc
        ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
        : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>
      }
    </svg>
  );
}


const SELECT_STYLE: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  paddingRight: '28px',
  cursor: 'pointer',
};

// ── Компонент ────────────────────────────────────────────────────────────────

export function LibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, clear } = useAuthStore();
  const { tourActive, startTour } = useTour();
  const menuRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (window.visualViewport?.width ?? window.innerWidth) < 768);
  const [layout, setLayout] = useState(calcLayout);
  const { scale, marginLeft } = layout;

  useEffect(() => {
    const upd = () => {
      setLayout(calcLayout());
      setIsMobile((window.visualViewport?.width ?? window.innerWidth) < 768);
    };
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
    const { steps, phaseIndex, startStep } = buildTourFromPage('library');
    startTour('library', steps, phaseIndex, startStep);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', 'library'],
    queryFn: () => projectsApi.list({ page: 0, size: 50 }),
  });

  const deleteProject = useMutation({
    mutationFn: (projectId: string) => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'library'] });
      setDeletingId(null);
    },
    onError: () => setDeletingId(null),
  });

  function handleDelete(e: MouseEvent, projectId: string) {
    e.stopPropagation();
    setDeletingId(projectId);
    deleteProject.mutate(projectId);
  }

  // Во время тура добавляем мок-элементы если список пустой, чтобы было что показать
  const realKits = data?.projects ?? [];
  const kits = tourActive && realKits.length === 0 ? TOUR_MOCK_LIBRARY_ITEMS : realKits;

  // Уникальные предметы и классы для фильтров
  const subjects = useMemo(
    () => [...new Set(kits.map(k => k.subject).filter(Boolean))] as string[],
    [kits],
  );
  const grades = useMemo(
    () => [...new Set(kits.map(k => k.grade).filter(Boolean))].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[],
    [kits],
  );
  const topics = useMemo(
    () => [...new Set(kits.map(k => (k as Record<string, unknown>).topic as string | undefined).filter(Boolean))].sort() as string[],
    [kits],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = kits.filter(k => {
      const matchSearch = !q
        || (k.title ?? '').toLowerCase().includes(q)
        || (k.subject ? (SUBJECT_LABELS[k.subject] ?? k.subject).toLowerCase().includes(q) : false);
      const matchSubject = !filterSubject || k.subject === filterSubject;
      const matchGrade = !filterGrade || String(k.grade) === filterGrade;
      const matchTopic = !filterTopic || (k as Record<string, unknown>).topic === filterTopic;
      return matchSearch && matchSubject && matchGrade && matchTopic;
    });
    result = [...result].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortAsc ? tA - tB : tB - tA;
    });
    return result;
  }, [kits, search, filterSubject, filterGrade, filterTopic, sortAsc]);

  const hasActiveFilters = search || filterSubject || filterGrade || filterTopic;

  function resetFilters() {
    setSearch('');
    setFilterSubject('');
    setFilterGrade('');
    setFilterTopic('');
  }

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

            <div ref={menuRef} style={{ position: 'relative' }}>
              {user && (
                <>
                  <button
                    className="dashboard-user-btn"
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
                      <button className="dashboard-logout-btn" onClick={handleLogout} style={{
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
                      className="mob-menu-item"
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

      {/* ── Десктопная шапка ── */}
      {!isMobile && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 200,
          height: `${HEADER_H * scale}px`,
          overflow: 'visible', background: '#fff',
        }}>
          <div style={{
            position: 'absolute',
            width: `${W}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            marginLeft: `${marginLeft}px`,
          }}>
            <div style={{
              position: 'absolute', left: '47px', top: '40px',
              width: '1817px', height: '79px',
              background: '#fff', border: '1px solid #b4b4b4',
              borderRadius: '75px', boxShadow: '0 4px 4px rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center',
              padding: '0 45px', boxSizing: 'border-box',
            }}>
              <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'flex' }}>
                <img src="/logo.png" alt="ВариантУм" style={{ height: '49px', objectFit: 'contain', display: 'block' }} />
              </button>

              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center',
              }}>
                <p
                  className="dashboard-nav-item"
                  onClick={() => navigate('/')}
                  style={{ fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', lineHeight: 1 }}
                >Главная страница</p>
                <span style={{ fontFamily: LP, fontSize: '26px', color: '#666', margin: '0 14px', userSelect: 'none', lineHeight: 1 }}>•</span>
                <p
                  style={{ fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#21a038', margin: 0, whiteSpace: 'nowrap', userSelect: 'none', lineHeight: 1 }}
                >Моя библиотека</p>
                <span style={{ fontFamily: LP, fontSize: '26px', color: '#666', margin: '0 14px', userSelect: 'none', lineHeight: 1 }}>•</span>
                <p
                  className="dashboard-nav-item"
                  onClick={handleStartTour}
                  style={{ fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap', userSelect: 'none', cursor: 'pointer', lineHeight: 1 }}
                >Инструкция</p>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                {user && <LimitsBadge scale={1} />}
                <div ref={menuRef} style={{ position: 'relative' }}>
                {user && (
                  <>
                    <button
                      className="dashboard-user-btn"
                      onClick={() => setMenuOpen(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                    >
                      <div style={{
                        width: '45px', height: '45px', borderRadius: '50%',
                        background: avatarBg(user.fullName),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ fontFamily: LP, fontWeight: 400, fontSize: '20px', color: '#fff', lineHeight: 1 }}>
                          {getInitial(user.fullName)}
                        </span>
                      </div>
                      <span style={{ fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#000', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {user.fullName}
                      </span>
                      <svg width="19" height="9" viewBox="0 0 19 9" fill="none" style={{ flexShrink: 0, transition: 'transform .2s', transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
                        <path d="M1 1L9.5 8L18 1" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {menuOpen && (
                      <div style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                        background: '#fff', border: '1px solid #e0e0e0',
                        borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,.15)',
                        minWidth: '220px', zIndex: 100, overflow: 'hidden',
                      }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                          <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '16px', margin: 0, color: '#000' }}>{user.fullName}</p>
                          <p style={{ fontFamily: LP, fontSize: '13px', margin: '2px 0 0', color: '#888' }}>{user.email}</p>
                        </div>
                        <button className="dashboard-logout-btn" onClick={handleLogout} style={{
                          width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          fontFamily: LP, fontSize: '16px', color: '#e53e3e', textAlign: 'left',
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
          </div>
        </div>
      )}

      <main
        className="max-w-3xl mx-auto px-6 py-10 font-littera"
        style={{ zoom: isMobile ? 1 : 1.5, paddingTop: isMobile ? '76px' : undefined }}
      >
        {/* Назад + заголовок — только на мобильном */}
        {isMobile && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <IconChevronLeft />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Моя библиотека</h1>
            <p className="text-xs font-light text-gray-400">{kits.length} комплектов</p>
          </div>
        </div>
        )}

        {/* Поиск + Фильтры */}
        <div data-tour="library-search-filters">
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <IconSearch />
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, предмету или теме..."
            className="w-full pl-9 pr-3 py-2 text-xs text-gray-700 border border-gray-200 rounded-xl outline-none focus:border-gray-400 transition-colors placeholder:text-gray-300 font-normal"
          />
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {/* Предмет */}
          <div className="relative">
            <select
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-xl py-1.5 pl-3 bg-white outline-none hover:border-gray-400 transition-colors font-normal"
              style={SELECT_STYLE}
            >
              <option value="">Все предметы</option>
              {subjects.map(s => (
                <option key={s} value={s}>{SUBJECT_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>

          {/* Тема */}
          <div className="relative">
            <select
              value={filterTopic}
              onChange={e => setFilterTopic(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-xl py-1.5 pl-3 bg-white outline-none hover:border-gray-400 transition-colors font-normal"
              style={SELECT_STYLE}
            >
              <option value="">Все темы</option>
              {topics.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Класс */}
          <div className="relative">
            <select
              value={filterGrade}
              onChange={e => setFilterGrade(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-xl py-1.5 pl-3 bg-white outline-none hover:border-gray-400 transition-colors font-normal"
              style={SELECT_STYLE}
            >
              <option value="">Все классы</option>
              {grades.map(g => (
                <option key={g} value={String(g)}>{g} кл</option>
              ))}
            </select>
          </div>

          {/* Сортировка */}
          <button
            onClick={() => setSortAsc(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-xl py-1.5 px-3 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors font-normal"
            title={sortAsc ? 'Сначала старые' : 'Сначала новые'}
          >
            <IconSort asc={sortAsc} />
            {sortAsc ? 'Сначала старые' : 'Сначала новые'}
          </button>

          {/* Сбросить фильтры */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors font-normal ml-1"
            >
              <IconClose />
              Сбросить
            </button>
          )}
        </div>
        </div>

        {/* Загрузка */}
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Загрузка...
          </div>
        )}

        {/* Ошибка */}
        {isError && (
          <div className="text-center py-12 text-red-500 text-sm">
            Не удалось загрузить комплекты. Попробуйте позже.
          </div>
        )}

        {/* Список */}
        {!isLoading && !isError && (
          <div className="divide-y divide-gray-200">
            {filtered.map((kit, idx) => {
              const subjectLabel = kit.subject ? (SUBJECT_LABELS[kit.subject] ?? kit.subject) : null;
              const badgeBg = kit.subject ? (SUBJECT_BADGE_BG[kit.subject] ?? '#8d8d8d') : '#8d8d8d';
              const badgeText = kit.subject ? (SUBJECT_BADGE_TEXT[kit.subject] ?? '#fff') : '#fff';
              return (
                <div
                  key={kit.projectId}
                  className="flex items-center gap-3 py-4 px-1 -mx-1"
                  {...(idx === 0 ? { 'data-tour': 'library-item' } : {})}
                >
                  <button
                    onClick={() => navigate(tourActive ? '/compare' : `/projects/${kit.projectId}`)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left hover:bg-gray-50 transition-colors rounded-lg"
                  >
                    <div className="flex-shrink-0 text-gray-400">
                      <IconFile />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">
                        {kit.title}
                      </p>
                      <p className="text-xs font-light text-gray-400 mt-0.5">
                        {kit.variantsCount} {variantsLabel(kit.variantsCount)}
                        {subjectLabel ? ` • ${subjectLabel}` : ''}
                        {kit.grade ? ` ${kit.grade} кл` : ''}
                        {' • '}{formatDateRelative(kit.createdAt)}
                      </p>
                    </div>
                    {subjectLabel && (
                      <span
                        className="flex-shrink-0 px-5 py-1.5 rounded-full text-sm font-normal"
                        style={{ backgroundColor: badgeBg, color: badgeText }}
                      >
                        {subjectLabel}
                      </span>
                    )}
                  </button>
                  {(!tourActive || idx === 0) && (
                    <button
                      data-tour={tourActive && idx === 0 ? 'library-submissions' : undefined}
                      onClick={(e) => { e.stopPropagation(); if (!tourActive) navigate(`/projects/${kit.projectId}/submissions`); }}
                      title="Ответы учеников"
                      className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-[#0b8acb] hover:bg-blue-50 transition-colors"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </button>
                  )}
                  {!tourActive && (
                    <button
                      onClick={(e) => handleDelete(e, kit.projectId)}
                      disabled={deletingId === kit.projectId}
                      title="Удалить из библиотеки"
                      className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <IconClose />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Пустое состояние */}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="font-normal text-gray-400 text-sm">
              {hasActiveFilters ? 'Ничего не найдено' : 'Комплектов пока нет'}
            </p>
            <p className="font-light text-xs text-gray-300 mt-1">
              {hasActiveFilters
                ? 'Попробуйте изменить параметры поиска'
                : 'Создайте первый комплект на главном экране'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
