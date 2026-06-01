import type { Project, ProjectListItem } from '../types/api';

export const TOUR_MOCK_REFERENCE_TEXT =
  'Задача 1. Решите уравнение: 2x + 5 = 15\n\nЗадача 2. Найдите значение выражения: 3a² − 2a + 1 при a = 4';

export const TOUR_MOCK_TASK_TEXTS: Array<{ id: number; fullText: string; answer: string }> = [
  { id: 1, fullText: 'Задача 1. Решите уравнение: 2x + 5 = 15', answer: 'x = 5' },
  { id: 2, fullText: 'Задача 2. Найдите значение выражения: 3a² − 2a + 1 при a = 4', answer: '41' },
];

export const TOUR_MOCK_LIBRARY_ITEMS: ProjectListItem[] = [
  {
    projectId: 'tour-lib-1',
    title: 'Уравнения с двумя неизвестными',
    subject: 'math',
    grade: 7,
    variantsCount: 4,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    projectId: 'tour-lib-2',
    title: 'Правописание -н- и -нн-',
    subject: 'russian',
    grade: 8,
    variantsCount: 3,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    projectId: 'tour-lib-3',
    title: 'Закон Ньютона',
    subject: 'physics',
    grade: 9,
    variantsCount: 3,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
];

export const TOUR_MOCK_PROJECT: Project = {
  projectId: 'tour-mock',
  title: 'Уравнения — демо',
  mode: 'FROM_REFERENCE',
  status: 'READY',
  subject: 'math',
  grade: 7,
  topic: 'Уравнения',
  referenceText: TOUR_MOCK_REFERENCE_TEXT,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  variants: [
    {
      variantId: 'tour-v1',
      index: 1,
      difficulty: 2,
      tasks: [
        { taskId: 'tour-t1-1', text: 'Решите уравнение: 3x + 7 = 22', answer: 'x = 5' },
        { taskId: 'tour-t1-2', text: 'Найдите значение выражения: 2b² − 3b + 2 при b = 3', answer: '11' },
      ],
    },
    {
      variantId: 'tour-v2',
      index: 2,
      difficulty: 2,
      tasks: [
        { taskId: 'tour-t2-1', text: 'Решите уравнение: 5y − 3 = 12', answer: 'y = 3' },
        { taskId: 'tour-t2-2', text: 'Найдите значение выражения: 4c² − c + 5 при c = 2', answer: '19' },
      ],
    },
    {
      variantId: 'tour-v3',
      index: 3,
      difficulty: 3,
      tasks: [
        { taskId: 'tour-t3-1', text: 'Решите уравнение: 4z − 9 = 7', answer: 'z = 4' },
        { taskId: 'tour-t3-2', text: 'Найдите значение выражения: 5d² + 2d − 1 при d = 2', answer: '23' },
      ],
    },
    {
      variantId: 'tour-v4',
      index: 4,
      difficulty: 3,
      tasks: [
        { taskId: 'tour-t4-1', text: 'Решите уравнение: 6w + 4 = 28', answer: 'w = 4' },
        { taskId: 'tour-t4-2', text: 'Найдите значение выражения: 3e² − 5e + 4 при e = 3', answer: '16' },
      ],
    },
  ],
  recommendations: [],
};
