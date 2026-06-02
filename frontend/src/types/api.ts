// Общие типы API — должны соответствовать docs/05_API_спецификация.md

export type User = {
  userId: string;
  email: string;
  fullName: string;
  role?: string;
};

export type Subject =
  | 'math' | 'physics' | 'chemistry' | 'biology'
  | 'russian' | 'literature' | 'english'
  | 'history' | 'social_studies' | 'geography'
  | 'informatics' | 'other';

export type TaskType = 'PROBLEM' | 'TEST' | 'EXERCISE' | 'OPEN_QUESTION' | 'MIXED';
export type DifficultyGradation = 'EQUAL' | 'ASCENDING' | 'CUSTOM';
export type Mode = 'FROM_REFERENCE' | 'FROM_CRITERIA';
export type ProjectStatus = 'GENERATING' | 'READY' | 'FAILED';

export type VariationType = 'NUMBERS' | 'NAMES' | 'CONTEXT' | 'ORDER' | 'LEXIS';

/**
 * Структурированное описание геометрической фигуры или графика функции.
 * Ключ `type` определяет тип. Поддерживаемые значения:
 *   "triangle" | "quadrilateral" | "circle" | "coordinatePlane" | "numberLine"
 * Остальные ключи — параметры, специфичные для типа.
 */
/**
 * "geometry" — универсальный тип для произвольных геометрических фигур.
 * points: именованные точки с координатами (любые числа, нормализация автоматическая).
 * segments: рёбра в формате "A-B".
 * labels: дополнительные текстовые метки (номера углов и т.п.) в тех же координатах.
 * rightAngle: true в точке — ставит маркер прямого угла (ориентируется по сегментам).
 */
export type FigureData = {
  type: 'triangle' | 'quadrilateral' | 'circle' | 'coordinatePlane' | 'numberLine' | 'geometry';
  [key: string]: unknown;
};

export type Task = {
  taskId: string;
  text: string;
  answer?: string;
  steps?: number;
  estimatedMinutes?: number;
  difficulty?: number;
  taskType?: TaskType;
  /** Структурированные данные фигуры/графика для SVG-рендера. null = нет чертежа. */
  figure?: FigureData | null;
  /** URL или base64 data-URL прикреплённого фото. null/undefined = нет фото. */
  photoUrl?: string | null;
};

export type Variant = {
  variantId: string;
  index: number;
  difficulty?: number;
  totalEstimatedMinutes?: number;
  tasks: Task[];
};

export type Recommendation = {
  type: 'DIFFICULTY_OUTLIER' | 'DUPLICATE_ANSWER' | 'TIME_MISMATCH' | 'ADD_VARIATION' | 'CUSTOM';
  variantIndex?: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
};

export type Project = {
  projectId: string;
  title: string;
  mode: Mode;
  status: ProjectStatus;
  subject?: string;
  grade?: number;
  topic?: string;
  referenceText?: string;
  referenceFileId?: string;
  referenceFileName?: string;
  createdAt: string;
  updatedAt: string;
  variants: Variant[];
  recommendations: Recommendation[];
};

// ---- Запросы редактирования вариантов ----

export type TaskPatch = {
  taskId: string;
  text?: string;
  answer?: string;
  steps?: number;
  estimatedMinutes?: number;
  difficulty?: number;
  /** URL или base64 data-URL прикреплённого фото. "" = удалить фото. */
  photoUrl?: string;
};

export type UpdateVariantRequest = {
  difficulty?: number;
  tasks: TaskPatch[];
};

export type AiEditRequest = { prompt: string };

export type VariantActionRequest = {
  difficulty?: number;
  customPrompt?: string;
};

// ---- Экспорт ----

export type ExportField =
  | 'studentName' | 'className' | 'date' | 'grade' | 'parentSignature';

export type ExportLayout = 'ONE_PER_PAGE' | 'CONTINUOUS';

export type ExportRequest = {
  includeFields: ExportField[];
  layout: ExportLayout;
  includeAnswers: boolean;
  includeCriteria?: boolean;
  showDifficulty?: boolean;
  kitName?: string;
};

export type ProjectListItem = {
  projectId: string;
  title: string;
  subject?: string;
  grade?: number;
  variantsCount: number;
  createdAt: string;
};

// ---- Онлайн-формы ----

export type FormMode = 'CLASS_LIST' | 'INDIVIDUAL_LINKS';

export type FormStudentItem = {
  id: string;
  fullName: string;
  variantId: string;
  variantIndex: number;
  accessToken: string;
};

export type FormVariantTokenItem = {
  id: string;
  variantId: string;
  variantIndex: number;
  accessToken: string;
};

export type FormAssignment = {
  id: string;
  projectId: string;
  mode: FormMode;
  accessToken?: string; // CLASS_LIST only
  createdAt: string;
  students: FormStudentItem[];
  variantTokens: FormVariantTokenItem[];
};

export type PublicTask = {
  taskId: string;
  text: string;
  taskType?: TaskType;
  estimatedMinutes?: number;
  answerHint?: string | null;
};

export type FormTokenInfo = {
  tokenType: 'CLASS_LIST' | 'VARIANT';
  assignmentId: string;
  projectTitle: string;
  variantIndex?: number;
  tasks?: PublicTask[];
};

export type ResolvedVariant = {
  studentId: string;
  studentName: string;
  variantId: string;
  variantIndex: number;
  tasks: PublicTask[];
  studentAccessToken?: string;
  alreadySubmitted: boolean;
};

export type TaskAnswer = {
  taskId: string;
  answer: string;
};

export type SubmitAnswersRequest = {
  studentName: string;
  studentId?: string;
  answers: TaskAnswer[];
};

export type AutoScoreEntry = {
  taskId: string;
  correct: boolean | null;
};

export type CorrectAnswerEntry = {
  taskId: string;
  expectedAnswer: string;
};

export type TeacherReviewEntry = {
  taskId: string;
  comment?: string;
  grade?: string;
  overrideCorrect?: boolean | null;
};

export type AttachmentInfo = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export type SubmissionTask = {
  taskId: string;
  text: string;
  taskType: string;
  index: number;
};

export type Submission = {
  id: string;
  assignmentId: string;
  variantId: string;
  variantIndex: number;
  studentName: string;
  answersJson: string;
  autoScore?: string;
  teacherReview?: string;
  submittedAt: string;
  correctAnswersJson?: string;
  tasksJson?: string;
  attachmentsJson?: string;
};

export type CreateFormAssignmentRequest = {
  mode: FormMode;
  students?: string[];
};

// ---- Запросы создания проектов ----

export type CreateProjectRequest =
  | {
      mode: 'FROM_REFERENCE';
      referenceText: string;
      analysis: {
        subject: Subject;
        grade: number;
        topic: string;
        taskType: TaskType;
        difficulty: number;
      };
      params: {
        variantsCount: number;
        tasksPerVariant?: number;
        variationTypes: VariationType[];
        fixedElements?: string[];
        difficultyGradation: DifficultyGradation;
        difficultyLevels?: number[];
        customPrompt?: string;
      };
    }
  | {
      mode: 'FROM_CRITERIA';
      criteria: {
        subject: Subject;
        grade: number;
        topic: string;
        taskType: TaskType;
        tasksPerVariant: number;
        targetTimeMinutes: number;
        difficulty: number;
      };
      params: {
        variantsCount: number;
        difficultyGradation: DifficultyGradation;
        difficultyLevels?: number[];
        customPrompt?: string;
      };
    };
