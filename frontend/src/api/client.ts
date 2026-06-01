import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Глобальный обработчик ошибок: 401 → редирект на /login, всё остальное прокидываем дальше
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export type ApiError = {
  error: string;
  message?: string;
  fields?: Array<{ field: string; message: string }>;
  retryAfter?: number;
};
