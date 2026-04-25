# Session 30 — Worker Task: Catalog Filters → Left Sidebar + Mobile Drawer

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX modernization per user feedback)
**Очікуваний ефорт:** 45-60 хвилин
**Тип:** worker session (medium-large / атомарний)

---

## Контекст

User: "фільтри потрібно змістити вліво в шторку, як на рендерах з інших сайтів". Поточно `<CatalogFilters />` рендериться full-width inline під заголовком — займає багато вертикального простору і виглядає старомодно для B2B каталогу 2026 року.

Стандартний паттерн для product catalog:

- **Desktop (≥1024px):** ліва колонка ~280px з sticky фільтрами + права колонка з продуктами
- **Mobile (<1024px):** кнопка "Фільтри" відкриває drawer/sheet з тими ж фільтрами знизу або справа

---

## Branch

`claude/session-30-filters-left-sidebar` від main.

**Залежність:** S28 + S29 краще merged раніше (немає прямого конфлікту, але filters touch не зачіпає product-card).

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` зелені
2. **НЕ змінювати** semantics filter URL params (`?quality=`, `?season=`, `?country=`, `?priceMin=`, etc.) — backend (`getCatalogProducts`) лишається той самий
3. **НЕ міняти** `lib/catalog.ts` query logic
4. **НЕ зачіпати** `app/(store)/page.tsx` (homepage) — фільтри тільки на `/catalog` і `/catalog/[categorySlug]`
5. **Mobile breakpoint:** `lg:` (1024px). Ниже — drawer; вище — sticky sidebar
6. **Existing filter inputs** не міняти (search, quality select, season, country, sort, subcategory, in-stock checkbox, price range) — лише re-layout

---

## Tasks

### Task 1: Refactor `CatalogFilters` для vertical stack

**Файл:** `apps/store/components/store/catalog-filters.tsx`

Поточно фільтри у `flex flex-wrap gap-3` (горизонтально). Треба:

- Кожен фільтр в окремий блок з `<label>` зверху + control під ним
- Width: `w-full` (займають всю ширину sidebar колонки)
- Vertical spacing: `space-y-4`
- Колір секції label: `text-sm font-medium text-gray-700`

**Структурно** (приклад одного блоку):

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700">
    {dict.catalog.qualityLabel ?? "Якість"}
  </label>
  <select
    value={searchParams.get("quality") ?? ""}
    onChange={(e) => updateFilter("quality", e.target.value)}
    className="w-full rounded-md border px-3 py-2 text-sm"
  >
    {/* options */}
  </select>
</div>
```

**Search input** — лишити зверху (як є, але `w-full`).

**Price range** — `<div>` з двома input-ами поряд (`flex gap-2`), label "Ціна (€)" зверху.

**Clear all** — кнопка внизу sidebar, `w-full` text-center.

**Subcategory** — лишається optional (рендерити тільки якщо `subcategories.length > 0`).

### Task 2: Створити `<CatalogSidebar>` wrapper

**Новий файл:** `apps/store/components/store/catalog-sidebar.tsx`

```tsx
"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { CatalogFilters, type SubcategoryOption } from "./catalog-filters";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export function CatalogSidebar({
  subcategories,
}: {
  subcategories?: SubcategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 lg:hidden"
        aria-label={dict.catalog.openFilters ?? "Відкрити фільтри"}
      >
        <Filter className="h-4 w-4" />
        {dict.catalog.filters ?? "Фільтри"}
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-white p-4">
          <CatalogFilters subcategories={subcategories} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {dict.catalog.filters ?? "Фільтри"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-2 hover:bg-gray-100"
                aria-label="Закрити"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <CatalogFilters subcategories={subcategories} />
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
            >
              {dict.catalog.applyFilters ?? "Показати товари"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

**Альтернатива:** якщо проєкт вже має `<Sheet />` з shadcn/ui (`@ltex/ui`) — використати його замість manual drawer. Worker — спочатку перевір `packages/ui/src/` чи `apps/store/components/ui/` на наявність Sheet.

### Task 3: Update catalog pages to use sidebar layout

**Файли:**
- `apps/store/app/(store)/catalog/page.tsx`
- `apps/store/app/(store)/catalog/[categorySlug]/page.tsx`

Обернути products у row layout:

```tsx
<div className="container mx-auto px-4 py-6">
  <Breadcrumbs ... />
  <div className="mt-4 flex items-center justify-between">
    <h1>...</h1>
    <CatalogViewToggle ... />  {/* лишається до S31 */}
  </div>

  {/* Categories chips — лишаються full-width під заголовком */}
  <div className="mt-4 flex flex-wrap gap-2">
    {CATEGORIES.map(...)}
  </div>

  {/* New layout: sidebar + main */}
  <div className="mt-6 flex flex-col gap-6 lg:flex-row">
    <CatalogSidebar subcategories={subcategories} />

    <div className="flex-1 min-w-0">
      {products.length === 0 ? (
        <p>...</p>
      ) : isInfiniteScroll ? (
        <InfiniteScrollCatalog ... />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {products.map(...)}
          </div>
          <Pagination ... />
        </>
      )}
    </div>
  </div>
</div>
```

**Important:** видалити старий `<div className="mt-6"><CatalogFilters /></div>` блок — він більше не потрібен.

**Important:** колонок продуктів тепер `lg:grid-cols-3 xl:grid-cols-4` (бо sidebar з'їдає простір) замість `lg:grid-cols-4`. Mobile (без sidebar) — `grid-cols-2 sm:grid-cols-3` як було.

### Task 4: i18n keys

**Файл:** `apps/store/lib/i18n/uk.ts`

Додати у `catalog` block:

```ts
filters: "Фільтри",
openFilters: "Відкрити фільтри",
applyFilters: "Показати товари",
qualityLabel: "Якість",
seasonLabel: "Сезон",
countryLabel: "Країна",
sortLabel: "Сортування",
```

Решта label-ів — реюзати existing (`allQualities`, `allSeasons` etc.).

### Task 5: Update `infinite-scroll-catalog.tsx` grid cols

**Файл:** `apps/store/components/store/infinite-scroll-catalog.tsx`

Поточно:

```tsx
<div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
```

Замінити на:

```tsx
<div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
```

(той самий tweak як у Task 3, бо infinite path рендерить власний grid wrapper)

---

## Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS
- [ ] `pnpm -r test` — PASS (existing CatalogFilters тести працюють бо ми не міняли semantics)
- [ ] `pnpm build` — PASS
- [ ] Manual visual (worker description у PR): "Catalog has left sidebar on desktop with sticky filters; mobile shows 'Filters' button that opens bottom-sheet drawer"
- [ ] git diff: 4-5 файлів змінених, 1 новий (catalog-sidebar.tsx)
- [ ] Адмінка / mobile app / packages — 0 changes

---

## Out of scope

- Видалення compare — S29
- Grid/list layout toggle — S31
- Active filter chips bar (відображення активних фільтрів) — окрема сесія
- Saved filter presets — окрема
- URL state persistence — already working

---

## Commit strategy

```
feat(catalog): move filters to left sidebar (desktop) + drawer (mobile)

User feedback: filters were a horizontal full-width strip taking
significant vertical space. Standard B2B catalog UX is left sticky
sidebar (≥1024px) with mobile bottom-sheet drawer.

Changes:
- New <CatalogSidebar> wrapper with sticky desktop column +
  mobile drawer (lg:hidden trigger button + bottom-sheet overlay)
- Refactored <CatalogFilters> as vertical stack with field labels
- Updated /catalog and /catalog/[categorySlug] pages to row layout
  (sidebar + main)
- Adjusted product grid to lg:grid-cols-3 xl:grid-cols-4 to fit
  sidebar; mobile grid unchanged (2/3 cols)
- Added i18n keys (filters, applyFilters, qualityLabel, etc.)

No backend / API changes — filter URL params and getCatalogProducts
query identical.
```

---

## Push

```bash
git push -u origin claude/session-30-filters-left-sidebar
```

Завершити повідомленням orchestrator-у з:
- Branch name
- Чи Sheet з shadcn вдалось переюзати чи зроблено manual drawer
- Скріншот спроможність (worker — write a 2-line описання очікуваного візуалу для orchestrator manual smoke)
