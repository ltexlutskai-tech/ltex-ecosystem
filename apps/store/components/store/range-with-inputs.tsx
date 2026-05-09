"use client";

import { useEffect, useState } from "react";
import { PriceRangeSlider } from "./price-range-slider";

interface Props {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  onCommit: (v: [number, number]) => void;
  step?: number;
  unit?: string;
  ariaLabelMin?: string;
  ariaLabelMax?: string;
}

/**
 * Pair of <input type="number"> (min/max) wired to the same state as the
 * underlying dual-range slider. Inputs commit on blur or Enter only — never
 * on every keystroke — to avoid hammering the URL/router with each digit.
 */
export function RangeWithInputs({
  min,
  max,
  value,
  onChange,
  onCommit,
  step = 1,
  unit,
  ariaLabelMin,
  ariaLabelMax,
}: Props) {
  const [lo, hi] = value;
  const [loDraft, setLoDraft] = useState<string>(String(lo));
  const [hiDraft, setHiDraft] = useState<string>(String(hi));

  useEffect(() => {
    setLoDraft(String(lo));
  }, [lo]);
  useEffect(() => {
    setHiDraft(String(hi));
  }, [hi]);

  function commitFromDrafts() {
    const parsedLo = clampInt(parseInt(loDraft, 10), min, max, lo);
    const parsedHi = clampInt(parseInt(hiDraft, 10), min, max, hi);
    const finalLo = Math.min(parsedLo, parsedHi);
    const finalHi = Math.max(parsedLo, parsedHi);
    setLoDraft(String(finalLo));
    setHiDraft(String(finalHi));
    if (finalLo === lo && finalHi === hi) return;
    onChange([finalLo, finalHi]);
    onCommit([finalLo, finalHi]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={loDraft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setLoDraft(e.target.value)}
          onBlur={commitFromDrafts}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabelMin ?? "min"}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          inputMode="numeric"
        />
        <input
          type="number"
          value={hiDraft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setHiDraft(e.target.value)}
          onBlur={commitFromDrafts}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabelMax ?? "max"}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          inputMode="numeric"
        />
      </div>
      <PriceRangeSlider
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        step={step}
        ariaLabelMin={ariaLabelMin}
        ariaLabelMax={ariaLabelMax}
        formatValue={unit ? (v) => `${v} ${unit}` : undefined}
      />
    </div>
  );
}

function clampInt(
  n: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
