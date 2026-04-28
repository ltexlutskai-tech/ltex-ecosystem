# Session 51 — Worker Task: Search Facets (Price Slider + Multi-Select)

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P3 (UX — кращий filter discovery + менше кліків для compound query)
**Очікуваний ефорт:** 3-4 години
**Тип:** worker session

---

## Контекст

Web/mobile catalog мають фільтри `quality`, `season`, `country`, `priceMin/priceMax` (single select + numeric inputs). Wholesale users часто шукають **multiple options** — наприклад "Англія АБО Німеччина" — зараз треба перемикатись між запитами. Price filtering — два numeric input замість slider, незручно на mobile.

S51 додає:

1. **Price range slider** — dual-handle slider компонент замість min/max input fields. Web (catalog sidebar) + mobile (bottom-sheet).
2. **Quality multi-select** — checkboxes замість single radio. Backend приймає `?quality=A&quality=B` АБО `?quality=A,B` (parse arrays).
3. **Country multi-select** — те саме.
4. **Season** залишається single-select (тільки 4 значення, не дає UX win).

**Brand filter** — out-of-scope, у `Product` schema немає `brand` field.

---

## Branch

`claude/session-51-search-facets` від main.

---

## Hard rules

1. Backend `getCatalogProducts` (apps/store/lib/catalog.ts) приймає `quality?: string | string[]` і `country?: string | string[]`. Всередині — `where.quality = { in: [...] }` коли array.
2. URL convention: comma-separated (`?quality=Екстра,Крем`). Менше дублювання query param keys.
3. Web sidebar (`apps/store/components/store/catalog-sidebar.tsx` або існуючий filter component) — checkboxes для multi-select.
4. Mobile sheet (`apps/mobile-client/src/components/CatalogFilterSheet.tsx`) — checkboxes для quality/country.
5. Price slider — pure-RN на mobile (без deps на community-slider бо expo-slider deprecated). На web — нативний `<input type="range">` × 2 з overlap fix.
6. **Backward compat**: existing `?quality=Екстра` (single value) має працювати.
7. **Min/max range** — обчислити з реальних DB prices (не hardcoded). Server-rendered initial range через окремий endpoint `/api/catalog/price-range`.
8. CI: 283 unit baseline + format + typecheck + build green. +4 нових тести (multi-select parsing, price-range endpoint, slider component).

---

## Файли

### 1. Backend — multi-select + price range endpoint

**`apps/store/lib/catalog.ts`** — extend `quality` і `country`:

```typescript
interface CatalogQueryParams {
  ...
  quality?: string | string[];
  country?: string | string[];
  ...
}

// у where building:
if (quality) {
  if (Array.isArray(quality)) {
    where.quality = { in: quality };
  } else if (quality.includes(",")) {
    where.quality = { in: quality.split(",").map((s) => s.trim()).filter(Boolean) };
  } else {
    where.quality = quality; // backward compat single value
  }
}
// Те саме для country.
```

**`apps/store/app/api/catalog/route.ts`** — pass-through (URL вже carries comma-separated):

```typescript
const quality = searchParams.get("quality") ?? undefined;
const country = searchParams.get("country") ?? undefined;
// getCatalogProducts розпарсить comma-list всередині.
```

**`apps/store/app/api/catalog/price-range/route.ts`** (new) — мін/макс цін у `wholesale` priceType:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const revalidate = 300; // 5min

export async function GET() {
  const result = await prisma.price.aggregate({
    where: { priceType: "wholesale" },
    _min: { amount: true },
    _max: { amount: true },
  });
  return NextResponse.json({
    min: Math.floor(result._min.amount ?? 0),
    max: Math.ceil(result._max.amount ?? 100),
  });
}
```

3 vitest cases: aggregate happy-path, empty DB → defaults 0/100, single product → min=max.

### 2. Mobile — multi-select checkboxes + price slider

**`apps/mobile-client/src/components/CatalogFilterSheet.tsx`** — заміна single Picker для quality + country на checkbox list:

```typescript
interface FilterState {
  ...
  qualities: string[]; // was: quality: string | undefined
  countries: string[];
  priceMin: number | undefined;
  priceMax: number | undefined;
  ...
}

// UI: Pressable rows з Ionicons checkbox
{QUALITY_OPTIONS.map((q) => {
  const selected = filters.qualities.includes(q);
  return (
    <Pressable
      key={q}
      style={styles.checkboxRow}
      onPress={() =>
        handleFilterChange({
          ...filters,
          qualities: selected ? filters.qualities.filter(x => x !== q) : [...filters.qualities, q],
        })
      }
    >
      <Ionicons name={selected ? "checkbox" : "square-outline"} size={20} />
      <Text>{q}</Text>
    </Pressable>
  );
})}
```

**Price slider** — pure RN компонент `apps/mobile-client/src/components/PriceRangeSlider.tsx` (new):

```typescript
import { View, PanResponder, StyleSheet, Text } from "react-native";
import { useState, useRef } from "react";

interface Props {
  min: number;
  max: number;
  values: [number, number];
  onChange: (values: [number, number]) => void;
  width: number;
}

export function PriceRangeSlider({ min, max, values, onChange, width }: Props) {
  // 2 PanResponders для лівого/правого handle
  // Track + 2 thumbs (left = min handle, right = max handle)
  // Constrain: leftHandle <= rightHandle - 1
  // ...
}
```

(Worker реалізує — 80-100 рядків. Або використати existing `@react-native-community/slider` × 2 якщо вже є у deps.)

**`apps/mobile-client/src/lib/api.ts`** — `catalogApi.priceRange()`:

```typescript
export const catalogApi = {
  ...
  async priceRange() { return apiFetch<{ min: number; max: number }>("/catalog/price-range"); },
};
```

CatalogFilterSheet on mount → fetch priceRange → init slider bounds.

**Apply filters** — comma-join перед URL:

```typescript
params.set("quality", filters.qualities.join(",")); // якщо length > 0
params.set("country", filters.countries.join(","));
```

### 3. Web — multi-select + price slider

**`apps/store/components/store/catalog-sidebar.tsx`** (або existing filter component) — checkboxes для quality + country:

```tsx
<div className="space-y-2">
  <h3>Якість</h3>
  {QUALITY_OPTIONS.map((q) => (
    <label key={q} className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={selectedQualities.includes(q)}
        onChange={(e) => {
          const next = e.target.checked
            ? [...selectedQualities, q]
            : selectedQualities.filter((x) => x !== q);
          updateUrl({ quality: next.join(",") });
        }}
      />
      <span>{q}</span>
    </label>
  ))}
</div>
```

**Web price slider** — `apps/store/components/store/price-range-slider.tsx` (new):

```tsx
"use client";

interface Props {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function PriceRangeSlider({ min, max, value, onChange }: Props) {
  // Two <input type="range"> overlaid, handle min ≤ max constraint
  // Show current values above thumbs
  // ...
}
```

3 vitest cases (component renders, drag updates value, constraint enforced).

### 4. Tests

- `apps/store/lib/catalog.test.ts` — 2 cases для multi-select (`quality=A,B` → `where.quality.in: [A,B]`, `quality=A` → backward compat `where.quality = A`).
- `apps/store/app/api/catalog/price-range/route.test.ts` — 3 cases.
- Web slider component test — 3 cases у `price-range-slider.test.tsx`.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ ≥291 (283 + 8)
4. `deploy.ps1` ASCII-only ✅

---

## Out-of-scope

- Brand filter (no field у DB)
- Saved filters / filter presets
- "Apply" button delay debounce (slider — onChange final value, не on-drag)
- Server-side facet counts (показ "Англія (45)" — окрема велика задача з aggregate query)
- Fuzzy quality matching ("Екстра" vs "extra")

---

## Branch + commit + push

Branch: `claude/session-51-search-facets`
Commit: `feat(s51): search facets — price slider + multi-select quality/country`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий `deploy.ps1`. Накопичується в чергу разом з S46-S50.
