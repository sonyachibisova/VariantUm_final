import { apiClient } from './client';

export interface FileUploadResponse {
  fileId: string;
  filename: string;
  mimeType: string;
  extractedText: string;
}

export const filesApi = {
  upload: (file: File): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<FileUploadResponse>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
