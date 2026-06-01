import { create } from 'zustand';

/**
 * Черновик для потока «по эталону»: переносит извлечённый текст задания
 * с экрана загрузки (/upload) в редактор комплекта (/editor) до создания проекта.
 */
export type ReferenceDraft = {
  referenceText: string;
  variantCount: number;
  sourceFiles?: File[];
};

type DraftState = {
  referenceDraft: ReferenceDraft | null;
  setReferenceDraft: (d: ReferenceDraft | null) => void;
};

export const useDraftStore = create<DraftState>((set) => ({
  referenceDraft: null,
  setReferenceDraft: (d) => set({ referenceDraft: d }),
}));
