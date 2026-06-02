import { TourStep } from '../../context/TourContext';

export const HOME_PATH_CHOICE_STEPS: TourStep[] = [
  {
    tourId: 'home-instruction',
    title: 'Добро пожаловать в ВариантУм!',
    body: 'Здесь вы можете создавать варианты заданий тремя способами. Давайте разберём каждый — нажмите на нужный способ, чтобы начать.',
    placement: 'bottom',
    noHighlight: false,
  },
  {
    tourId: 'home-upload',
    title: 'Загрузить задание',
    body: 'Есть готовое задание? Вставьте текст, загрузите файл или фото — и система сама создаст варианты.',
    placement: 'bottom',
    branch: true,
    branchOptions: [
      { label: 'Показать этот путь', action: 'next' },
      { label: 'Выбрать другой способ', action: 'skip' },
    ],
  },
];

export const UPLOAD_STEPS: TourStep[] = [
  {
    tourId: 'upload-dropzone',
    title: 'Поле ввода задания',
    body: 'Введите текст задания прямо сюда или перетащите файл/фото. Поддерживаются PDF, DOCX, TXT и изображения — они распознаются автоматически.',
    placement: 'bottom',
    navigateTo: '/upload',
  },
  {
    tourId: 'upload-paperclip',
    title: 'Прикрепить файл',
    body: 'Можно одновременно написать текст и прикрепить файл. Изображения обрабатываются через OCR.',
    placement: 'right',
  },
  {
    tourId: 'upload-variant-count',
    title: 'Количество вариантов',
    body: 'Выберите, сколько вариантов нужно создать — от 2 до 10. Нажмите «+» и «−» или выберите цифру.',
    placement: 'top',
  },
  {
    tourId: 'upload-settings-link',
    title: 'Хотите настроить генерацию подробнее?',
    body: '«Просмотр и настройки» открывает расширенные параметры: что именно менять в каждой задаче, насколько сильно варьировать. Это необязательно — можно сразу генерировать.',
    placement: 'top',
    branch: true,
    branchOptions: [
      { label: 'Посмотреть настройки', action: { jumpTo: 'EDITOR_PHASE' } },
      { label: 'Пропустить, перейти к сравнению', action: { jumpTo: 'UPLOAD_COMPARE' } },
    ],
  },
];

export const EDITOR_STEPS: TourStep[] = [
  {
    tourId: 'editor-first-task',
    navigateTo: '/editor',
    title: 'Задача в комплекте',
    body: 'Вот первая задача из вашего комплекта. Нажмите на неё — откроется редактор задачи. Или нажмите «Далее», чтобы мы открыли её автоматически.',
    placement: 'bottom',
    advanceOnClick: true,
  },
  {
    tourId: 'editor-task-variation-options',
    title: 'Что менять в этой задаче',
    body: 'В раскрытой задаче можно настроить, что именно меняется при генерации: числа, имена, контекст ситуации. Каждую задачу можно настроить по-своему.',
    placement: 'bottom',
  },
  {
    tourId: 'editor-task-complexity',
    title: 'Сложность задачи',
    body: 'Для каждой задачи — своя сложность: упростить, оставить как есть или усложнить. Тоже индивидуально для каждой.',
    placement: 'top',
  },
  {
    tourId: 'editor-global-settings',
    title: 'Параметры для всего комплекта',
    body: 'А эти блоки — «Что менять в вариантах», «Сложность варианта» и «Проверять совпадение ответов» — задают параметры сразу для всех заданий комплекта, а не индивидуально для каждой задачи.',
    placement: 'top',
  },
];

export const COMPARE_STEPS: TourStep[] = [
  {
    tourId: 'compare-original',
    title: 'Исходный вариант',
    body: 'Слева — ваше исходное задание. Его тоже можно редактировать, если хотите подправить формулировки до генерации.',
    placement: 'bottom',
    navigateTo: '/compare',
  },
  {
    tourId: 'compare-variant-card',
    title: 'Сгенерированные варианты',
    body: 'Каждый вариант — отдельная колонка. Все варианты можно просматривать и редактировать прямо здесь.',
    placement: 'top',
  },
  {
    tourId: 'compare-edit-prompt-btn',
    title: 'Редактировать вариант с промптом',
    body: 'Нажмите эту кнопку, чтобы переформулировать весь вариант через запрос к ИИ. Удобно, если вариант получился слишком похожим на соседние.',
    placement: 'left',
  },
  {
    tourId: 'compare-task-edit',
    title: 'Ручное редактирование задачи',
    body: 'Каждую задачу можно отредактировать вручную — нажмите карандаш и правьте текст напрямую.',
    placement: 'left',
  },
  {
    tourId: 'compare-difficulty-badge',
    title: 'Оценка сложности',
    body: 'Система автоматически оценивает сложность каждого варианта: базовый, средний или сложный. Это помогает убедиться, что варианты равнозначны.',
    placement: 'top',
  },
  {
    tourId: 'compare-export-btn',
    title: 'Готово — переходим к экспорту',
    body: 'Когда всё устраивает — нажмите «Экспорт», чтобы скачать варианты.',
    placement: 'top',
  },
  {
    tourId: 'compare-online-form',
    title: 'Онлайн-форма для учеников',
    body: 'Кнопка «Онлайн-форма» создаёт ссылку, которую вы отправляете ученикам. Они открывают её в браузере и отвечают прямо там — их работы появятся у вас в библиотеке.',
    placement: 'top',
  },
  {
    tourId: 'form-mode-class',
    title: 'Единая ссылка для класса',
    body: 'В режиме «Список класса» создаётся одна общая ссылка. Ученик открывает её и вводит свою фамилию — система сама находит его вариант.',
    placement: 'right',
    openFormModal: true,
  },
  {
    tourId: 'form-mode-individual',
    title: 'Персональные ссылки',
    body: 'В режиме «Отдельные ссылки» для каждого ученика генерируется своя уникальная ссылка. Удобно скопировать и разослать каждому напрямую.',
    placement: 'right',
  },
  {
    tourId: 'form-students-textarea',
    title: 'Список учеников',
    body: 'Введите фамилии и имена каждого ученика — по одному на строке. Система автоматически перемешает варианты и равномерно распределит их между всеми в списке.',
    placement: 'right',
  },
];

export const EXPORT_STEPS: TourStep[] = [
  {
    tourId: 'export-header-fields',
    title: 'Поля печати',
    body: 'Отметьте, какие поля нужны на бланке: Ф.И.О. ученика, класс, дата, место для оценки. Всё необязательно.',
    placement: 'right',
    openExportModal: true,
  },
  {
    tourId: 'export-download-btn',
    title: 'Скачать!',
    body: 'Нажмите кнопку — файл будет готов через несколько секунд.',
    placement: 'left',
    branch: true,
    branchOptions: [
      { label: 'Завершить этот путь', action: 'path_done' },
    ],
  },
];

export function buildUploadTourSteps() {
  const steps = [...HOME_PATH_CHOICE_STEPS, ...UPLOAD_STEPS];
  const EDITOR_START = steps.length;
  steps.push(...EDITOR_STEPS);
  const COMPARE_START = steps.length;
  steps.push(...COMPARE_STEPS, ...EXPORT_STEPS);
  return { steps, phaseIndex: { EDITOR_PHASE: EDITOR_START, UPLOAD_COMPARE: COMPARE_START } };
}
