# Session 31 — Worker Task: Grid/List Layout Toggle for Catalog

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX feature per user feedback)
**Очікуваний ефорт:** 45 хвилин
**Тип:** worker session (medium / атомарний)

---

## Контекст

User: "кнопка зміни списку не працює, але зроби, щоб працювала і можна було переключати з кількох товарів на сторінці до одного".

Поточний `<CatalogViewToggle>` перемикає `pagination` ↔ `infinite` (спосіб завантаження), що візуально невідрізнимо для користувача — обидва варіанти показують 4 cols grid. User думає що це layout toggle (grid vs list). Перенести toggle на правильну роль:

- **Grid mode (default):** як зараз — 2/3/4 cols адаптивно
- **List mode:** 1 колонка, кожна card horizontal (image зліва ~30%, info справа ~70%)

Pagination/infinite scroll для load — НЕ показувати у UI; лишити infinite доступним через `?view=infinite` URL параметр (для power users / direct links), але видалити UI toggle.

---

## Branch

`claude/session-31-grid-list-layout-toggle` від main.

**Залежність:** S30 краще merged раніше (бо catalog page layout зачіпається). Worker — rebase від main перед коммітом якщо S30 вже merged.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` зелені
2. **НЕ видаляти** `InfiniteScrollCatalog` компонент — лишається working через `?view=infinite`
3. **НЕ міняти** filter URL semantics — лише додати `?layout=list` (default = grid)
4. **`<ProductCard>` API** не міняти — додати `mode?: "grid" | "list"` prop із дефолтом `"grid"`
5. Mobile (< sm) — все одно показуємо 1-2 cols у grid mode; list mode на mobile = full-width horizontal cards (як уже звична forma на mobile)

---

## Tasks

### Task 1: Перейменувати `CatalogViewToggle` → `CatalogLayoutToggle`

**Файл:** `apps/store/components/store/catalog-view-toggle.tsx`

Перейменувати у `catalog-layout-toggle.tsx` (`git mv`).

**Нова логіка:**

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

interface CatalogLayoutToggleProps {
  currentLayout: "grid" | "list";
}

export function CatalogLayoutToggle({ currentLayout }: CatalogLayoutToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setLayout = (layout: "grid" | "list") => {
    const params = new URLSearchParams(searchParams.toString());
    if (layout === "grid") {
      params.delete("layout");
    } else {
      params.set("layout", layout);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      <button
        onClick={() => setLayout("grid")}
        className={`rounded-md p-1.5 transition-colors ${
          currentLayout === "grid"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Сітка"
        title="Сітка"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => setLayout("list")}
        className={`rounded-md p-1.5 transition-colors ${
          currentLayout === "list"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Список"
        title="Список"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
```

**Important:** використати `pathname` з hook (бо в S31 toggle працює і на `/catalog`, і на `/catalog/[slug]`), не hardcode `/catalog`.

### Task 2: Додати `mode` prop у `<ProductCard>`

**Файл:** `apps/store/components/store/product-card.tsx`

```tsx
export function ProductCard({
  product,
  isNew,
  hasSale,
  mode = "grid",
}: {
  product: ProductCardData;
  isNew?: boolean;
  hasSale?: boolean;
  mode?: "grid" | "list";
}) {
  // ...

  if (mode === "list") {
    return <ProductCardList ... />; // see Task 3
  }

  // existing grid card markup
  return (...);
}
```

**Decision:** окремий sub-component `ProductCardList` (внутрішній, не експортований) для list mode. Грид залишається як є.

### Task 3: Імплементувати `ProductCardList` (горизонтальний layout)

Внутрішній component у тому ж `product-card.tsx`:

```tsx
function ProductCardList({ product, ...overlayProps }: Props) {
  // ...
  return (
    <div className="group relative">
      <Link href={`/product/${product.slug}`} data-analytics="product-card-click">
        <Card className="overflow-hidden transition-shadow hover:shadow-md">
          <div className="flex">
            {/* Image — left side, fixed width on desktop */}
            <div className="relative aspect-[4/3] w-32 flex-shrink-0 bg-gray-100 sm:w-48 md:w-56">
              {firstImage ? (
                <Image
                  src={firstImage.url}
                  alt={firstImage.alt || product.name}
                  fill
                  sizes="(max-width: 640px) 128px, 224px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  {product.videoUrl ? "Video" : dict.catalog.noPhoto}
                </div>
              )}
              {(computedIsNew || computedHasSale) && (
                <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
                  {/* NEW / SALE badges — same as grid */}
                </div>
              )}
            </div>

            {/* Content — right side, takes remaining width */}
            <CardContent className="flex flex-1 flex-col justify-between p-4">
              <div>
                <h3 className="text-base font-medium leading-tight sm:text-lg">
                  {product.name}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {/* Quality / season badges */}
                </div>
                {product.country && (
                  <p className="mt-2 text-sm text-gray-500">
                    {/* country, додатково — корисно у list view де є місце */}
                  </p>
                )}
              </div>
              {wholesalePrice && (
                <p className="mt-3 text-xl font-bold text-green-700">
                  €{wholesalePrice.amount.toFixed(2)}
                  <span className="text-sm font-normal text-gray-500">
                    /{product.priceUnit === "kg" ? dict.catalog.perKg : dict.catalog.perPiece}
                  </span>
                </p>
              )}
            </CardContent>
          </div>
        </Card>
      </Link>

      {/* Wishlist overlay — right side */}
      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <WishlistButton .../>
      </div>
    </div>
  );
}
```

**Important:** у list mode card — fixed image width `w-32 sm:w-48 md:w-56` (не aspect-square fill). Висота визначається content side. Image clip-uvati `aspect-[4/3]`.

### Task 4: Catalog page wiring

**Файли:**
- `apps/store/app/(store)/catalog/page.tsx`
- `apps/store/app/(store)/catalog/[categorySlug]/page.tsx`

```tsx
const layout = (params.layout === "list" ? "list" : "grid") as "grid" | "list";

// ...

<CatalogLayoutToggle currentLayout={layout} />

// ...

{products.length === 0 ? (
  <p>...</p>
) : isInfiniteScroll ? (
  <InfiniteScrollCatalog
    initialProducts={products}
    total={total}
    totalPages={totalPages}
    perPage={24}
    filterParams={filterParams.toString()}
    layout={layout}  // NEW
  />
) : (
  <>
    {layout === "list" ? (
      <div className="flex flex-col gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} mode="list" />
        ))}
      </div>
    ) : (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} mode="grid" />
        ))}
      </div>
    )}
    <Pagination ... />
  </>
)}
```

### Task 5: `InfiniteScrollCatalog` — pass-through `mode`

**Файл:** `apps/store/components/store/infinite-scroll-catalog.tsx`

```tsx
interface InfiniteScrollCatalogProps {
  // existing
  layout?: "grid" | "list";
}

// у render:
{layout === "list" ? (
  <div className="mt-6 flex flex-col gap-4">
    {products.map((p) => <ProductCard key={...} product={p} mode="list" />)}
  </div>
) : (
  <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
    {products.map((p) => <ProductCard key={...} product={p} mode="grid" />)}
  </div>
)}
```

### Task 6: Видалити стару view toggle (pagination/infinite UI)

`CatalogViewToggle` rename’ed у `CatalogLayoutToggle`. Video/infinite залишаються — просто без UI кнопки. Page logic for `view === "infinite"` залишається як є.

Якщо хочеш бути super-явним про intent — додати TODO коментар:

```tsx
// `?view=infinite` залишається для direct URL access, але UI toggle removed in S31.
// If product needs UI back, add a separate toggle in S3X.
const isInfiniteScroll = view === "infinite";
```

### Task 7: Update existing tests for view toggle

Якщо є `apps/store/components/store/catalog-view-toggle.test.tsx` — перейменувати + переписати під layout toggle. Якщо немає — додати мінімальний тест:

```ts
it("toggles layout=list on click", () => { ... });
it("removes ?layout when grid", () => { ... });
```

(2 test cases, орієнтовно)

---

## Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS
- [ ] `pnpm -r test` — PASS (existing tests + 2 new for layout toggle = baseline +2)
- [ ] `pnpm build` — PASS
- [ ] Worker visual описання: "Toggle у правому верхньому куті каталогу: 1-й icon (LayoutGrid) → multi-col, 2-й (List) → single col horizontal cards"
- [ ] git diff stat: ~4-6 файлів змінених, 1-2 нових (rename test + layout toggle test if added)
- [ ] Адмінка / mobile / packages — 0 changes

---

## Out of scope

- Saved layout preference у localStorage / cookies (зараз тільки URL state)
- Density toggle (compact / normal / spacious cards)
- Sort + layout combined dropdowns
- A/B test default layout
- Removal of infinite scroll entirely — окрема сесія, поки залишається через URL

---

## Commit strategy

```
feat(catalog): grid/list layout toggle (replaces pagination/infinite UI)

User feedback: existing toggle (pagination vs infinite scroll) was
visually indistinguishable to customers. Replaced with a true layout
toggle (multi-col grid vs single-col horizontal list cards).

- Renamed CatalogViewToggle → CatalogLayoutToggle (lucide List icon)
- Added `mode: "grid" | "list"` prop on ProductCard with internal
  ProductCardList sub-component (image left, content right)
- Catalog pages render either grid (cols-2/3/3/4 responsive) or
  flex-col stack of list cards based on `?layout=list` URL param
- InfiniteScrollCatalog pass-through layout mode
- `?view=infinite` retained as URL-only feature (no UI toggle); can
  be re-added in a future session if customers ask for it
- 2 new tests for layout toggle behavior
```

---

## Push

```bash
git push -u origin claude/session-31-grid-list-layout-toggle
```

Завершити повідомленням orchestrator-у з:
- Branch name
- Test count delta
- Чи `view=infinite` URL все ще acessible через manual типу
