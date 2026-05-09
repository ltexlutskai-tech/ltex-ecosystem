# Session 72 — Catalog filters (gender, sizes, units/weight ranges)

**Type:** Worker session
**Branch:** `claude/catalog-filters-{XXXX}`
**Goal:** Додати 5 нових фільтрів у `/catalog` (gender, sizes, unitsPerKg range, unitWeight range) та `/lots` (де треба — gender, sizes теж). Всі 8 критеріїв з опису продукту мають бути доступні для пошуку.

---

## ⚠️ HARD RULES

1. **Schema migration ОДНА** — `20260508_product_numeric_ranges`. Чотири nullable Float поля. Не рухай інші моделі.
2. **DO NOT change existing string columns** (`unitsPerKg`, `unitWeight`, `sizes`) — лиши як human-readable text. Numeric поля — додаткові.
3. **Backfill — окремий запускаємий скрипт** (не міграція). Юзер запустить вручну на сервері.
4. **DO NOT trigger redeploy у спеці** — тільки описати "user buys redeploy after merge" як post-merge action.
5. Range filters використовують **closed interval**: продукт включається якщо `[productMin, productMax] перетинається з [filterMin, filterMax]`. Не точне match.

---

## Поточний стан (gap analysis)

**`/catalog` (`apps/store/components/store/catalog-filters.tsx`, 305 рядків):**

| Filter     | Status | UI             |
| ---------- | ------ | -------------- |
| quality    | ✅     | multi-checkbox |
| season     | ✅     | single select  |
| country    | ✅     | multi-checkbox |
| gender     | ❌     | (немає)        |
| sizes      | ❌     | (немає)        |
| unitsPerKg | ❌     | (немає)        |
| unitWeight | ❌     | (немає)        |

**`/lots` (`apps/store/components/store/lots-filters-form.tsx`, 321 рядок):**

| Filter       | Status                           |
| ------------ | -------------------------------- |
| status       | ✅                               |
| quality      | ✅                               |
| season       | ✅                               |
| country      | ✅                               |
| weight (lot) | ✅                               |
| price        | ✅                               |
| gender       | ❌                               |
| sizes        | ❌                               |
| unitsPerKg   | ❌ (унаслідовується від product) |
| unitWeight   | ❌ (унаслідовується від product) |

**API endpoints:**

- `/api/catalog/route.ts` (48 рядків) → `lib/catalog.ts::searchProducts()` — приймає quality/season/country, треба додати решту
- `/lots` server-side — `app/lots/page.tsx` (треба перевірити структуру)

---

## Tasks

### 1. Schema migration

Створи файл `packages/db/prisma/migrations/20260508_product_numeric_ranges/migration.sql`:

```sql
ALTER TABLE "products"
  ADD COLUMN "units_per_kg_min" DOUBLE PRECISION,
  ADD COLUMN "units_per_kg_max" DOUBLE PRECISION,
  ADD COLUMN "unit_weight_min" DOUBLE PRECISION,
  ADD COLUMN "unit_weight_max" DOUBLE PRECISION;

CREATE INDEX "products_units_per_kg_min_idx" ON "products"("units_per_kg_min");
CREATE INDEX "products_units_per_kg_max_idx" ON "products"("units_per_kg_max");
CREATE INDEX "products_unit_weight_min_idx" ON "products"("unit_weight_min");
CREATE INDEX "products_unit_weight_max_idx" ON "products"("unit_weight_max");
```

Update `packages/db/prisma/schema.prisma` — Product model:

```prisma
model Product {
  // ...existing
  unitsPerKg     String? @map("units_per_kg")
  unitsPerKgMin  Float?  @map("units_per_kg_min")     // NEW
  unitsPerKgMax  Float?  @map("units_per_kg_max")     // NEW
  unitWeight     String? @map("unit_weight")
  unitWeightMin  Float?  @map("unit_weight_min")      // NEW
  unitWeightMax  Float?  @map("unit_weight_max")      // NEW
  // ...

  @@index([unitsPerKgMin])
  @@index([unitsPerKgMax])
  @@index([unitWeightMin])
  @@index([unitWeightMax])
}
```

### 2. Helper parsers у `@ltex/shared/utils/import-catalog.ts`

Додати екс́порт:

```typescript
export function parseRangeString(
  s: string | null | undefined,
): { min: number; max: number } | null {
  if (!s) return null;
  // Supports: "2-4", "2-4 шт/кг", "0.25-0.45 кг", "0,25-0,45 кг", "10", "1.5", "2,5"
  const normalized = s.replace(/,/g, ".");
  // Try range "a-b"
  const rangeMatch = normalized.match(
    /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/,
  );
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }
  // Single number
  const singleMatch = normalized.match(/-?\d+(?:\.\d+)?/);
  if (singleMatch) {
    const n = Number(singleMatch[0]);
    if (Number.isFinite(n)) return { min: n, max: n };
  }
  return null;
}
```

Tests у `packages/shared/src/utils/import-catalog.test.ts`:

- `parseRangeString("2-4 шт/кг")` → `{ min: 2, max: 4 }`
- `parseRangeString("0.25-0.45 кг")` → `{ min: 0.25, max: 0.45 }`
- `parseRangeString("0,25-0,45 кг")` → `{ min: 0.25, max: 0.45 }` (decimal comma)
- `parseRangeString("10")` → `{ min: 10, max: 10 }`
- `parseRangeString("4-2")` → `{ min: 2, max: 4 }` (auto-swap)
- `parseRangeString(null)` → `null`
- `parseRangeString("")` → `null`
- `parseRangeString("шт/кг")` → `null`

### 3. Backfill script `scripts/backfill-numeric-ranges.ts`

Створи новий script. Усі products де `unitsPerKgMin == null && unitsPerKg != null` → парсити, оновлювати. Те саме для `unitWeight`. CLI без `--apply` → DRY-RUN (просто log скільки буде оновлено), `--apply` → реальний update.

Pseudo:

```typescript
const products = await prisma.product.findMany({
  where: {
    OR: [
      { unitsPerKg: { not: null }, unitsPerKgMin: null },
      { unitWeight: { not: null }, unitWeightMin: null },
    ],
  },
  select: {
    id: true,
    articleCode: true,
    unitsPerKg: true,
    unitWeight: true,
    unitsPerKgMin: true,
    unitWeightMin: true,
  },
});

let updated = 0,
  skipped = 0,
  parseErrors: string[] = [];
for (const p of products) {
  const data: Record<string, number> = {};
  if (p.unitsPerKg && p.unitsPerKgMin == null) {
    const r = parseRangeString(p.unitsPerKg);
    if (r) {
      data.unitsPerKgMin = r.min;
      data.unitsPerKgMax = r.max;
    } else {
      parseErrors.push(`${p.articleCode}: unitsPerKg="${p.unitsPerKg}"`);
    }
  }
  if (p.unitWeight && p.unitWeightMin == null) {
    const r = parseRangeString(p.unitWeight);
    if (r) {
      data.unitWeightMin = r.min;
      data.unitWeightMax = r.max;
    } else {
      parseErrors.push(`${p.articleCode}: unitWeight="${p.unitWeight}"`);
    }
  }
  if (Object.keys(data).length === 0) {
    skipped++;
    continue;
  }
  if (DRY_RUN) updated++;
  else {
    await prisma.product.update({ where: { id: p.id }, data });
    updated++;
  }
}
console.log(
  `updated=${updated}, skipped=${skipped}, parseErrors=${parseErrors.length}`,
);
console.log("First 10 parse errors:", parseErrors.slice(0, 10));
```

### 4. Update import script

У `scripts/import-catalog-from-excel.ts` після parse description (де записуємо `unitsPerKg`/`unitWeight` як strings) — паралельно записувати numeric ranges:

```typescript
const unitsRange = parseRangeString(parsed.unitsPerKg);
const weightRange = parseRangeString(parsed.unitWeight);

const productData = {
  // ...existing
  unitsPerKg: parsed.unitsPerKg ?? null,
  unitsPerKgMin: unitsRange?.min ?? null,
  unitsPerKgMax: unitsRange?.max ?? null,
  unitWeight: parsed.unitWeight ?? null,
  unitWeightMin: weightRange?.min ?? null,
  unitWeightMax: weightRange?.max ?? null,
};
```

### 5. Backend filters

#### 5.1 `apps/store/lib/catalog.ts`

Додати у `searchProducts()` опції:

```typescript
export interface SearchProductsOptions {
  // ...existing
  gender?: string | string[];
  sizes?: string; // sub-string match
  unitsPerKgMin?: number;
  unitsPerKgMax?: number;
  unitWeightMin?: number;
  unitWeightMax?: number;
}
```

Where logic:

```typescript
// Gender — multi-select
const genderValue = parseMultiValue(gender);
if (genderValue) {
  where.gender = Array.isArray(genderValue) ? { in: genderValue } : genderValue;
}

// Sizes — string contains (e.g. user types "XXL" → matches "XS-2XL", "M-XXL")
if (sizes) {
  where.sizes = { contains: sizes, mode: "insensitive" };
}

// unitsPerKg range overlap: продукт.[Min, Max] ∩ filter.[fMin, fMax] ≠ ∅
//   ⇔ productMax ≥ filterMin && productMin ≤ filterMax
if (unitsPerKgMin != null) {
  where.unitsPerKgMax = { gte: unitsPerKgMin };
}
if (unitsPerKgMax != null) {
  where.unitsPerKgMin = { lte: unitsPerKgMax };
}
// Те саме для unitWeight
```

#### 5.2 `/api/catalog/route.ts`

Додати search params parsing:

```typescript
gender: searchParams.get("gender") ?? undefined,
sizes: searchParams.get("sizes") ?? undefined,
unitsPerKgMin: parseFloat(searchParams.get("unitsPerKgMin") ?? "") || undefined,
unitsPerKgMax: parseFloat(searchParams.get("unitsPerKgMax") ?? "") || undefined,
unitWeightMin: parseFloat(searchParams.get("unitWeightMin") ?? "") || undefined,
unitWeightMax: parseFloat(searchParams.get("unitWeightMax") ?? "") || undefined,
```

#### 5.3 `/lots` page — `apps/store/app/lots/page.tsx`

Додай ті самі фільтри для лотів через `lot.product.{gender, sizes, unitsPerKgMin/Max, unitWeightMin/Max}`. Pseudo where:

```typescript
const productFilter: Prisma.ProductWhereInput = {};
if (genderValue) productFilter.gender = ...;
if (sizes) productFilter.sizes = { contains: sizes, mode: "insensitive" };
// ... ranges

if (Object.keys(productFilter).length > 0) {
  where.product = productFilter;
}
```

### 6. Frontend UI

#### 6.1 Constants для UI

Додай у `packages/shared/src/constants/business.ts`:

```typescript
export const GENDER_OPTIONS = [
  "Жіноча",
  "Чоловіча",
  "Дитяча",
  "Унісекс",
  "Дорослий",
] as const;
```

#### 6.2 `apps/store/components/store/catalog-filters.tsx`

Додай 4 нові секції після country (приблизно рядок 230):

**Gender (multi-checkbox):** як у quality — ітер по `GENDER_OPTIONS`, toggleListValue.

**Sizes (text input):**

```tsx
<div className="...">
  <label htmlFor="filter-sizes" className={labelClass}>
    Розмір
  </label>
  <input
    id="filter-sizes"
    type="text"
    placeholder="напр. XL, XXL, 42"
    value={searchParams.get("sizes") ?? ""}
    onChange={(e) => debouncedUpdate("sizes", e.target.value)}
    className="..."
  />
</div>
```

Додати простий debounce (300мс) щоб не SSR-bombard.

**unitsPerKg range slider/inputs:**

```tsx
<div className="...">
  <span className={labelClass}>К-сть одиниць (шт/кг)</span>
  <div className="grid grid-cols-2 gap-2">
    <input type="number" placeholder="від" min="0" step="0.1" value={unitsMinDraft} onChange={...} />
    <input type="number" placeholder="до" min="0" step="0.1" value={unitsMaxDraft} onChange={...} />
  </div>
  <button onClick={applyUnitsRange}>Застосувати</button>
</div>
```

Pattern як у `lots-filters-form.tsx` price/weight ranges (з Apply button — не onBlur, бо UX win).

**unitWeight range:**
Аналогічно, label "Вага одиниці (кг)", inputs "від"/"до".

Active filter chips (рядок 145+) — додай для усіх нових.

#### 6.3 `lots-filters-form.tsx`

Додай ті самі 4 секції (gender/sizes/unitsPerKg/unitWeight) — desktop sidebar + mobile bottom-sheet (DRY через спільну форму).

#### 6.4 i18n

У `apps/store/lib/i18n/uk.ts` додай нові label keys:

- `dict.catalog.genderLabel = "Стать"`
- `dict.catalog.sizesLabel = "Розмір"`
- `dict.catalog.unitsPerKgLabel = "К-сть одиниць (шт/кг)"`
- `dict.catalog.unitWeightLabel = "Вага одиниці (кг)"`

(Англійський variant теж — `dict.en` якщо є, або skip якщо тільки uk.)

### 7. Tests

- `lib/catalog.test.ts` — додай 4 test cases:
  - filter by `gender=Жіноча` returns тільки women's products
  - filter by `sizes=XXL` returns products with "XXL" чи "XS-2XL" (substring)
  - filter by `unitsPerKgMin=2&unitsPerKgMax=5` returns products де range overlaps
  - filter by `unitWeightMin=0.3` returns products де unitWeightMax >= 0.3
- `import-catalog.test.ts` — `parseRangeString` 8 cases (already у §2)

### 8. Documentation

Створи `docs/SESSION_72_FILTERS_OPERATIONS.md` (короткий, ~80 рядків):

1. Як запустити migration: `pnpm --filter @ltex/db exec prisma migrate deploy`
2. Як запустити backfill: `pnpm exec tsx scripts/backfill-numeric-ranges.ts --apply`
3. Як перевірити що працює: example cURL запити з новими query params
4. Що буде у UI на каталозі (4 нові секції фільтрів)

---

## Acceptance criteria

- [ ] `pnpm format:check` зелений
- [ ] `pnpm -r typecheck` зелений
- [ ] `pnpm -r test` зелений (з новими тестами)
- [ ] `pnpm -r build` зелений
- [ ] Новий migration `20260508_product_numeric_ranges` створено + працює локально
- [ ] `parseRangeString` exported з `@ltex/shared` + 8 unit tests
- [ ] `scripts/backfill-numeric-ranges.ts` створено, dry-run за замовчуванням
- [ ] `scripts/import-catalog-from-excel.ts` оновлено — пише numeric ranges
- [ ] `/api/catalog` приймає 6 нових query params (gender, sizes, unitsPerKgMin/Max, unitWeightMin/Max)
- [ ] `lib/catalog.ts::searchProducts()` фільтрує за усіма 6
- [ ] `/lots` page query — 4 додаткові filters працюють через `where.product`
- [ ] `catalog-filters.tsx` показує 4 нові секції (gender, sizes, units/weight ranges)
- [ ] `lots-filters-form.tsx` показує ті самі 4 нові секції (desktop + mobile)
- [ ] Active filter chips відображають gender/sizes/ranges
- [ ] Push на `claude/catalog-filters-{XXXX}` (НЕ merge!)

---

## User-action post-merge (для orchestrator → user)

1. `pnpm --filter @ltex/db exec prisma migrate deploy` на server
2. `pnpm exec tsx scripts/backfill-numeric-ranges.ts --apply` (одноразово)
3. `.\scripts\deploy.ps1` (redeploy для UI зміни)

---

## Reference

- `apps/store/components/store/catalog-filters.tsx` (305) — поточний UI каталогу
- `apps/store/components/store/lots-filters-form.tsx` (321) — поточний UI лотів (DRY desktop+mobile)
- `apps/store/lib/catalog.ts` — `searchProducts()` query logic
- `apps/store/app/api/catalog/route.ts` (48) — query parsing
- `packages/shared/src/utils/import-catalog.ts` — куди додавати `parseRangeString`
- `packages/db/prisma/schema.prisma` — Product model (lines 32-72)
- `docs/CATALOG_IMPORT_PLAN.md` §2.4 — як зараз парсяться description checklist fields
