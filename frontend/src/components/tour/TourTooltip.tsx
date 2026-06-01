import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useTour } from '../../context/TourContext';
import type { TourStep } from '../../context/TourContext';

const LP = "'Littera Plain', sans-serif";
const TOOLTIP_WIDTH = 320;
const GAP = 16;
const EDGE = 12;

interface ChoiceRect {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
  tourId: string; jumpTo: string;
}

function calcPosition(rect: DOMRect | null, step: TourStep | null, choiceRects: ChoiceRect[], tooltipHeight = 220) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.min(TOOLTIP_WIDTH, vw - EDGE * 2);

  if (step?.multiChoice) {
    const centerLeft = Math.max(EDGE, Math.min(vw / 2 - tw / 2, vw - tw - EDGE));
    if (choiceRects?.length > 0) {
      const lowestBottom = Math.max(...choiceRects.map(r => r.bottom));
      const below = lowestBottom + 24;
      if (below + tooltipHeight + EDGE <= vh) return { top: below, left: centerLeft, width: tw };
      const highestTop = Math.min(...choiceRects.map(r => r.top));
      const above = highestTop - tooltipHeight - 24;
      if (above >= EDGE) return { top: above, left: centerLeft, width: tw };
    }
    return { top: Math.max(EDGE, (vh - tooltipHeight) / 2), left: centerLeft, width: tw };
  }

  if (!rect) {
    return {
      top: Math.max(EDGE, (vh - tooltipHeight) / 2),
      left: Math.max(EDGE, (vw - tw) / 2),
      width: tw,
    };
  }

  function tryPlacement(p: string): { top: number; left: number } | null {
    let top: number, left: number;
    switch (p) {
      case 'top':
        top = rect!.top - tooltipHeight - GAP;
        left = rect!.left + rect!.width / 2 - tw / 2;
        break;
      case 'bottom':
        top = rect!.bottom + GAP;
        left = rect!.left + rect!.width / 2 - tw / 2;
        break;
      case 'right':
        left = rect!.right + GAP;
        top = rect!.top + rect!.height / 2 - tooltipHeight / 2;
        break;
      case 'left':
        left = rect!.left - tw - GAP;
        top = rect!.top + rect!.height / 2 - tooltipHeight / 2;
        break;
      default:
        top = rect!.bottom + GAP;
        left = rect!.left + rect!.width / 2 - tw / 2;
    }
    const cl = Math.max(EDGE, Math.min(left, vw - tw - EDGE));
    const ct = Math.max(EDGE, Math.min(top, vh - tooltipHeight - EDGE));
    const overlapsH = cl < rect!.right && cl + tw > rect!.left;
    const overlapsV = ct < rect!.bottom && ct + tooltipHeight > rect!.top;
    if (overlapsH && overlapsV) return null;
    return { top: ct, left: cl };
  }

  const primary = step?.placement ?? 'bottom';
  const order = [primary, ...(['bottom', 'top', 'right', 'left'].filter(p => p !== primary))];
  for (const p of order) {
    const result = tryPlacement(p);
    if (result) return { ...result, width: tw };
  }

  return {
    top: Math.max(EDGE, (vh - tooltipHeight) / 2),
    left: Math.max(EDGE, (vw - tw) / 2),
    width: tw,
  };
}

function IcoDrag() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.35 }}>
      <circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" />
    </svg>
  );
}

interface Props {
  rect: DOMRect | null;
  step: TourStep | null;
  choiceRects: ChoiceRect[];
}

export default function TourTooltip({ rect, step, choiceRects }: Props) {
  const { skipTour, nextStep, handleBranchAction } = useTour();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: TOOLTIP_WIDTH });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return;
      if (!step || step.multiChoice) { e.preventDefault(); return; }
      if (step.branch && step.branchOptions?.length) {
        handleBranchAction(step.branchOptions[0].action);
      } else {
        nextStep();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, nextStep, handleBranchAction]);

  useLayoutEffect(() => {
    if (!tooltipRef.current || !step) return;
    const actualH = tooltipRef.current.offsetHeight;
    setPos(calcPosition(rect, step, choiceRects, actualH));
  }, [rect, step, choiceRects]);

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [step]);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y,
    };
    setIsDragging(true);

    function onMove(e: MouseEvent) {
      if (!dragStateRef.current.active) return;
      setDragOffset({
        x: dragStateRef.current.baseX + e.clientX - dragStateRef.current.startX,
        y: dragStateRef.current.baseY + e.clientY - dragStateRef.current.startY,
      });
    }
    function onUp() {
      dragStateRef.current.active = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  if (!step) {
    const fallbackW = Math.min(TOOLTIP_WIDTH, window.innerWidth - EDGE * 2);
    return (
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: fallbackW, background: '#fff', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 9999,
        padding: '20px', boxSizing: 'border-box', fontFamily: LP, textAlign: 'center',
      }}>
        <button onClick={skipTour} style={{
          position: 'absolute', top: '12px', right: '12px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '18px', color: '#6b7280', lineHeight: 1, padding: '4px 8px', fontFamily: LP,
        }}>×</button>
        <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '16px', color: '#000', margin: '0 0 8px' }}>
          ВариантУм
        </p>
        <p style={{ fontFamily: LP, fontSize: '14px', color: '#374151', margin: '0 0 16px' }}>
          Инструкция скоро появится здесь.
        </p>
        <button onClick={skipTour} style={{
          fontFamily: LP, fontSize: '13px', cursor: 'pointer',
          padding: '6px 16px', borderRadius: '8px',
          background: '#21a038', color: '#fff', border: 'none',
        }}>Закрыть</button>
      </div>
    );
  }

  const isMultiChoice = !!step.multiChoice;

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: pos.top + dragOffset.y,
        left: pos.left + dragOffset.x,
        width: pos.width,
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 9999,
        padding: '20px', boxSizing: 'border-box', fontFamily: LP,
        userSelect: 'none',
      }}>
      <div
        onMouseDown={onMouseDown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <IcoDrag />
        <button onClick={skipTour} onMouseDown={e => e.stopPropagation()} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '18px', color: '#6b7280', lineHeight: 1, padding: '4px 8px', fontFamily: LP,
        }}>×</button>
      </div>

      <p style={{ fontFamily: LP, fontWeight: 700, fontSize: '16px', color: '#000', margin: '0 0 8px 0', lineHeight: 1.3 }}>
        {step.title}
      </p>
      <p style={{ fontFamily: LP, fontWeight: 400, fontSize: '14px', color: '#374151', margin: '0 0 16px 0', lineHeight: 1.5 }}>
        {step.body}
      </p>

      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isMultiChoice ? (
            <button onClick={skipTour} style={{
              fontFamily: LP, fontSize: '13px', cursor: 'pointer',
              background: 'none', border: 'none', color: '#6b7280', textDecoration: 'underline',
            }}>Пропустить инструкцию</button>
          ) : step.branch ? (
            step.branchOptions?.map((opt, i) => (
              <button key={i} onClick={() => handleBranchAction(opt.action)} style={{
                fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                padding: '6px 12px', borderRadius: '8px',
                background: i === 0 ? '#21a038' : 'transparent',
                color: i === 0 ? '#fff' : '#374151',
                border: i === 0 ? 'none' : '1px solid #d1d5db',
                whiteSpace: 'nowrap',
              }}>{opt.label}</button>
            ))
          ) : (
            <>
              <button onClick={nextStep} style={{
                fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                padding: '6px 16px', borderRadius: '8px',
                background: '#21a038', color: '#fff', border: 'none',
              }}>Далее</button>
              <button onClick={skipTour} style={{
                fontFamily: LP, fontSize: '13px', cursor: 'pointer',
                background: 'none', border: 'none', color: '#6b7280', textDecoration: 'underline',
              }}>Пропустить инструкцию</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
