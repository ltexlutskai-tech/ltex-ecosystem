# Session 74 — Filter UI polish (sizes checkboxes + numeric range sliders)

**Type:** Worker session (mini)
**Branch:** `claude/filter-ui-polish-{XXXX}`
**Goal:** Замінити text input на sizes-фільтр на multi-checkbox, replace number inputs для unitsPerKg/unitWeight на dual-handle range sliders.

---

## ⚠️ HARD RULES

1. **DO NOT touch DB schema** — використовуй existing `unitsPerKgMin/Max`, `unitWeightMin/Max` Float колонки (S72) + `sizes` String? (S59).
2. **DO NOT change filter semantics** — backend logic у `lib/catalog.ts` лишається. Тільки UI presentation.
3. **Reuse `PriceRangeSlider`** (`apps/store/components/store/price-range-slider.tsx`) — dual-handle slider вже generic.
4. **Reuse pattern `/api/catalog/price-range`** — створи аналогічний endpoint для numeric ranges.
5. **Sizes — фіксований список** (не facet з DB) — простіше + швидше, користувач не бачить exotic sizes.

---

## Current state (S72 baseline)

- `apps/store/components/store/catalog-filters.tsx` — sizes як text input з debounce, unitsPerKg/unitWeight як два input "від"/"до" + Apply button.
- `apps/store/components/store/lots-filters-form.tsx` — те саме pattern.
- Backend filter logic: `lib/catalog.ts::searchProducts()` приймає `sizes: string` (single value, contains-match) і 4 numeric ranges. **Treba update щоб sizes приймав array (multi-checkbox).**

---

## Tasks

### 1. New constant SIZE_OPTIONS у `@ltex/shared`

Додай у `packages/shared/src/constants/business.ts`:

```typescript
export const SIZE_OPTIONS = [
  // Letter sizes
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  // Common numeric sizes (footwear + clothing)
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];
```

Експортуй з `index.ts`.

### 2. New API endpoint `/api/catalog/numeric-ranges`

Створи `apps/store/app/api/catalog/numeric-ranges/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await prisma.product.aggregate({
    where: { inStock: true },
    _min: { unitsPerKgMin: true, unitWeightMin: true },
    _max: { unitsPerKgMax: true, unitWeightMax: true },
  });

  const safeFloor = (v: number | null | undefined, fallback: number) =>
    v != null ? Math.floor(Number(v)) : fallback;
  const safeCeil = (v: number | null | undefined, fallback: number) =>
    v != null ? Math.ceil(Number(v)) : fallback;

  return NextResponse.json(
    {
      unitsPerKg: {
        min: safeFloor(result._min.unitsPerKgMin, 0),
        max: safeCeil(result._max.unitsPerKgMax, 20),
      },
      unitWeight: {
        // Note: these are decimals (kg) — round to 0.01
        min:
          result._min.unitWeightMin != null
            ? Math.floor(Number(result._min.unitWeightMin) * 100) / 100
            : 0,
        max:
          result._max.unitWeightMax != null
            ? Math.ceil(Number(result._max.unitWeightMax) * 100) / 100
            : 5,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
```

### 3. Backend — sizes multi-value

У `apps/store/lib/catalog.ts::searchProducts()`:

```typescript
export interface SearchProductsOptions {
  // ...existing
  sizes?: string | string[]; // CHANGED: array support
  // ...
}

// Inside the where logic:
const sizesValue = parseMultiValue(sizes); // existing helper
if (sizesValue) {
  // OR-match: продукт sizes string contains ANY of the selected
  const sizeArr = Array.isArray(sizesValue) ? sizesValue : [sizesValue];
  if (sizeArr.length > 0) {
    where.OR = [
      ...(where.OR ?? []),
      ...sizeArr.map((s) => ({
        sizes: { contains: s, mode: "insensitive" as const },
      })),
    ];
  }
}
```

Те саме у `fullTextSearch()` якщо sizes там handle-ається.

`/api/catalog/route.ts` — `searchParams.getAll("sizes")` (multi-value):

```typescript
sizes: searchParams.getAll("sizes").filter(Boolean) || undefined,
```

`/lots` server query — те саме pattern.

### 4. UI — `catalog-filters.tsx`

#### 4.1 Replace sizes text input з multi-checkbox

Видали current text input (debounced). Додай checkbox grid (4 columns, compact):

```tsx
import { SIZE_OPTIONS } from "@ltex/shared";

const sizes = useMemo(
  () => parseList(searchParams.get("sizes")),
  [searchParams],
);

const toggleSize = useCallback(
  (size: string) => {
    toggleListValue("sizes", size);
  },
  [toggleListValue],
);

// JSX
<div className="...">
  <span className={labelClass}>{dict.catalog.sizesLabel}</span>
  <div className="grid grid-cols-4 gap-2">
    {SIZE_OPTIONS.map((s) => (
      <label key={s} className="flex items-center gap-1 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={sizes.includes(s)}
          onChange={() => toggleSize(s)}
          className="..."
        />
        <span>{s}</span>
      </label>
    ))}
  </div>
</div>;
```

`toggleListValue` уже існує — pattern як для quality.

#### 4.2 Replace unitsPerKg/unitWeight number inputs з PriceRangeSlider

Add useState для loaded ranges (як `priceRange` state):

```tsx
const [unitsRange, setUnitsRange] = useState<{
  min: number;
  max: number;
} | null>(null);
const [weightRange, setWeightRange] = useState<{
  min: number;
  max: number;
} | null>(null);

useEffect(() => {
  fetch("/api/catalog/numeric-ranges")
    .then((r) => r.json())
    .then((d) => {
      setUnitsRange(d.unitsPerKg);
      setWeightRange(d.unitWeight);
    })
    .catch(() => {});
}, []);
```

JSX (replace existing units/weight blocks):

```tsx
{
  unitsRange && (
    <div>
      <span className={labelClass}>К-сть одиниць (шт/кг)</span>
      <div className="text-sm text-gray-600 flex justify-between">
        <span>{unitsLow} шт</span>
        <span>{unitsHigh} шт</span>
      </div>
      <PriceRangeSlider
        min={unitsRange.min}
        max={unitsRange.max}
        value={[unitsLow, unitsHigh]}
        onChange={([lo, hi]) => {
          setUnitsLow(lo);
          setUnitsHigh(hi);
        }}
        onCommit={([lo, hi]) => updateRange("unitsPerKg", lo, hi, unitsRange)}
        step={1}
      />
    </div>
  );
}

{
  weightRange && (
    <div>
      <span className={labelClass}>Вага одиниці (кг)</span>
      <div className="text-sm text-gray-600 flex justify-between">
        <span>{weightLow.toFixed(2)} кг</span>
        <span>{weightHigh.toFixed(2)} кг</span>
      </div>
      <PriceRangeSlider
        min={weightRange.min}
        max={weightRange.max}
        value={[weightLow, weightHigh]}
        onChange={([lo, hi]) => {
          setWeightLow(lo);
          setWeightHigh(hi);
        }}
        onCommit={([lo, hi]) => updateRange("unitWeight", lo, hi, weightRange)}
        step={0.01}
      />
    </div>
  );
}
```

`updateRange` helper — як для ціни: коли value === [min, max] (full range) — видалити query params, інакше set unitsPerKgMin/unitsPerKgMax.

⚠️ Прибери Apply button (no longer needed — slider онlу commits).

#### 4.3 Active filter chips

Existing chips for sizes — оновити щоб показувати кожен selected size окремо (як для quality). Range chips — формат `2-5 шт/кг`, `0.30-1.20 кг`.

### 5. UI — `lots-filters-form.tsx`

Apply ті самі patterns:

- sizes checkboxes (SIZE_OPTIONS grid)
- unitsPerKg slider (з API call)
- unitWeight slider

Існуючий "Застосувати діапазони" button — лиши **тільки якщо лишаються інші ranges (price, weight lot)**. Якщо всі ranges стали sliders — видали button. Перевір що weight lot range (з S62) лишається slider або inputs.

### 6. Tests

- `lib/catalog.test.ts` — `sizes=["XL","XXL"]` returns products де sizes contains XL OR XXL
- `app/api/catalog/numeric-ranges/route.test.ts` — returns valid shape (можна mock)
- Update existing UI tests якщо є для sizes input → перепиши на checkboxes

### 7. i18n

Уже існує `dict.catalog.sizesLabel`. Перевір що актуальний — "Розмір".

---

## Acceptance criteria

- [ ] `pnpm format:check` зелений
- [ ] `pnpm -r typecheck` зелений
- [ ] `pnpm -r test` зелений
- [ ] `pnpm -r build` зелений
- [ ] `SIZE_OPTIONS` constant у `@ltex/shared`
- [ ] `/api/catalog/numeric-ranges` endpoint існує та повертає `{ unitsPerKg, unitWeight }`
- [ ] Sizes у `/catalog` — multi-checkbox grid (4 cols)
- [ ] unitsPerKg + unitWeight у `/catalog` — dual-handle sliders з labels кг/шт
- [ ] Apply button прибрано (бо ranges тепер slider-based)
- [ ] Sizes/sliders identically виглядають у `/lots` filter sidebar
- [ ] Backend `searchProducts` приймає `sizes: string[]` (OR-match)
- [ ] Active filter chips коректно (multi-size окремими, ranges формат "min-max од")
- [ ] Push на `claude/filter-ui-polish-{XXXX}` (НЕ merge!)

---

## User-action post-merge

- `.\scripts\deploy.ps1` (тільки redeploy, без migration/backfill)

---

## Reference

- `apps/store/components/store/price-range-slider.tsx` — dual-handle slider (reuse)
- `apps/store/app/api/catalog/price-range/route.ts` — pattern для aggregate min/max
- `apps/store/components/store/catalog-filters.tsx` (S72 baseline) — токени `toggleListValue`, `parseList`
- `packages/shared/src/constants/business.ts` — куди додавати `SIZE_OPTIONS`
- `apps/store/lib/catalog.ts` — `searchProducts()` filter logic + `parseMultiValue` helper
