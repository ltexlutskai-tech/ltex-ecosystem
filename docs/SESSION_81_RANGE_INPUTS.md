# Session 81 — Numeric inputs alongside range sliders

**Type:** Worker session (mini)
**Branch:** `claude/range-inputs-{XXXX}`
**Goal:** Додати пару `<input type="number">` (min, max) поряд з кожним range slider (unitsPerKg, unitWeight, у `/lots` ще priceUah + weightLot) — щоб юзер міг ввести точне число замість перетягування. Двосторонній sync — slider-handles ↔ inputs.

---

## ⚠️ HARD RULES

1. **DO NOT change PriceRangeSlider component contract** — він уже має `value`, `onChange`, `onCommit`. Просто рендеримо inputs поряд з ним і прив'язуємо до того ж state.
2. **DO NOT add new dependencies** — pure HTML inputs.
3. Step: `1` для всіх (per S80).
4. Validation на input: clamp між `min`-`max` bounds + reorder якщо min > max при commit.
5. Apply only on blur OR Enter — НЕ on кожний keystroke (інакше повільно через server roundtrip).

---

## Tasks

### 1. New component `apps/store/components/store/range-with-inputs.tsx`

Wrapper що поєднує `PriceRangeSlider` + 2 number inputs:

```tsx
"use client";
import { useState, useEffect } from "react";
import { PriceRangeSlider } from "./price-range-slider";

interface Props {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  onCommit: (v: [number, number]) => void;
  step?: number;
  unit?: string; // "шт" / "кг" / "₴"
  ariaLabelMin?: string;
  ariaLabelMax?: string;
}

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
  // local draft state for inputs (avoid laggy controlled-input pattern)
  const [loDraft, setLoDraft] = useState<string>(String(lo));
  const [hiDraft, setHiDraft] = useState<string>(String(hi));

  // Sync drafts when external value changes (slider drag)
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
    onChange([finalLo, finalHi]);
    onCommit([finalLo, finalHi]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); // triggers onBlur → commit
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
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
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
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
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
```

### 2. Use в `catalog-filters.tsx`

Replace 2 `<PriceRangeSlider>` blocks для unitsPerKg + unitWeight (рядки 360-393) на `<RangeWithInputs>`:

```tsx
{
  rangesLoaded && unitsBounds[1] > unitsBounds[0] && (
    <div>
      <span className={labelClass}>{dict.catalog.unitsPerKgLabel}</span>
      <RangeWithInputs
        min={unitsBounds[0]}
        max={unitsBounds[1]}
        value={unitsValue}
        onChange={setUnitsValue}
        onCommit={commitUnitsRange}
        step={1}
        unit="шт"
        ariaLabelMin={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeFrom}`}
        ariaLabelMax={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeTo}`}
      />
    </div>
  );
}

{
  rangesLoaded && weightBounds[1] > weightBounds[0] && (
    <div>
      <span className={labelClass}>{dict.catalog.unitWeightLabel}</span>
      <RangeWithInputs
        min={weightBounds[0]}
        max={weightBounds[1]}
        value={weightValue}
        onChange={setWeightValue}
        onCommit={commitWeightRange}
        step={1}
        unit="кг"
        ariaLabelMin={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeFrom}`}
        ariaLabelMax={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeTo}`}
      />
    </div>
  );
}
```

Не забудь import:

```tsx
import { RangeWithInputs } from "./range-with-inputs";
```

(можеш видалити `import { PriceRangeSlider }` якщо больше не використовується у цьому файлі — перевір price slider)

### 3. Те саме у `lots-filters-form.tsx`

Знайти всі `<PriceRangeSlider>` в lots-filters → замінити на `<RangeWithInputs>`. Це: priceUah range, weightLot range, unitsPerKg, unitWeight (чотири).

### 4. Apply на priceRangeSlider у каталозі (Ціна)

`/catalog` має ще price slider (S62 era) — теж upgrade на `RangeWithInputs` з unit="€" чи "₴". Робити це **тільки якщо** просто (не вимагає рефакторингу commit logic).

### 5. Tests

`components/store/range-with-inputs.test.tsx`:

- Render — show 2 inputs + slider
- Type у min input "5" + blur → onCommit called with [5, currentMax]
- Type "999" у min (більше за max=100) → clamp to 100 + reorder → [max, 100]?
- Press Enter → triggers blur → commit
- External value change (slider drag) → inputs reflect new values

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] `RangeWithInputs` створено + tested
- [ ] catalog-filters.tsx unitsPerKg + unitWeight використовують RangeWithInputs
- [ ] lots-filters-form.tsx — те саме (4 ranges)
- [ ] (Optional) catalog-filters price slider теж upgraded
- [ ] Введення числа у input + Enter / blur → triggers filter URL update
- [ ] Slider drag — inputs синхронізуються
- [ ] Push на `claude/range-inputs-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — UI-only redeploy

⚠️ **Окремо**: якщо досі не запущено backfill (S72) — це **критично** для filter роботи:

```powershell
pnpm exec tsx scripts/backfill-numeric-ranges.ts        # dry-run, бачимо counts
pnpm exec tsx scripts/backfill-numeric-ranges.ts --apply # write to DB
```

Без backfill більшість продуктів мають `unitsPerKgMin = NULL` → filter excludes їх → "товар не знайдено" коли пересуваєш slider.

---

## Reference

- `apps/store/components/store/price-range-slider.tsx` — wrapped component (без змін)
- `apps/store/components/store/catalog-filters.tsx:360-393` — поточні slider blocks
- `apps/store/components/store/lots-filters-form.tsx` — чотири slider blocks
- `scripts/backfill-numeric-ranges.ts` — для backfill numeric колонок (S72)
