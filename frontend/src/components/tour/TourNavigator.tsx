import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTour } from '../../context/TourContext';

export default function TourNavigator() {
  const { tourActive, steps, currentStep } = useTour();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!tourActive || !steps.length || currentStep >= steps.length) return;
    const step = steps[currentStep];
    if (step?.navigateTo && step.navigateTo !== location.pathname) {
      navigate(step.navigateTo);
    }
  }, [currentStep, tourActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
