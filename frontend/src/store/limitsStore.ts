import { create } from 'zustand';
import { limitsApi, type Limits } from '../api/limits.api';

const DEFAULT_AVG = 0.35;
const DEFAULT_PARSE = 2;

type LimitsState = {
  limits: Limits | null;
  loading: boolean;
  /** Перечитать остаток лимита с сервера (после каждого действия с нейросетью). */
  refresh: () => Promise<void>;
  /** Примерная стоимость генерации/правки: варианты × задания × средний вес. */
  estimateGeneration: (variants: number, tasksPerVariant: number) => number;
  /** Примерная стоимость парсинга файлов. */
  estimateParse: (files: number) => number;
};

export const useLimitsStore = create<LimitsState>((set, get) => ({
  limits: null,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const l = await limitsApi.me();
      set({ limits: l });
    } catch {
      /* лимиты — некритичный индикатор, тихо игнорируем ошибку */
    } finally {
      set({ loading: false });
    }
  },
  estimateGeneration: (variants, tasksPerVariant) => {
    const avg = get().limits?.costs.taskAvg ?? DEFAULT_AVG;
    return Math.max(1, variants) * Math.max(1, tasksPerVariant) * avg;
  },
  estimateParse: (files) => (get().limits?.costs.parsePerFile ?? DEFAULT_PARSE) * Math.max(1, files),
}));

/** Округляет проценты до 1 знака для показа. */
export function fmtPercent(v: number | undefined | null): string {
  if (v == null) return '—';
  return (Math.round(v * 10) / 10).toString();
}
