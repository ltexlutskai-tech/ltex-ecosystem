"use client";

import { useCallback } from "react";

interface Props {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  onCommit?: (value: [number, number]) => void;
  step?: number;
  ariaLabelMin?: string;
  ariaLabelMax?: string;
}

/**
 * Dual-handle range slider built from two overlapping <input type="range">.
 * The min thumb is constrained to <= max thumb, and vice versa, so the user
 * cannot cross the handles. `onCommit` (mouseup/touchend) is the right hook
 * for "navigate the page" — `onChange` fires on every drag tick.
 */
export function PriceRangeSlider({
  min,
  max,
  value,
  onChange,
  onCommit,
  step = 1,
  ariaLabelMin = "Мінімальна ціна",
  ariaLabelMax = "Максимальна ціна",
}: Props) {
  const [lo, hi] = value;
  const safeMin = Math.max(min, Math.min(lo, hi));
  const safeMax = Math.min(max, Math.max(lo, hi));
  const span = max - min || 1;
  const leftPct = ((safeMin - min) / span) * 100;
  const rightPct = ((safeMax - min) / span) * 100;

  const handleMin = useCallback(
    (raw: number) => {
      const next = Math.min(raw, hi);
      onChange([next, hi]);
    },
    [hi, onChange],
  );

  const handleMax = useCallback(
    (raw: number) => {
      const next = Math.max(raw, lo);
      onChange([lo, next]);
    },
    [lo, onChange],
  );

  const commit = useCallback(() => {
    onCommit?.([safeMin, safeMax]);
  }, [onCommit, safeMin, safeMax]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{safeMin} €</span>
        <span>{safeMax} €</span>
      </div>
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-gray-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-green-600"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeMin}
          onChange={(e) => handleMin(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={ariaLabelMin}
          className="range-thumb absolute inset-0 h-6 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeMax}
          onChange={(e) => handleMax(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={ariaLabelMax}
          className="range-thumb absolute inset-0 h-6 w-full appearance-none bg-transparent"
        />
      </div>
      <style jsx>{`
        .range-thumb {
          pointer-events: none;
        }
        .range-thumb::-webkit-slider-thumb {
          pointer-events: auto;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #16a34a;
          border: 2px solid #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          cursor: pointer;
        }
        .range-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #16a34a;
          border: 2px solid #fff;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
