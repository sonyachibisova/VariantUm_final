import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth.api';
import { useTour } from '../context/TourContext';
import { buildFullTour, buildTourFromPage } from '../tour/paths/choicePath';
import { LimitsBadge } from '../components/LimitsBadge';
import './DashboardPage.css';

const LP = "'Littera Plain', sans-serif";
const W = 1911;
const H = 1373;

// ── Мобильные иконки для гамбургер-меню ──────────────────────────────────────

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

function calcLayout() {
  const vpWidth = window.visualViewport?.width ?? window.innerWidth;
  const scale = Math.min(vpWidth / W, 0.8);
  const marginLeft = Math.max(0, (vpWidth - W * scale) / 2);
  return { scale, marginLeft };
}

// ── Аватар ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#21a038', '#0b8acb', '#30b0ba', '#95c949'];
function avatarBg(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function getInitial(fullName: string) {
  return fullName?.trim()?.[0]?.toUpperCase() ?? '?';
}

// ── Цвета и метки предметов ──────────────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Математика', physics: 'Физика', chemistry: 'Химия',
  biology: 'Биология', russian: 'Русский язык', literature: 'Литература',
  english: 'Английский', history: 'История', social_studies: 'Обществознание',
  geography: 'География', informatics: 'Информатика', other: 'Другое',
};

const SUBJECT_BADGE_COLORS: Record<string, string> = {
  math: '#f6b0b1', physics: '#3d93ac', chemistry: '#0b8acb',
  biology: '#21a038', russian: '#ffdd54', literature: '#95c949',
  english: '#30b0ba', history: '#e08050', social_studies: '#f6b0b1',
  geography: '#30b0ba', informatics: '#3d93ac', other: '#8d8d8d',
};

const SUBJECT_TEXT_COLORS: Record<string, string> = {
  math: '#333', physics: '#fff', chemistry: '#fff',
  biology: '#fff', russian: '#333', literature: '#333',
  english: '#fff', history: '#fff', social_studies: '#333',
  geography: '#fff', informatics: '#fff', other: '#fff',
};

function formatDateRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 14) return '1 неделю назад';
  return `${Math.floor(diffDays / 7)} нед. назад`;
}

function variantsLabel(n: number) {
  if (n === 1) return 'вариант';
  if (n >= 2 && n <= 4) return 'варианта';
  return 'вариантов';
}

// ── Иконки (SVG) ─────────────────────────────────────────────────────────────

function IcoUpload() {
  return (
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#21a038" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IcoFile() {
  return (
    <svg width="49" height="49" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();
  const { startTour } = useTour();
  const [layout, setLayout] = useState(calcLayout);
  const { scale, marginLeft } = layout;
  const [menuOpen, setMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (window.visualViewport?.width ?? window.innerWidth) < 768);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset iOS auto-zoom that persists after navigating away from a focused input
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const orig = viewport.getAttribute('content') ?? '';
      viewport.setAttribute('content', orig + ', maximum-scale=1');
      setTimeout(() => viewport.setAttribute('content', orig), 100);
    }
    window.scrollTo(0, 0);
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
    if (!localStorage.getItem('isNewUser')) return;
    const timer = setTimeout(() => {
      localStorage.removeItem('isNewUser');
      const { steps, phaseIndex } = buildFullTour();
      startTour('choice', steps, phaseIndex);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onOut = (e: MouseEvent) => {
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
    const { steps, phaseIndex, startStep } = buildTourFromPage('home');
    startTour('home', steps, phaseIndex, startStep);
  }

  const { data } = useQuery({
    queryKey: ['projects-recent'],
    queryFn: () => projectsApi.list({ page: 0, size: 5 }),
  });

  const recentProjects = data?.projects ?? [];

  // ── МОБИЛЬНЫЙ РЕНДЕР ──────────────────────────────────────────────────────
  if (isMobile) {
    const mobCard: React.CSSProperties = {
      background: '#fff',
      border: '1px solid rgba(198,194,194,0.54)',
      borderRadius: '13px',
      boxShadow: '0 4px 14px -1px rgba(0,0,0,0.25)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      padding: '16px 20px',
      gap: '16px',
    };

    return (
      <div style={{ minHeight: '100vh', background: '#fff', fontFamily: LP, overflowX: 'hidden' }}>

        {/* ── Фиксированная шапка ── */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '60px',
          background: '#fff', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', padding: '0 16px',
          justifyContent: 'space-between', zIndex: 50,
        }}>
          {/* Гамбургер + логотип */}
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

          {/* Пользователь */}
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
            {/* Затемняющий overlay */}
            <div
              onClick={() => setHamburgerOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.32)', zIndex: 200,
              }}
            />
            {/* Боковая панель */}
            <div style={{
              position: 'fixed', left: 0, top: 0, bottom: 0,
              width: '62%', maxWidth: '280px',
              background: '#fff', zIndex: 201,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Шапка ящика */}
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
                <button onClick={() => { setHamburgerOpen(false); navigate('/'); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                  <img src="/logo.png" alt="ВариантУм" style={{ height: '30px', objectFit: 'contain' }} />
                </button>
              </div>

              {/* Пункты меню */}
              <nav style={{ flex: 1, overflowY: 'auto' }}>
                {[
                  { icon: <MobHomeIcon />, label: 'Главная страница', action: () => { setHamburgerOpen(false); navigate('/'); } },
                  { icon: <MobBookIcon />, label: 'Моя библиотека', action: () => { setHamburgerOpen(false); navigate('/library'); } },
                  { icon: <MobQuestionIcon />, label: 'Инструкция', action: () => { setHamburgerOpen(false); handleStartTour(); } },
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

        {/* ── Основной контент ── */}
        <div style={{ paddingTop: '60px' }}>
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Карточка 1: Загрузить задание */}
            <div className="dashboard-card" data-tour="home-upload" onClick={() => navigate('/upload')} style={mobCard}>
              <div style={{ width: '48px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#21a038" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '17px', color: '#000', margin: 0 }}>Загрузить задание</p>
                <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, margin: '4px 0 0', lineHeight: 1.3 }}>Текст, файл или фото задания</p>
              </div>
            </div>

            {/* Карточка 2: Создать по параметрам */}
            <div className="dashboard-card" data-tour="home-generate" onClick={() => navigate('/generate')} style={mobCard}>
              <div style={{
                width: '48px', height: '48px', flexShrink: 0,
                background: '#21a038', borderRadius: '7px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z" />
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '17px', color: '#000', margin: 0 }}>Создать по параметрам</p>
                <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, margin: '4px 0 0', lineHeight: 1.3 }}>Укажите предмет, класс и тему</p>
              </div>
            </div>

            {/* Карточка 3: Моя библиотека */}
            <div className="dashboard-card" data-tour="home-library" onClick={() => navigate('/library')} style={mobCard}>
              <div style={{ width: '48px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#21a038" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '17px', color: '#000', margin: 0 }}>Моя библиотека</p>
                <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, margin: '4px 0 0', lineHeight: 1.3 }}>Сохраненные комплекты и задания</p>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 1L7 7L1 13" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* ── Последние комплекты ── */}
          <div style={{ padding: '0 16px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '18px', color: '#000', margin: 0 }}>Последние комплекты</p>
              <div
                className="dashboard-all-link"
                onClick={() => navigate('/library')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontFamily: LP, fontSize: '15px', color: '#000' }}>Все</span>
                <svg width="16" height="10" viewBox="0 0 26 16" fill="none">
                  <path d="M1 8H25M17 1L25 8L17 15" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {recentProjects.length === 0 ? (
              <p style={{ fontFamily: LP, fontWeight: 300, fontSize: '15px', color: '#9ca3af', margin: '24px 0' }}>
                Здесь появятся последние созданные комплекты
              </p>
            ) : (
              recentProjects.map((project) => {
                const subjectLabel = project.subject ? (SUBJECT_LABELS[project.subject] ?? project.subject) : null;
                const badgeBg = project.subject ? (SUBJECT_BADGE_COLORS[project.subject] ?? '#8d8d8d') : '#8d8d8d';
                const badgeTextColor = project.subject ? (SUBJECT_TEXT_COLORS[project.subject] ?? '#fff') : '#fff';
                return (
                  <div key={project.projectId}>
                    <div
                      className="dashboard-list-item"
                      onClick={() => navigate(`/projects/${project.projectId}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 4px', cursor: 'pointer' }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '15px', color: '#000', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.title}
                        </p>
                        <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, margin: '3px 0 0', lineHeight: 1.2 }}>
                          {project.variantsCount} {variantsLabel(project.variantsCount)}
                          {project.grade ? ` • ${project.grade} кл` : ''}
                          {' • '}{formatDateRelative(project.createdAt)}
                        </p>
                      </div>
                      {subjectLabel && (
                        <div style={{
                          flexShrink: 0, background: badgeBg, borderRadius: '8px',
                          padding: '4px 10px',
                        }}>
                          <span style={{ fontFamily: LP, fontWeight: 400, fontSize: '12px', color: badgeTextColor, whiteSpace: 'nowrap' }}>
                            {subjectLabel}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ height: '1px', background: '#e5e7eb' }} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }
  // ── КОНЕЦ МОБИЛЬНОГО РЕНДЕРА ──────────────────────────────────────────────

  const cardBase: React.CSSProperties = {
    background: '#fff',
    border: '1px solid rgba(198,194,194,0.54)',
    borderRadius: '13px',
    boxShadow: '0 4px 13.9px -1px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  };

  const badgeTextStyle: React.CSSProperties = {
    fontFamily: LP, fontWeight: 400, fontSize: '26px', color: '#fff',
    margin: 0, whiteSpace: 'nowrap',
  };

  const HEADER_H = 119; // 40px top offset + 79px pill bar

  return (
    <>
      {/* ═══ STICKY HEADER (outside scaled canvas) ═══ */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        height: `${HEADER_H * scale}px`,
        overflow: 'visible',
        background: '#fff',
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
          {/* Логотип */}
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'flex' }}>
            <img src="/logo.png" alt="ВариантУм" style={{
              height: '49px', objectFit: 'contain', display: 'block',
            }} />
          </button>

          {/* Навигация по центру */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center',
          }}>
            <p
              className="dashboard-nav-item"
              onClick={() => navigate('/')}
              style={{
                fontFamily: LP, fontWeight: 400, fontSize: '30px',
                color: '#21a038', margin: 0, whiteSpace: 'nowrap',
                cursor: 'pointer', userSelect: 'none', lineHeight: 1,
              }}
            >Главная страница</p>
            <span style={{ fontFamily: LP, fontSize: '26px', color: '#666', margin: '0 14px', userSelect: 'none', lineHeight: 1 }}>•</span>
            <p
              className="dashboard-nav-item"
              onClick={() => navigate('/library')}
              style={{
                fontFamily: LP, fontWeight: 400, fontSize: '30px',
                color: '#000', margin: 0, whiteSpace: 'nowrap',
                cursor: 'pointer', userSelect: 'none', lineHeight: 1,
              }}
            >Моя библиотека</p>
            <span style={{ fontFamily: LP, fontSize: '26px', color: '#666', margin: '0 14px', userSelect: 'none', lineHeight: 1 }}>•</span>
            <p
              className="dashboard-nav-item"
              data-tour="home-instruction"
              onClick={handleStartTour}
              style={{
                fontFamily: LP, fontWeight: 400, fontSize: '30px',
                color: '#000', margin: 0, whiteSpace: 'nowrap',
                userSelect: 'none', cursor: 'pointer', lineHeight: 1,
              }}
            >Инструкция</p>
          </div>

          {/* Пользователь справа */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            {user && <LimitsBadge scale={1} />}
            <div ref={menuRef} style={{ position: 'relative' }}>
            {user && (
              <>
                <button
                  className="dashboard-user-btn"
                  onClick={() => setMenuOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  }}
                >
                  <div style={{
                    width: '45px', height: '45px', borderRadius: '50%',
                    background: avatarBg(user.fullName),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontFamily: LP, fontWeight: 400, fontSize: '20px', color: '#fff', lineHeight: 1 }}>
                      {getInitial(user.fullName)}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#000',
                    maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', display: 'block',
                  }}>
                    {user.fullName}
                  </span>
                  <svg width="19" height="9" viewBox="0 0 19 9" fill="none" style={{
                    flexShrink: 0, transition: 'transform .2s',
                    transform: menuOpen ? 'rotate(180deg)' : 'none',
                  }}>
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
          </div>{/* end header pill */}
        </div>{/* end scaled wrapper */}
      </div>{/* end sticky header */}

      {/* ═══ CANVAS (content without header) ═══ */}
      <div style={{
        width: '100vw',
        height: `${(H - HEADER_H) * scale}px`,
        overflow: 'hidden',
        background: '#fff',
      }}>
        <div style={{
          position: 'relative',
          width: `${W}px`,
          height: `${H - HEADER_H}px`,
          background: '#fff',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          marginLeft: `${marginLeft}px`,
        }}>

        {/* ═══ КАРТОЧКА 1: Загрузить задание ═══ */}
        <div
          className="dashboard-card"
          data-tour="home-upload"
          onClick={() => navigate('/upload')}
          style={{
            position: 'absolute', left: '397px', top: '81px',
            width: '549.44px', height: '136px',
            ...cardBase, padding: '0 30px', gap: '24px',
          }}
        >
          <div style={{
            width: '64px', height: '62px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IcoUpload />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
            <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap' }}>
              Загрузить задание
            </p>
            <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, fontSize: '26px', margin: 0, whiteSpace: 'nowrap', lineHeight: 1 }}>
              Текст, файл или фото задания
            </p>
          </div>
        </div>

        {/* ═══ КАРТОЧКА 2: Создать по параметрам ═══ */}
        <div
          className="dashboard-card"
          data-tour="home-generate"
          onClick={() => navigate('/generate')}
          style={{
            position: 'absolute', left: '964px', top: '81px', //120
            width: '549.44px', height: '136px',
            ...cardBase, padding: '0 30px', gap: '24px',
          }}
        >
          <div style={{
            width: '64px', height: '62px', flexShrink: 0,
            background: '#21a038', borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="33" height="31" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
            <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap' }}>
              Создать по параметрам
            </p>
            <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, fontSize: '26px', margin: 0, whiteSpace: 'nowrap', lineHeight: 1 }}>
              Укажите предмет, класс и тему
            </p>
          </div>
        </div>

        {/* ═══ КАРТОЧКА: Моя библиотека ═══ */}
        <div
          className="dashboard-card"
          data-tour="home-library"
          onClick={() => navigate('/library')}
          style={{
            position: 'absolute', left: '397px', top: '232px', //271
            width: '1114px', height: '136px',
            ...cardBase, padding: '0 36px', gap: '24px',
          }}
        >
          <div style={{
            width: '68px', height: '68px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#21a038" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
            <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap' }}>
              Моя библиотека
            </p>
            <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, fontSize: '26px', margin: 0, whiteSpace: 'nowrap', lineHeight: 1 }}>
              Сохраненные комплекты и задания
            </p>
          </div>
          <svg width="14" height="24" viewBox="0 0 14 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 2L12 12L2 22" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* ═══ ПОСЛЕДНИЕ КОМПЛЕКТЫ — заголовок ═══ */}
        <div style={{
          position: 'absolute', left: '378px', top: '456px',
          width: '1133px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '30px', color: '#000', margin: 0, whiteSpace: 'nowrap' }}>
            Последние комплекты
          </p>
          <div
            className="dashboard-all-link"
            onClick={() => navigate('/library')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}
          >
            <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '26px', color: '#000', margin: 0 }}>Все</p>
            <svg width="26" height="16" viewBox="0 0 26 16" fill="none">
              <path d="M1 8H25M17 1L25 8L17 15" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* ═══ СПИСОК ПОСЛЕДНИХ КОМПЛЕКТОВ ═══ */}
        <div style={{
          position: 'absolute', left: '378px', top: '529px',
          width: '1133px', display: 'flex', flexDirection: 'column',
        }}>
          {recentProjects.length === 0 ? (
            <p style={{ fontFamily: LP, fontWeight: 300, fontSize: '26px', color: '#9ca3af', margin: '40px 0' }}>
              Здесь появятся последние созданные комплекты
            </p>
          ) : (
            recentProjects.map((project) => {
              const subjectLabel = project.subject ? (SUBJECT_LABELS[project.subject] ?? project.subject) : null;
              const badgeBg = project.subject ? (SUBJECT_BADGE_COLORS[project.subject] ?? '#8d8d8d') : '#8d8d8d';
              const badgeTextColor = project.subject ? (SUBJECT_TEXT_COLORS[project.subject] ?? '#fff') : '#fff';
              return (
                <div key={project.projectId}>
                  <div
                    className="dashboard-list-item"
                    onClick={() => navigate(`/projects/${project.projectId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '20px', minHeight: '130px', cursor: 'pointer' }}
                  >
                    <IcoFile />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                      <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '26px', color: '#000', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.title}
                      </p>
                      <p className="text-xs font-light text-gray-400" style={{ fontFamily: LP, fontSize: '26px', margin: 0, whiteSpace: 'nowrap', lineHeight: 1 }}>
                        {project.variantsCount} {variantsLabel(project.variantsCount)}
                        {project.grade ? ` • ${project.grade} кл` : ''}
                        {' • '}{formatDateRelative(project.createdAt)}
                      </p>
                    </div>
                    {subjectLabel && (
                      <div style={{
                        width: '284px', height: '47px', flexShrink: 0,
                        background: badgeBg, borderRadius: '15px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <p style={{ ...badgeTextStyle, color: badgeTextColor }}>{subjectLabel}</p>
                      </div>
                    )}
                  </div>
                  <div style={{ width: '100%', height: '1px', background: '#d1d5db', flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>

        </div>
      </div>
    </>
  );
}
