import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTour } from '../context/TourContext';
import { buildTourFromPage } from '../tour/paths/choicePath';
import { useAuthStore } from '../store/authStore';

function LightbulbIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.1 1 3 .7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

// Лампочка показывается только на этих страницах
const ALLOWED_PATHS = new Set(['/', '/upload', '/editor', '/generate', '/compare', '/library']);

function isAllowedPath(pathname: string): boolean {
  if (ALLOWED_PATHS.has(pathname)) return true;
  // /projects/:id — редактор проекта (но не /projects/:id/submissions)
  if (/^\/projects\/[^/]+$/.test(pathname)) return true;
  return false;
}

export function HintFab() {
  const location = useLocation();
  const { tourActive, startTour } = useTour();
  const user = useAuthStore((s) => s.user);
  const [isMobile, setIsMobile] = useState(
    () => (window.visualViewport?.width ?? window.innerWidth) < 768,
  );

  useEffect(() => {
    const upd = () => setIsMobile((window.visualViewport?.width ?? window.innerWidth) < 768);
    window.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('resize', upd);
    return () => {
      window.removeEventListener('resize', upd);
      window.visualViewport?.removeEventListener('resize', upd);
    };
  }, []);

  if (tourActive || !isAllowedPath(location.pathname) || !user) return null;

  function handleClick() {
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

  return (
    <button
      onClick={handleClick}
      title="Инструкция"
      aria-label="Открыть инструкцию"
      style={{
        position: 'fixed',
        right: isMobile ? '16px' : '28px',
        top: isMobile ? '70px' : '112px',
        zIndex: 55,
        width: isMobile ? '42px' : '48px',
        height: isMobile ? '42px' : '48px',
        borderRadius: '50%',
        background: '#21a038',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 3px 10px rgba(0,0,0,0.28)',
      }}
    >
      <LightbulbIcon />
    </button>
  );
}
