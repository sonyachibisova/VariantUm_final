import { TourStep } from '../../context/TourContext';
import { COMPARE_STEPS, EXPORT_STEPS } from './uploadPath';

export const HOME_LIBRARY_STEPS: TourStep[] = [
  {
    tourId: 'home-library',
    title: 'Моя библиотека',
    body: 'Все созданные вами комплекты сохраняются в библиотеке. Выберите нужный и сразу переходите к редактированию или экспорту.',
    placement: 'top',
    branch: true,
    branchOptions: [
      { label: 'Показать этот путь', action: 'next' },
      { label: 'Выбрать другой способ', action: 'skip' },
    ],
  },
];

export const LIBRARY_STEPS: TourStep[] = [
  {
    tourId: 'library-search-filters',
    title: 'Поиск и фильтры',
    body: 'Ищите по теме, предмету или классу. Используйте фильтры для сужения выборки по предмету, классу или дате создания.',
    placement: 'bottom',
    navigateTo: '/library',
  },
  {
    tourId: 'library-item',
    title: 'Карточка комплекта',
    body: 'Каждый комплект содержит несколько вариантов. Нажмите на карточку — попадёте на экран сравнения, где можно отредактировать варианты и сразу экспортировать.',
    placement: 'right',
  },
  {
    tourId: 'library-submissions',
    title: 'Ответы учеников',
    body: 'Кнопка с силуэтами людей открывает страницу с работами учеников. Если вы поделились онлайн-формой — их ответы собираются именно здесь.',
    placement: 'left',
  },
];

export function buildLibraryTourSteps() {
  const steps = [...HOME_LIBRARY_STEPS, ...LIBRARY_STEPS];
  const COMPARE_START = steps.length;
  steps.push(...COMPARE_STEPS, ...EXPORT_STEPS);
  return { steps, phaseIndex: { COMPARE_PHASE: COMPARE_START } };
}
