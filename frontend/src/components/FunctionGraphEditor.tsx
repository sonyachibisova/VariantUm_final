/**
 * Панель для построения и вставки графика функции в текст задания.
 * По нажатию «Вставить» возвращает строку-маркер:
 *   [ФУНКЦИЯ: {"fn":"x^2","xMin":-5,"xMax":5}]
 */

import { useState } from 'react';
import { FunctionGraphDisplay } from './FunctionGraphDisplay';

interface Props {
  onInsert: (marker: string) => void;
  onCancel: () => void;
  initialConfig?: { fn: string; xMin: number; xMax: number; yMin?: number; yMax?: number };
}

export function FunctionGraphEditor({ onInsert, onCancel, initialConfig }: Props) {
  const [fn, setFn] = useState(initialConfig?.fn ?? 'x^2');
  const [xMin, setXMin] = useState(String(initialConfig?.xMin ?? -5));
  const [xMax, setXMax] = useState(String(initialConfig?.xMax ?? 5));
  const [error, setError] = useState('');

  const xMinParsed = parseFloat(xMin);
  const xMaxParsed = parseFloat(xMax);
  const xMinN = Number.isFinite(xMinParsed) ? xMinParsed : -5;
  const xMaxN = Number.isFinite(xMaxParsed) ? xMaxParsed : 5;
  const validRange = xMaxN > xMinN;
  const validFn = fn.trim().length > 0;

  function handleInsert() {
    if (!validFn || !validRange) {
      setError('Проверьте формулу и диапазон X.');
      return;
    }
    const json = JSON.stringify({ fn: fn.trim(), xMin: xMinN, xMax: xMaxN });
    onInsert(`[ФУНКЦИЯ: ${json}]`);
  }

  return (
    <div className="border border-indigo-200 rounded-xl overflow-hidden bg-white">
      {/* Заголовок */}
      <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span className="text-xs font-semibold text-indigo-800">{initialConfig ? 'Редактировать график' : 'Новый график функции'}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Формула */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Функция y = f(x)</label>
          <input
            type="text"
            value={fn}
            onChange={e => { setFn(e.target.value); setError(''); }}
            placeholder="например: x^2 - 2*x + 1"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:border-indigo-400 transition-colors"
          />
          <p className="text-xs text-gray-400 mt-0.5">
            Поддерживается: +, -, *, /, ^, sin, cos, tan, sqrt, abs, ln, pi, e
          </p>
        </div>

        {/* Диапазон X */}
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">x от</label>
            <input
              type="number"
              value={xMin}
              onChange={e => { setXMin(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">x до</label>
            <input
              type="number"
              value={xMax}
              onChange={e => { setXMax(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Предпросмотр графика */}
        {validFn && validRange && (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <FunctionGraphDisplay config={{ fn: fn.trim(), xMin: xMinN, xMax: xMaxN }} />
          </div>
        )}

        {/* Кнопки */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInsert}
            disabled={!validFn || !validRange}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          >
            Вставить в задание
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-all"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
