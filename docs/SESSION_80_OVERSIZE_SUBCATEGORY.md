# Session 80 — Remove sizes filter, oversize subcategory, fixed slider ranges

**Type:** Worker session
**Branch:** `claude/oversize-subcategory-{XXXX}`
**Goal:** Видалити блок "Розмір" з фільтрів повністю, додати спеціальну підкатегорію "Великі розміри (XXL+)" в Одяг (через нове Boolean поле + admin checkbox), захардкодити slider ranges 1-1000.

---

## ⚠️ HARD RULES

1. **DO NOT delete the `sizes` column** на Product (може ще знадобитись пізніше). Тільки прибрати з UI + backend filter.
2. **`isOversize` — НЕ нова таблиця** (не many-to-many). Просто Boolean колонка на Product. Менеджер вручну проставляє у admin.
3. **Pseudo-subcategory `xxl-veliki-rozmiry`** не існує у DB як справжня Category — це **спеціальний slug** який catalog handler ловить → переключає filter на `isOversize: true` без category filter. Це cross-cutting tag, не справжня категорія.
4. **DO NOT touch existing categories** структуру. Тільки додай pseudo-tag entry у CATEGORIES для UI sidebar.
5. **DO NOT touch DB-stored unitsPerKgMin/Max, unitWeightMin/Max** колонки (S72) — лишай як є. Тільки UI ranges фіксовані.

---

## Tasks

### Phase 1: DB schema — `isOversize` Boolean

#### 1.1 Migration `packages/db/prisma/migrations/20260509_product_oversize/migration.sql`

```sql
ALTER TABLE "products"
  ADD COLUMN "is_oversize" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "products_is_oversize_idx" ON "products"("is_oversize");
```

#### 1.2 Update `packages/db/prisma/schema.prisma` Product model

Додати перед `createdAt`:

```prisma
isOversize Boolean @default(false) @map("is_oversize")
```

Index:

```prisma
@@index([isOversize])
```

### Phase 2: Pseudo-subcategory у constants

`packages/shared/src/constants/categories.ts` — додай у `odyag` subcategories (наприкінці списку):

```typescript
{ slug: "xxl-veliki-rozmiry", name: "Великі розміри (XXL+)" },
```

⚠️ **Важливо**: тип залишається `Subcategory`. Це слугує тільки UI-якорем (sidebar лінк, breadcrumb). У catalog query handler ловимо цей slug окремо.

Додай **constant** для cleaner check у `categories.ts`:

```typescript
export const OVERSIZE_SLUG = "xxl-veliki-rozmiry";
```

Експорт з `index.ts`.

### Phase 3: Backend filter logic

#### 3.1 `apps/store/lib/catalog.ts::searchProducts()`

Розпізнавати `subcategorySlug === OVERSIZE_SLUG`:

```typescript
import { OVERSIZE_SLUG } from "@ltex/shared";

// Inside the where logic:
if (subcategorySlug === OVERSIZE_SLUG) {
  // Treat as cross-cutting tag — НЕ filter by category, ONLY by isOversize
  where.isOversize = true;
  // Skip category filter (do NOT set where.category / categoryId)
} else if (subcategorySlug) {
  where.category = { slug: subcategorySlug };
} else if (categoryId) {
  // existing logic
}
```

⚠️ Це означає `xxl-veliki-rozmiry` matches **всі** SKUs з `isOversize=true` — навіть якщо їх primary category не Одяг. Юзер хоче саме це cross-cutting.

#### 3.2 `apps/store/app/api/catalog/route.ts`

Не потрібно змінювати — просто прокидає subcategorySlug у searchProducts.

#### 3.3 Видалити `sizes` filter handling

З `lib/catalog.ts::searchProducts`:

- Видали whole `sizes` block (де побудовано `where.OR` з `contains` matches)
- Видали `sizes` з `SearchProductsOptions` interface

З `apps/store/app/api/catalog/route.ts`:

- Видали `sizes: searchParams.getAll("sizes")...` — більше не приймаємо

З `app/(store)/catalog/page.tsx` + `[categorySlug]/page.tsx` + subcategory page:

- Видали forwarding `sizes` param

З `lib/catalog.ts::fullTextSearch`:

- Те саме — видали якщо там handling є

### Phase 4: Admin checkbox

#### 4.1 `apps/store/components/admin/product-form.tsx` (or wherever the form lives)

Додай checkbox "Великий розмір (XXL+)":

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    name="isOversize"
    defaultChecked={product?.isOversize ?? false}
    className="..."
  />
  <span>Великий розмір (XXL+)</span>
  <span className="text-xs text-gray-500">
    — товар з'являтиметься у спеціальній підкатегорії
  </span>
</label>
```

#### 4.2 `apps/store/app/admin/products/actions.ts`

У `createProduct` + `updateProduct` — пропиши `isOversize` з FormData:

```typescript
const isOversize = formData.get("isOversize") === "on";

// в data:
data: {
  // ...existing
  isOversize,
}
```

⚠️ HTML checkbox шле "on" якщо ticked, undefined якщо ні. Default false.

#### 4.3 `/admin/products` list — мінімальний бейдж

Якщо є column для category — додай біля назви маленький бейдж "XXL+" коли `isOversize: true`. Стиль consistent з іншими адмін-бейджами.

### Phase 5: Frontend — Видалення sizes filter

#### 5.1 `apps/store/components/store/catalog-filters.tsx`

- Видали whole sizes block (4-col checkbox grid + label)
- Видали `sizes` import з `@ltex/shared` (SIZE_OPTIONS)
- Видали `sizes` chips з active filter chips section
- Видали `parseList(searchParams.get("sizes"))` + `toggleSize` handlers

#### 5.2 `apps/store/components/store/lots-filters-form.tsx`

- Те саме — видали sizes block, chips, handlers

#### 5.3 `packages/shared/src/constants/business.ts`

Видали `SIZE_OPTIONS` constant (більше не використовується).

З `index.ts` — видали re-export.

### Phase 6: Slider ranges — fixed 1-1000

#### 6.1 `apps/store/app/api/catalog/numeric-ranges/route.ts`

Захардкодити fixed ranges per user request:

```typescript
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      unitsPerKg: { min: 1, max: 1000 },
      unitWeight: { min: 1, max: 1000 },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
```

⚠️ Можна повністю **видалити endpoint** і захардкодити у фронт components. Але endpoint існує — простіше повертати фіксовані. Worker decides.

Видали тести для dynamic aggregation у `route.test.ts` (no longer needed) або переписати на assertion фіксованих 1-1000 значень.

#### 6.2 Можливо frontend має жорстко-кодований fallback

У `catalog-filters.tsx` / `lots-filters-form.tsx` — якщо є fallback ranges типу `{ min: 0, max: 20 }` / `{ min: 0, max: 5 }` — оновити на `{ min: 1, max: 1000 }`.

#### 6.3 Step values

Slider step:

- unitsPerKg: `step={1}` (integer count of pieces)
- unitWeight: `step={1}` (бо рейндж тепер 1-1000 кг — крок 0.01 не має сенсу для такого масштабу)

Update obох sliders.

### Phase 7: Tests

- `lib/catalog.test.ts`:
  - test `subcategorySlug === "xxl-veliki-rozmiry"` → returns тільки `isOversize=true` products (across ALL categories)
  - delete sizes filter tests
- `app/admin/products/actions.test.ts` (якщо є): create/update з isOversize=true
- `lib/customer-auth.test.ts` etc — не торкати
- `app/api/catalog/numeric-ranges/route.test.ts` — оновити на fixed values

### Phase 8: Backfill — НЕМАЄ

Усі products start with `isOversize=false` (default). Менеджер вручну позначає у admin. Skip backfill.

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] Migration `20260509_product_oversize` створена + тест-локально успішно
- [ ] CATEGORIES має нову `xxl-veliki-rozmiry` підкатегорію в Одяг
- [ ] `OVERSIZE_SLUG` constant exported з `@ltex/shared`
- [ ] `searchProducts` правильно ловить `xxl-veliki-rozmiry` slug → `where.isOversize: true`
- [ ] Admin product form має checkbox "Великий розмір (XXL+)"
- [ ] Admin actions зберігають `isOversize` з FormData
- [ ] catalog-filters.tsx + lots-filters-form.tsx — НЕ показують блок Розмір (видалено повністю)
- [ ] `SIZE_OPTIONS` constant видалено з shared
- [ ] `/api/catalog/numeric-ranges` повертає fixed `{1, 1000}`/`{1, 1000}`
- [ ] Слайдери unitsPerKg + unitWeight у UI показують 1-1000 діапазон
- [ ] Push на `claude/oversize-subcategory-{XXXX}` (НЕ merge!)

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
pnpm install
pnpm --filter @ltex/db exec prisma migrate deploy   # ← новий step
.\scripts\deploy.ps1
```

Після deploy:

1. Зайти у admin → /admin/products → відкрити будь-який товар → побачити checkbox "Великий розмір" → відмітити кілька → save
2. Зайти на `/catalog/odyag/xxl-veliki-rozmiry` (або через sidebar Одяг → Великі розміри) → побачити тільки відмічені продукти
3. На /catalog у sidebar бачимо нову підкатегорію
4. Філтр "Розмір" зник з фільтрів — нема blocks XS/S/M/L

---

## Reference

- `packages/db/prisma/schema.prisma:32` — Product model
- `packages/shared/src/constants/categories.ts` — categories tree
- `apps/store/lib/catalog.ts::searchProducts()` — main filter logic
- `apps/store/components/admin/product-form.tsx` (or where edit form lives)
- `apps/store/app/admin/products/actions.ts` — Server Actions
- `apps/store/components/store/catalog-filters.tsx` — sidebar filters
- `apps/store/components/store/lots-filters-form.tsx` — DRY desktop+mobile lots filters
- `apps/store/app/api/catalog/numeric-ranges/route.ts` — slider bounds endpoint
