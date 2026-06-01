import { apiClient } from './client';

export interface AnalysisResult {
  subject: string;
  grade: number;
  topic: string;
  taskType: string;
  difficulty: number;
  estimatedMinutes?: number | null;
  stepsCount?: number | null;
  invariants?: string[] | null;
  variableElements?: { type: string; examples: string[] }[] | null;
}

export interface SplitTask {
  text: string;
  answer?: string | null;
}

export const analyzeApi = {
  /** Авто-определение предмета, класса, темы, типа и сложности по тексту задания. */
  task: (text: string, hintSubject?: string) =>
    apiClient
      .post<AnalysisResult>('/analyze/task', { text, hintSubject: hintSubject ?? null })
      .then((r) => r.data),

  /**
   * Разбивает «сырой» текст (склейку из файлов + ручной ввод) на отдельные задания силами GigaChat.
   * Варианты ответа теста (1) 2) 3) 4)) и подпункты остаются внутри своего задания, ответы отделяются.
   */
  split: (text: string) =>
    apiClient
      .post<{ tasks: SplitTask[] }>('/analyze/split', { text })
      .then((r) => r.data.tasks ?? []),
};
