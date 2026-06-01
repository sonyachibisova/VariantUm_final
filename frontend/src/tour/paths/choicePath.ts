import { TourStep } from '../../context/TourContext';
import { UPLOAD_STEPS, EDITOR_STEPS, COMPARE_STEPS, EXPORT_STEPS } from './uploadPath';
import { GENERATE_STEPS, PARAMS_STEPS } from './generatePath';
import { LIBRARY_STEPS } from './libraryPath';

const WELCOME_STEP: TourStep = {
  tourId: 'home-instruction',
  title: 'Добро пожаловать в ВариантУм!',
  body: 'Здесь вы можете создавать варианты заданий тремя способами. Давайте разберём каждый.',
  placement: 'bottom',
};

export const INTRO_STEPS: TourStep[] = [
  {
    tourId: 'home-upload',
    title: 'Способ 1: загрузить задание',
    body: 'Если у вас есть готовое задание — загрузите его текстом, файлом или фото.',
    placement: 'bottom',
  },
  {
    tourId: 'home-generate',
    title: 'Способ 2: создать по параметрам',
    body: 'Укажите предмет, класс и тему — система сгенерирует задание с нуля.',
    placement: 'bottom',
  },
  {
    tourId: 'home-library',
    title: 'Способ 3: моя библиотека',
    body: 'Все созданные комплекты сохраняются в библиотеке. Выберите нужный и переходите к редактированию или экспорту.',
    placement: 'top',
  },
  {
    tourId: null,
    title: 'Выберите удобный способ',
    body: 'Нажмите на одну из карточек, чтобы изучить этот путь подробнее.',
    placement: 'bottom',
    multiChoice: true,
    choices: [
      { tourId: 'home-upload',   jumpTo: 'PATH_UPLOAD' },
      { tourId: 'home-generate', jumpTo: 'PATH_GENERATE' },
      { tourId: 'home-library',  jumpTo: 'PATH_LIBRARY' },
    ],
  },
];

export function buildFullTour(): { steps: TourStep[]; phaseIndex: Record<string, number> } {
  const allSteps: TourStep[] = [WELCOME_STEP, ...INTRO_STEPS];

  const PATH_UPLOAD = allSteps.length;
  allSteps.push(...UPLOAD_STEPS);
  const EDITOR_PHASE = allSteps.length;
  allSteps.push(...EDITOR_STEPS);
  const UPLOAD_COMPARE = allSteps.length;
  allSteps.push(...COMPARE_STEPS, ...EXPORT_STEPS);

  const PATH_GENERATE = allSteps.length;
  allSteps.push(...GENERATE_STEPS);
  const PARAMS_PHASE = allSteps.length;
  allSteps.push(...PARAMS_STEPS);
  const GENERATE_COMPARE = allSteps.length;
  allSteps.push(...COMPARE_STEPS, ...EXPORT_STEPS);

  const PATH_LIBRARY = allSteps.length;
  allSteps.push(...LIBRARY_STEPS);
  allSteps.push(...COMPARE_STEPS, ...EXPORT_STEPS);

  const phaseIndex: Record<string, number> = {
    PATH_UPLOAD,
    PATH_GENERATE,
    PATH_LIBRARY,
    EDITOR_PHASE,
    UPLOAD_COMPARE,
    PARAMS_PHASE,
    GENERATE_COMPARE,
  };

  return { steps: allSteps, phaseIndex };
}

export function buildChoiceTour() {
  return buildFullTour();
}

export function buildTourFromPage(
  page: 'home' | 'upload' | 'generate' | 'library' | 'compare' | 'editor' | 'project',
): { steps: TourStep[]; phaseIndex: Record<string, number>; startStep: number } {
  if (page === 'project') {
    // Start compare/export tour on the real project page — strip navigateTo so we stay there
    const steps: TourStep[] = [
      ...COMPARE_STEPS.map((s, i) => i === 0 ? { ...s, navigateTo: undefined } : s),
      ...EXPORT_STEPS.map(s =>
        s.branch && s.branchOptions?.some(o => o.action === 'path_done')
          ? { ...s, branchOptions: [{ label: 'Завершить инструкцию', action: 'skip' as const }] }
          : s,
      ),
    ];
    return { steps, phaseIndex: {}, startStep: 0 };
  }

  const { steps: fullSteps, phaseIndex } = buildFullTour();

  switch (page) {
    case 'upload':
      return { steps: fullSteps, phaseIndex, startStep: phaseIndex.PATH_UPLOAD };
    case 'generate':
      return { steps: fullSteps, phaseIndex, startStep: phaseIndex.PATH_GENERATE };
    case 'library':
      return { steps: fullSteps, phaseIndex, startStep: phaseIndex.PATH_LIBRARY };
    case 'compare':
      return { steps: fullSteps, phaseIndex, startStep: phaseIndex.UPLOAD_COMPARE };
    case 'editor':
      return { steps: fullSteps, phaseIndex, startStep: phaseIndex.EDITOR_PHASE };
    default:
      return { steps: fullSteps, phaseIndex, startStep: 0 };
  }
}
