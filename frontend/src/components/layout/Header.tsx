import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api/auth.api';
import { useTour } from '../../context/TourContext';
import { buildTourFromPage } from '../../tour/paths/choicePath';
import { LimitsBadge } from '../LimitsBadge';

const LP = "'Littera Plain', sans-serif";
const W = 1911;

function calcScale() {
  return Math.min(window.innerWidth / W, 0.8);
}

const AVATAR_COLORS = ['#21a038', '#0b8acb', '#30b0ba', '#95c949'];
function avatarBg(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function getInitial(fullName: string) {
  return fullName?.trim()?.[0]?.toUpperCase() ?? '?';
}

function ChevronDown({ open, size }: { open: boolean; size: number }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 14 9" fill="none"
      style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
      <path d="M1 1L7 7L13 1" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();
  const { startTour } = useTour();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(calcScale);

  useEffect(() => {
    const upd = () => setScale(calcScale());
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);

  useEffect(() => {
    const onOut = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  function handleStartTour() {
    const path = location.pathname;
    let page: Parameters<typeof buildTourFromPage>[0];

    if (path === '/upload') page = 'upload';
    else if (path === '/generate') page = 'generate';
    else if (path === '/library') page = 'library';
    else if (path === '/compare') page = 'compare';
    else if (path === '/editor') page = 'editor';
    else if (path.startsWith('/projects/')) page = 'project';
    else page = 'home';

    const { steps, phaseIndex, startStep } = buildTourFromPage(page);
    startTour(page, steps, phaseIndex, startStep);
  }

  async function handleLogout() {
    setMenuOpen(false);
    try { await authApi.logout(); } catch { /* ignore */ }
    clear();
    navigate('/login');
  }

  const px = (v: number) => `${Math.round(v * scale)}px`;

  const navStyle = (isActive: boolean): React.CSSProperties => ({
    fontFamily: LP,
    fontWeight: 400,
    fontSize: px(30),
    color: isActive ? '#21a038' : '#000',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    lineHeight: 1,
    transition: 'color .15s',
  });

  const dot = (
    <span style={{
      fontFamily: LP, fontSize: px(26), color: '#666',
      padding: `0 ${px(14)}`, userSelect: 'none', lineHeight: 1,
    }}>
      {' • '}
    </span>
  );

  return (
    <div style={{
      padding: `${px(40)} ${px(47)} 0`,
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 200,
    }}>
      <div style={{
        height: px(79),
        background: '#fff',
        border: '1px solid #b4b4b4',
        borderRadius: px(75),
        boxShadow: '0 4px 4px rgba(0,0,0,.25)',
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${px(45)}`,
        position: 'relative',
        boxSizing: 'border-box',
      }}>

        {/* Лого */}
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
          <img src="/logo.png" alt="ВариантУм"
            style={{ height: px(49), objectFit: 'contain', display: 'block' }} />
        </button>

        {/* Навигация по центру */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', alignItems: 'center',
        }}>
          <NavLink to="/" end style={({ isActive }) => navStyle(isActive)}>
            Главная страница
          </NavLink>
          {dot}
          <NavLink to="/library" style={({ isActive }) => navStyle(isActive)}>
            Моя библиотека
          </NavLink>
          {dot}
          <span
            data-tour="home-instruction"
            onClick={handleStartTour}
            style={{ ...navStyle(false), cursor: 'pointer', userSelect: 'none' }}
          >Инструкция</span>
        </div>

        {/* Пользователь справа */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: px(16) }}>
          {user && <LimitsBadge scale={scale} />}
          <div style={{ position: 'relative' }} ref={menuRef}>
          {user ? (
            <>
              <button
                onClick={() => setMenuOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: px(10),
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: `${px(4)} ${px(8)}`, borderRadius: px(8),
                }}
              >
                <div style={{
                  width: px(45), height: px(45), borderRadius: '50%',
                  background: avatarBg(user.fullName),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontFamily: LP, fontWeight: 400, fontSize: px(20), color: '#fff', lineHeight: 1 }}>
                    {getInitial(user.fullName)}
                  </span>
                </div>

                <span style={{
                  fontFamily: LP, fontWeight: 400, fontSize: px(30), color: '#000',
                  maxWidth: px(320), overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', display: 'block',
                }}>
                  {user.fullName}
                </span>

                <ChevronDown open={menuOpen} size={Math.round(19 * scale)} />
              </button>

              {menuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: '#fff', border: '1px solid #e0e0e0',
                  borderRadius: px(16), boxShadow: '0 4px 16px rgba(0,0,0,.15)',
                  minWidth: px(220), zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{ padding: `${px(12)} ${px(16)}`, borderBottom: '1px solid #f0f0f0' }}>
                    <p style={{ fontFamily: LP, fontWeight: 700, fontSize: px(16), margin: 0, color: '#000' }}>
                      {user.fullName}
                    </p>
                    <p style={{ fontFamily: LP, fontWeight: 300, fontSize: px(13), margin: '2px 0 0', color: '#888' }}>
                      {user.email}
                    </p>
                  </div>
                  <button onClick={handleLogout} style={{
                    width: '100%', padding: `${px(10)} ${px(16)}`, background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: px(8),
                    fontFamily: LP, fontWeight: 400, fontSize: px(18), color: '#e53e3e', textAlign: 'left',
                  }}>
                    Выйти
                  </button>
                </div>
              )}
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{
              fontFamily: LP, fontWeight: 400, fontSize: px(22), color: '#21a038',
              background: 'none', border: '1px solid #21a038',
              borderRadius: px(20), padding: `${px(6)} ${px(20)}`, cursor: 'pointer',
            }}>
              Войти
            </button>
          )}
          </div>
        </div>

      </div>
    </div>
  );
}
