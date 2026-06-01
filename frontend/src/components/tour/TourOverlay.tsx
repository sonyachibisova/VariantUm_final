import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTour } from '../../context/TourContext';
import TourTooltip from './TourTooltip';

const PAD = 8;

interface ChoiceRect {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
  tourId: string; jumpTo: string;
}

export default function TourOverlay() {
  const { tourActive, steps, currentStep, handleBranchAction, nextStep } = useTour();
  const location = useLocation();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [choiceRects, setChoiceRects] = useState<ChoiceRect[]>([]);
  const highlightedElRef = useRef<Element | null>(null);
  const highlightedChoiceEls = useRef<Element[]>([]);

  useEffect(() => {
    if (highlightedElRef.current) {
      highlightedElRef.current.classList.remove('tour-highlight-ring');
      highlightedElRef.current = null;
    }
    highlightedChoiceEls.current.forEach(el => el.classList.remove('tour-highlight-ring'));
    highlightedChoiceEls.current = [];

    if (!tourActive || !steps.length || currentStep >= steps.length) {
      setRect(null);
      setChoiceRects([]);
      return;
    }

    const step = steps[currentStep];
    if (!step) return;

    if (step.multiChoice) {
      const updateChoiceRects = () => {
        highlightedChoiceEls.current.forEach(el => el.classList.remove('tour-highlight-ring'));
        highlightedChoiceEls.current = [];

        const newRects: ChoiceRect[] = [];
        step.choices?.forEach(choice => {
          const el = document.querySelector(`[data-tour="${choice.tourId}"]`);
          if (el) {
            el.classList.add('tour-highlight-ring');
            highlightedChoiceEls.current.push(el);
            const r = el.getBoundingClientRect();
            newRects.push({
              left: r.left, top: r.top, right: r.right, bottom: r.bottom,
              width: r.width, height: r.height,
              tourId: choice.tourId, jumpTo: choice.jumpTo,
            });
          }
        });
        setChoiceRects(newRects);
        setRect(null);
      };

      updateChoiceRects();
      window.addEventListener('resize', updateChoiceRects);
      document.addEventListener('scroll', updateChoiceRects, true);

      return () => {
        window.removeEventListener('resize', updateChoiceRects);
        document.removeEventListener('scroll', updateChoiceRects, true);
        highlightedChoiceEls.current.forEach(el => el.classList.remove('tour-highlight-ring'));
        highlightedChoiceEls.current = [];
        setChoiceRects([]);
      };
    }

    let currentEl: Element | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const updateRect = () => {
      if (currentEl) setRect(currentEl.getBoundingClientRect());
    };

    function scrollToEl(el: Element) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < 100 || r.bottom > vh - 100) {
        const target = window.scrollY + r.top + r.height / 2 - vh / 2;
        window.scrollTo(0, Math.max(0, target));
      }
    }

    const el = step.tourId ? document.querySelector(`[data-tour="${step.tourId}"]`) : null;

    if (el) {
      scrollToEl(el);
      currentEl = el;
      if (!step.noHighlight) {
        el.classList.add('tour-highlight-ring');
        highlightedElRef.current = el;
      }
      setRect(el.getBoundingClientRect());
      setChoiceRects([]);
    } else {
      setRect(null);
      setChoiceRects([]);
      retryTimer = setTimeout(() => {
        const retryEl = step.tourId ? document.querySelector(`[data-tour="${step.tourId}"]`) : null;
        if (retryEl) {
          scrollToEl(retryEl);
          currentEl = retryEl;
          if (!step.noHighlight) {
            retryEl.classList.add('tour-highlight-ring');
            highlightedElRef.current = retryEl;
          }
          setRect(retryEl.getBoundingClientRect());
        }
      }, 150);
    }

    window.addEventListener('resize', updateRect);
    document.addEventListener('scroll', updateRect, true);

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('resize', updateRect);
      document.removeEventListener('scroll', updateRect, true);
      if (highlightedElRef.current) {
        highlightedElRef.current.classList.remove('tour-highlight-ring');
        highlightedElRef.current = null;
      }
    };
  }, [tourActive, currentStep, steps, location.pathname]);

  if (!tourActive) return null;

  const step = steps[currentStep] ?? null;
  const showCutout = step && !step.noHighlight && rect && !step.multiChoice;

  return createPortal(
    <>
      <svg style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100dvh',
        zIndex: 9990, pointerEvents: 'none',
      }}>
        <defs>
          <mask id="tour-cutout">
            <rect width="100%" height="100%" fill="white" />
            {showCutout && (
              <rect
                x={rect.left - PAD} y={rect.top - PAD}
                width={rect.width + PAD * 2} height={rect.height + PAD * 2}
                rx="12" fill="black"
              />
            )}
            {step?.multiChoice && choiceRects.map(cr => (
              <rect
                key={cr.tourId}
                x={cr.left - PAD} y={cr.top - PAD}
                width={cr.width + PAD * 2} height={cr.height + PAD * 2}
                rx="12" fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-cutout)" />
      </svg>

      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9991, cursor: 'default' }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      />

      {step?.advanceOnClick && rect && (
        <div
          style={{
            position: 'fixed', top: rect.top, left: rect.left,
            width: rect.width, height: rect.height, zIndex: 9997, cursor: 'pointer',
          }}
          onClick={nextStep}
        />
      )}

      {step?.multiChoice && choiceRects.map(cr => (
        <div
          key={cr.tourId}
          onClick={() => handleBranchAction({ jumpTo: cr.jumpTo })}
          style={{
            position: 'fixed', top: cr.top, left: cr.left,
            width: cr.width, height: cr.height, zIndex: 9996, cursor: 'pointer',
          }}
        />
      ))}

      <TourTooltip rect={rect} step={step} choiceRects={choiceRects} />
    </>,
    document.body
  );
}
