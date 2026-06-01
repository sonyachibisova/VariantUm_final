import { TourStep } from '../../context/TourContext';
import { COMPARE_STEPS, EXPORT_STEPS } from './uploadPath';

export const HOME_GENERATE_STEPS: TourStep[] = [
  {
    tourId: 'home-generate',
    title: 'Создать задание по параметрам',
    body: 'Не нужно готового задания — просто укажите предмет, класс и тему, и ИИ создаст задание с нуля.',
    placement: 'bottom',
    branch: true,
    branchOptions: [
      { label: 'Показать этот путь', action: 'next' },
      { label: 'Выбрать другой способ', action: 'skip' },
    ],
  },
];

export const GENERATE_STEPS: TourStep[] = [
  {
    tourId: 'generate-main-params',
    title: 'Основные параметры',
    body: 'Укажите предмет, тему, количество вариантов и заданий. Всё обязательно — кроме класса.',
    placement: 'bottom',
    navigateTo: '/generate',
  },
  {
    tourId: 'generate-params-link',
    title: 'Дополнительные параметры',
    body: 'Здесь можно задать формат заданий, уровень сложности и комментарий для ИИ. Это необязательно — можно сразу генерировать.',
    placement: 'top',
    branch: true,
    branchOptions: [
      { label: 'Посмотреть параметры', action: { jumpTo: 'PARAMS_PHASE' } },
      { label: 'Перейти к сравнению', action: { jumpTo: 'GENERATE_COMPARE' } },
    ],
  },
];

export const PARAMS_STEPS: TourStep[] = [
  {
    tourId: 'generate-format-difficulty',
    title: 'Формат и уровень сложности',
    body: 'Выберите формат заданий (задача, тест, упражнение…) и уровень сложности: базовый, средний или продвинутый.',
    placement: 'bottom',
  },
  {
    tourId: 'generate-comment',
    title: 'Комментарий для ИИ',
    body: 'Любые пожелания: акцент на конкретные навыки, исключение тем, стиль подачи и т.д.',
    placement: 'top',
  },
];

export function buildGenerateTourSteps() {
  const steps = [...HOME_GENERATE_STEPS, ...GENERATE_STEPS];
  const PARAMS_START = steps.length;
  steps.push(...PARAMS_STEPS);
  const COMPARE_START = steps.length;
  steps.push(...COMPARE_STEPS, ...EXPORT_STEPS);
  return { steps, phaseIndex: { PARAMS_PHASE: PARAMS_START, GENERATE_COMPARE: COMPARE_START } };
}
