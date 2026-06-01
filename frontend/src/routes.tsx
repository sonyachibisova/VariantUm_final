import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { StartPage } from './pages/StartPage';
import { FromReferencePage } from './pages/FromReferencePage';
import { FromCriteriaPage } from './pages/FromCriteriaPage';
import { EditorPage } from './pages/EditorPage';
import { ProjectEditorPage } from './pages/ProjectEditorPage';
import { LibraryPage } from './pages/LibraryPage';
import { StudentFormPage } from './pages/StudentFormPage';
import { StudentSubmissionsPage } from './pages/StudentSubmissionsPage';
import { AppLayout } from './components/layout/AppLayout';
import { useAuthStore } from './store/authStore';

function ProtectedWithLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRoute() {
  const user = useAuthStore((s) => s.user);
  return user ? <DashboardPage /> : <StartPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Публичные маршруты (без авторизации) */}
      <Route path="/form/:token" element={<StudentFormPage />} />

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Корень: начальный экран или дашборд */}
      <Route path="/" element={<RootRoute />} />

      {/* Страницы с шапкой-пилюлей через AppLayout */}
      <Route path="/upload" element={<ProtectedWithLayout><FromReferencePage /></ProtectedWithLayout>} />
      <Route path="/generate" element={<ProtectedWithLayout><FromCriteriaPage /></ProtectedWithLayout>} />
      <Route path="/editor" element={<ProtectedWithLayout><EditorPage /></ProtectedWithLayout>} />
      <Route path="/projects/:projectId" element={<ProtectedWithLayout><ProjectEditorPage /></ProtectedWithLayout>} />
      {/* /compare — тур-мод: ProjectEditorPage без реального projectId показывает мок-данные */}
      <Route path="/compare" element={<ProtectedWithLayout><ProjectEditorPage /></ProtectedWithLayout>} />
      <Route path="/library" element={<Protected><LibraryPage /></Protected>} />
      <Route path="/projects/:projectId/submissions" element={<ProtectedWithLayout><StudentSubmissionsPage /></ProtectedWithLayout>} />

      {/* Совместимость */}
      <Route path="/new" element={<Navigate to="/" replace />} />
      <Route path="/new/reference" element={<Navigate to="/upload" replace />} />
      <Route path="/new/criteria" element={<Navigate to="/generate" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
