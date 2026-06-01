import { apiClient } from './client';
import type { User } from '../types/api';

export const authApi = {
  register: (data: { email: string; password: string; fullName: string }) =>
    apiClient.post<User>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<User>('/auth/login', data).then((r) => r.data),

  logout: () => apiClient.post<void>('/auth/logout'),

  me: () => apiClient.get<User>('/auth/me').then((r) => r.data),
};
