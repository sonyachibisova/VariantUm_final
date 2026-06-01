import { Navigate } from 'react-router-dom';
// ModeSelectionPage → теперь главная страница сама является выбором режима
export function ModeSelectionPage() {
  return <Navigate to="/" replace />;
}
