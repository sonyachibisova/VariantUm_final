import { useQuery, useMutation } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import type { Project } from '../types/api';

const ACTION_LABELS: Record<string, string> = {
  GENERATED: 'Первоначальная генерация',
  MANUAL_EDIT: 'Ручная правка',
  AI_EDIT_SINGLE: 'Правка варианта (ИИ)',
  AI_EDIT_ALL: 'Правка комплекта (ИИ)',
  REGENERATED: 'Перегенерация варианта',
  VARIANT_ADDED: 'Добавлен вариант',
  VARIANT_DELETED: 'Удалён вариант',
};

function ActionIcon({ action }: { action: string }) {
  const color =
    action === 'GENERATED' ? '#22a139'
      : action.startsWith('AI') || action === 'REGENERATED' ? '#0b8acb'
      : '#6b7280';
  return (
    <span style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
    }}>
      {action === 'GENERATED' ? '✦' : action.startsWith('AI') ? 'AI' : '✎'}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Панель «История изменений»: список версий комплекта с возможностью отката.
 * Снимок пишется бэкендом при каждом значимом действии (генерация/правка/добавление/удаление).
 */
export function HistoryPanel({
  projectId,
  onClose,
  onRestored,
}: {
  projectId: string;
  onClose: () => void;
  onRestored: (project: Project) => void;
}) {
  const { data: versions, isLoading, isError } = useQuery({
    queryKey: ['project-history', projectId],
    queryFn: () => projectsApi.history(projectId),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => projectsApi.restoreVersion(projectId, versionId),
    onSuccess: (project) => { onRestored(project); onClose(); },
  });

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">История изменений</h2>
            <p className="text-xs text-gray-400 mt-0.5">Можно вернуть комплект к любому сохранённому состоянию</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading && <p className="text-sm text-gray-400 text-center py-6">Загрузка истории...</p>}
          {isError && <p className="text-sm text-red-500 text-center py-6">Не удалось загрузить историю.</p>}
          {versions && versions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Пока нет сохранённых версий.</p>
          )}

          {restore.isError && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-600 text-sm">
              Не удалось выполнить откат. Попробуйте ещё раз.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {versions?.map((v, i) => (
              <div
                key={v.versionId}
                className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-gray-300 transition-colors"
              >
                <ActionIcon action={v.action} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {v.description || ACTION_LABELS[v.action] || v.action}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(v.createdAt)}</p>
                </div>
                {i === 0 ? (
                  <span className="text-[11px] font-semibold text-gray-400 px-2 py-1">текущая</span>
                ) : (
                  <button
                    onClick={() => restore.mutate(v.versionId)}
                    disabled={restore.isPending}
                    className="flex-shrink-0 text-xs font-semibold text-[#0b8acb] border border-[#0b8acb]/40 rounded-lg px-3 py-1.5 hover:bg-[#0b8acb]/10 transition-colors disabled:opacity-50"
                  >
                    {restore.isPending && restore.variables === v.versionId ? 'Откат...' : 'Вернуть'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
