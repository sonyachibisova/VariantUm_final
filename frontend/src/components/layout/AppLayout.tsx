import { useState, useEffect } from 'react';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
}

function useIsMobile() {
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
  return isMobile;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  return (
    <div className="min-h-screen bg-white">
      {!isMobile && <Header />}
      <main>{children}</main>
    </div>
  );
}
