import { apiClient } from './client';
import type {
  CreateFormAssignmentRequest,
  FormAssignment,
} from '../types/api';

export const formsApi = {
  createAssignment: (projectId: string, data: CreateFormAssignmentRequest) =>
    apiClient.post<FormAssignment>(`/projects/${projectId}/forms`, data).then((r) => r.data),

  listAssignments: (projectId: string) =>
    apiClient.get<FormAssignment[]>(`/projects/${projectId}/forms`).then((r) => r.data),

  addStudents: (assignmentId: string, students: string[]) =>
    apiClient.patch<FormAssignment>(`/forms/${assignmentId}/students`, { addStudents: students }).then((r) => r.data),
};
