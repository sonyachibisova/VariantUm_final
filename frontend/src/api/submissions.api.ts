import axios from 'axios';
import { apiClient } from './client';
import type {
  FormTokenInfo,
  ResolvedVariant,
  SubmitAnswersRequest,
  Submission,
  TeacherReviewEntry,
} from '../types/api';

// Публичный клиент для эндпоинтов без авторизации (/form/*)
const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const submissionsApi = {
  // ---- Public (без авторизации) ----

  getFormInfo: (token: string) =>
    publicClient.get<FormTokenInfo>(`/form/${token}`).then((r) => r.data),

  resolveName: (token: string, name: string) =>
    publicClient.post<ResolvedVariant>(`/form/${token}/resolve-name`, { name }).then((r) => r.data),

  submitAnswers: (token: string, data: SubmitAnswersRequest) =>
    publicClient.post<Submission>(`/form/${token}/submit`, data).then((r) => r.data),

  // ---- Private (требуют JWT-cookie) ----

  listSubmissions: (projectId: string) =>
    apiClient.get<Submission[]>(`/projects/${projectId}/submissions`).then((r) => r.data),

  getSubmission: (submissionId: string) =>
    apiClient.get<Submission>(`/submissions/${submissionId}`).then((r) => r.data),

  saveReview: (submissionId: string, taskReviews: TeacherReviewEntry[]) =>
    apiClient.patch<Submission>(`/submissions/${submissionId}/review`, { taskReviews }).then((r) => r.data),
};
