import { createContext, useContext, useState } from 'react';

export interface TourStep {
  tourId: string | null;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  noHighlight?: boolean;
  multiChoice?: boolean;
  choices?: Array<{ tourId: string; jumpTo: string }>;
  branch?: boolean;
  branchOptions?: Array<{ label: string; action: string | { jumpTo: string } }>;
  navigateTo?: string;
  advanceOnClick?: boolean;
  openExportModal?: boolean;
  openFormModal?: boolean;
}

interface TourContextValue {
  tourActive: boolean;
  tourPath: string | null;
  currentStep: number;
  steps: TourStep[];
  phaseIndex: Record<string, number>;
  completedPaths: string[];
  activePath: string | null;
  skipTour: () => void;
  nextStep: () => void;
  startTour: (path: string, steps: TourStep[], phaseIdx?: Record<string, number>, startStep?: number) => void;
  setStep: (index: number) => void;
  handleBranchAction: (action: string | { jumpTo: string }) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

const ALL_PATHS = ['upload', 'generate', 'library'];
const PATH_LABELS: Record<string, string> = {
  upload: 'Загрузить задание',
  generate: 'Создать по параметрам',
  library: 'Моя библиотека',
};
const PATH_JUMP_KEYS: Record<string, string> = {
  upload: 'PATH_UPLOAD',
  generate: 'PATH_GENERATE',
  library: 'PATH_LIBRARY',
};
const JUMP_TO_PATH: Record<string, string> = {
  PATH_UPLOAD: 'upload',
  PATH_GENERATE: 'generate',
  PATH_LIBRARY: 'library',
};

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [tourActive, setTourActive] = useState(false);
  const [tourPath, setTourPath] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [phaseIndex, setPhaseIndex] = useState<Record<string, number>>({});
  const [completedPaths, setCompletedPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  function skipTour() {
    setTourActive(false);
    setTourPath(null);
    setCurrentStep(0);
    setSteps([]);
    setPhaseIndex({});
    setCompletedPaths([]);
    setActivePath(null);
  }

  function nextStep() {
    if (currentStep + 1 >= steps.length) {
      skipTour();
    } else {
      setCurrentStep(currentStep + 1);
    }
  }

  function startTour(path: string, stepsArray: TourStep[], phaseIdx: Record<string, number> = {}, startStep = 0) {
    setTourPath(path);
    setSteps(stepsArray);
    setPhaseIndex(phaseIdx);
    setCurrentStep(startStep);
    setTourActive(true);
    setCompletedPaths([]);
    setActivePath(null);
  }

  function setStep(index: number) {
    setCurrentStep(index);
  }

  function handleBranchAction(action: string | { jumpTo: string }) {
    if (action === 'next') {
      nextStep();
    } else if (action === 'skip') {
      skipTour();
    } else if (action === 'path_done') {
      const newCompleted = activePath
        ? [...new Set([...completedPaths, activePath])]
        : [...completedPaths];

      const remaining = ALL_PATHS.filter(p => !newCompleted.includes(p));

      if (remaining.length === 0) {
        skipTour();
        return;
      }

      const branchOptions: Array<{ label: string; action: string | { jumpTo: string } }> = remaining.map(p => ({
        label: PATH_LABELS[p],
        action: { jumpTo: PATH_JUMP_KEYS[p] },
      }));
      branchOptions.push({ label: 'Завершить', action: 'skip' });

      const offerStep: TourStep = {
        tourId: null,
        noHighlight: true,
        title: 'Отличная работа!',
        body: 'Хотите изучить ещё один способ создания вариантов?',
        placement: 'bottom',
        branch: true,
        branchOptions,
      };

      setCompletedPaths(newCompleted);
      setSteps(prev => [...prev, offerStep]);
      setCurrentStep(steps.length);
    } else if (action && typeof action === 'object' && 'jumpTo' in action) {
      const pathName = JUMP_TO_PATH[action.jumpTo];
      if (pathName) setActivePath(pathName);

      const target = phaseIndex[action.jumpTo];
      if (target !== undefined) {
        setStep(target);
      } else {
        skipTour();
      }
    }
  }

  return (
    <TourContext.Provider value={{
      tourActive, tourPath, currentStep, steps, phaseIndex,
      completedPaths, activePath,
      skipTour, nextStep, startTour, setStep, handleBranchAction,
    }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
