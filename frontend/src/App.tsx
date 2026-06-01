import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TourProvider } from './context/TourContext';
import { useTour } from './context/TourContext';
import TourOverlay from './components/tour/TourOverlay';
import TourNavigator from './components/tour/TourNavigator';
import { HintFab } from './components/HintFab';
import { AppRoutes } from './routes';

function TourCloseNavigator() {
  const { tourActive } = useTour();
  const navigate = useNavigate();
  const location = useLocation();
  const prevActiveRef = useRef(tourActive);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = tourActive;
    if (wasActive && !tourActive && location.pathname === '/compare') {
      navigate('/', { replace: true });
    }
  }, [tourActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  return (
    <TourProvider>
      <AppRoutes />
      <HintFab />
      <TourOverlay />
      <TourNavigator />
      <TourCloseNavigator />
    </TourProvider>
  );
}
