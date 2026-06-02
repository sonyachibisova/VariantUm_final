import { apiClient } from './client';
import type {
  CreateProjectRequest,
  Project,
  ProjectListItem,
  UpdateVariantRequest,
  AiEditRequest,
  VariantActionRequest,
  ExportRequest,
} from '../types/api';

/** Запись истории версий комплекта. */
export interface VersionItem {
  versionId: string;
  action: string;
  description: string | null;
  createdAt: string;
}

export const projectsApi = {
  create: (data: CreateProjectRequest) =>
    apiClient.post<Project>('/projects', data).then((r) => r.data),

  get: (projectId: string) =>
    apiClient.get<Project>(`/projects/${projectId}`).then((r) => r.data),

  list: (params: { subject?: string; grade?: number; q?: string; page?: number; size?: number }) =>
    apiClient.get<{ projects: ProjectListItem[]; totalPages: number; totalElements: number }>(
      '/projects',
      { params },
    ).then((r) => r.data),

  delete: (projectId: string) => apiClient.delete(`/projects/${projectId}`),

  // ---- Редактирование вариантов ----

  updateVariant: (projectId: string, variantId: string, data: UpdateVariantRequest) =>
    apiClient
      .patch<Project>(`/projects/${projectId}/variants/${variantId}`, data)
      .then((r) => r.data),

  regenerateVariant: (projectId: string, variantId: string, data?: VariantActionRequest) =>
    apiClient
      .post<Project>(`/projects/${projectId}/variants/${variantId}/regenerate`, data ?? {})
      .then((r) => r.data),

  aiEditVariant: (projectId: string, variantId: string, data: AiEditRequest) =>
    apiClient
      .post<Project>(`/projects/${projectId}/variants/${variantId}/ai-edit`, data)
      .then((r) => r.data),

  aiEditAll: (projectId: string, data: AiEditRequest) =>
    apiClient.post<Project>(`/projects/${projectId}/ai-edit-all`, data).then((r) => r.data),

  addVariant: (projectId: string, data?: VariantActionRequest) =>
    apiClient.post<Project>(`/projects/${projectId}/variants`, data ?? {}).then((r) => r.data),

  regenerateTask: (projectId: string, variantId: string, taskId: string) =>
    apiClient
      .post<Project>(`/projects/${projectId}/variants/${variantId}/tasks/${taskId}/regenerate`)
      .then((r) => r.data),

  deleteVariant: (projectId: string, variantId: string) =>
    apiClient
      .delete<Project>(`/projects/${projectId}/variants/${variantId}`)
      .then((r) => r.data),

  updateReferenceText: (projectId: string, referenceText: string) =>
    apiClient
      .patch<Project>(`/projects/${projectId}/reference-text`, { referenceText })
      .then((r) => r.data),

  reparseReference: (projectId: string) =>
    apiClient
      .post<Project>(`/projects/${projectId}/reparse-reference`)
      .then((r) => r.data),

  retryGeneration: (projectId: string) =>
    apiClient
      .post<Project>(`/projects/${projectId}/regenerate`)
      .then((r) => r.data),

  // ---- История версий ----

  history: (projectId: string) =>
    apiClient
      .get<{ versions: VersionItem[] }>(`/projects/${projectId}/history`)
      .then((r) => r.data.versions),

  restoreVersion: (projectId: string, versionId: string) =>
    apiClient
      .post<Project>(`/projects/${projectId}/history/${versionId}/restore`)
      .then((r) => r.data),

  // ---- Исходный файл ----

  downloadReferenceFile: async (projectId: string, fileName: string) => {
    const response = await apiClient.get(`/projects/${projectId}/reference-file`, {
      responseType: 'blob',
    });
    triggerDownload(response.data as Blob, fileName);
  },

  /** Возвращает blob-URL файла для встроенного предпросмотра. Вызывающий обязан вызвать URL.revokeObjectURL. */
  getReferenceFileBlobUrl: async (projectId: string): Promise<string> => {
    const response = await apiClient.get(`/projects/${projectId}/reference-file`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data as Blob);
  },

  /** Открывает исходный файл в новой вкладке (PDF — рендерится в браузере). */
  viewReferenceFile: async (projectId: string) => {
    const response = await apiClient.get(`/projects/${projectId}/reference-file`, {
      responseType: 'blob',
    });
    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Освобождаем URL через минуту (браузер успеет загрузить)
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  // ---- Экспорт (скачивание файла) ----

  exportFile: async (projectId: string, format: 'pdf' | 'docx', data: ExportRequest) => {
    const response = await apiClient.post(`/projects/${projectId}/export/${format}`, data, {
      responseType: 'blob',
    });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const filename = parseFilename(disposition) ?? `variant.${format}`;
    triggerDownload(response.data as Blob, filename);
  },
};

function parseFilename(disposition?: string): string | null {
  if (!disposition) return null;
  // filename*=UTF-8''<encoded>
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return plainMatch ? plainMatch[1] : null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
