import { useEffect, useState } from 'react';
import { useLimitsStore, fmtPercent } from '../store/limitsStore';

const LP = "'Littera Plain', sans-serif";

function color(remaining: number): { fg: string; bg: string; border: string } {
  if (remaining <= 15) return { fg: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  if (remaining <= 40) return { fg: '#d97706', bg: '#fffbeb', border: '#fde68a' };
  return { fg: '#21a038', bg: '#f0fdf4', border: '#bbf7d0' };
}

function formatResetTime(resetAt: string | undefined): string {
  if (!resetAt) return '';
  try {
    const d = new Date(resetAt);
    return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Бейдж остатка дневного лимита обращений к нейросети.
 * При наведении показывает время обновления и расценки действий.
 * `scale` — множитель размера (для подгонки под адаптивную шапку).
 */
export function LimitsBadge({ scale = 1 }: { scale?: number }) {
  const { limits, refresh } = useLimitsStore();
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!limits) refresh();
  }, [limits, refresh]);

  const remaining = limits?.percentRemaining ?? 100;
  const c = color(remaining);
  const px = (v: number) => `${Math.round(v * scale)}px`;
  const costs = limits?.costs;

  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: px(7),
          fontFamily: LP, fontSize: px(18), color: c.fg,
          background: c.bg, border: `1px solid ${c.border}`,
          borderRadius: px(20), padding: `${px(5)} ${px(13)}`,
          cursor: 'default', whiteSpace: 'nowrap', lineHeight: 1,
        }}
        title="Дневной лимит обращений к нейросети"
      >
        <svg width={px(15)} height={px(15)} viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
        </svg>
        <span>Лимит: {fmtPercent(remaining)}%</span>
      </div>

      {hover && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,.14)',
            padding: '12px 14px', width: '260px', zIndex: 300,
            fontFamily: LP, textAlign: 'left',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#111' }}>
            Дневной лимит нейросети
          </p>
          <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#6b7280' }}>
            Осталось {fmtPercent(remaining)}% из 100%. Обновится {formatResetTime(limits?.resetAt)}.
          </p>
          {costs && (
            <div style={{ fontSize: '11.5px', color: '#4b5563', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 2px', fontWeight: 600, color: '#374151' }}>Примерные расценки:</p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Парсинг файла</span><span>{costs.parsePerFile}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Задание (текст)</span><span>{costs.taskBase}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Задание с формулой</span><span>{costs.taskFormula}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Задание с графиком</span><span>{costs.taskGraph}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
