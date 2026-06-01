import { apiClient } from './client';

/** Расценки действий в процентах дневного лимита (зеркало бэкенда). */
export interface LimitsCosts {
  parsePerFile: number;
  taskBase: number;
  taskFormula: number;
  taskGraph: number;
  taskAvg: number;
}

export interface Limits {
  percentRemaining: number;
  percentUsed: number;
  limit: number;
  resetAt: string;
  costs: LimitsCosts;
}

export const limitsApi = {
  me: (): Promise<Limits> => apiClient.get<Limits>('/limits/me').then((r) => r.data),
};
