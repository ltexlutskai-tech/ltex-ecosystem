# Session 61 — Lots Page Redesign (Worker Spec)

**Дата:** 2026-05-02
**Тип:** worker
**Ефорт:** ~6-8 год
**Branch:** `claude/s61-lots-page-redesign`
**Mockup reference:** `docs/MOCKUP_S61_LOTS_PAGE.html` (відкрити локально, дві секції — view-grid + view-detail)
**Залежність:** **S60 має бути merged раніше** (S61 reuse-ає `VideoModal` із S60). Якщо S60 ще не merged — спочатку дочекатись merge.

## Бізнес-ціль

Поточний `/lots` — таблиця з 7 колонок. Користувач хоче catalog-style grid де **video preview = головний візуал** (замість фото). Лот без videoUrl показує placeholder. Клік на play відкриває inline YouTube-плеєр (модалка), а не редіректить на youtube.com. Quick "Додати" на cards без обов'язкового переходу. Окремо — `/lot/[barcode]` detail page для того хто хоче подивитись лот глибше.

## High-level scope

### 1. `/lots` page rewrite — `apps/store/app/(store)/lots/page.tsx`

**Замінити існуючу таблицю** на catalog-style grid за мокапом view-grid.

URL search params:

- `status` — `free` | `on_sale` (default: обидва, "доступні")
- `hasVideo` — `true` | `false` (default: false)
- `categoryId` — comma-separated cuids (multi-select)
- `quality` — comma-separated values (multi-select)
- `season` — comma-separated (multi-select)
- `country` — comma-separated (multi-select)
- `weightMin`, `weightMax` — number kg
- `priceMinEur`, `priceMaxEur` — number EUR (зберігаємо EUR на бекенді, UI показує UAH conversion на label)
- `q` — search string (matches barcode OR product.name)
- `sort` — `newest` (default) | `priceAsc` | `priceDesc` | `weightDesc`
- `page` — pagination, perPage=30

**Prisma query**: `prisma.lot.findMany` з `where` що збирається з усіх параметрів. `include`: `product: { select: { id, slug, name, quality, season, country, priceUnit, categoryId, category: { select: { name } } } }`. Multi-select фільтри через `{ in: [...] }`. Фільтр `hasVideo=true` → `videoUrl: { not: null }`.

**Layout (за мокапом):**

```
[Breadcrumbs]
[H1 + total count]
[grid lg:grid-cols-[280px_1fr] gap-6:
  LEFT (sticky): <LotsFilters />
  RIGHT:
    [Search input + sort select + mobile filters button]
    [Active filter chips]
    [Grid of <LotCard /> 1/2/3 cols]
    [Pagination]
]
```

Mobile (<lg): фільтри сховані, з'являється кнопка "Фільтри" → відкриває bottom sheet (як `CatalogFilterSheet` у каталозі — паттерн повторити).

### 2. New component: `components/store/lot-card.tsx` (client component)

Reusable у `/lots` grid + у "Інші лоти цього товару" блоку на detail page.

Props:

```ts
interface LotCardProps {
  lot: {
    id: string;
    barcode: string;
    weight: number;
    quantity: number;
    priceEur: number;
    videoUrl: string | null;
    status: string;
    product: {
      id: string;
      slug: string;
      name: string;
      priceUnit: string; // "kg" | "pair" → "шт" | "пар"
    };
  };
  rate: number;
  // optional sale percentage (compute from product Price.akciya якщо є)
  salePercent?: number;
}
```

Рендер за мокапом — video thumb 16:9 зверху, info під ним (barcode моноспейсом, назва товару link до `/product/{slug}`, вага+к-сть, ціна UAH крупно + EUR дрібно з закресленою при акції, "Додати" кнопка).

**Video click**: button onClick → setOpen(true) → `<VideoModal videoId={...} />` (з S60). Лот без videoUrl — placeholder "Огляд скоро" (gray dashed-border block, не button).

**К-сть unit**: якщо `lot.product.priceUnit === "pair"` → "пар", інакше "шт".

**Status badges:**

- `free` → green "Вільний"
- `on_sale` → red "Акція −X%" (X = sale percentage, якщо передано)
- `reserved` → gray "Зарезервований"
- `sold` → gray "Продано"

**In-cart state**: використай `useCart()` для перевірки чи `lot.id` уже у корзині. Якщо так — кнопка стає "У замовленні" з білим тлом + зеленою рамкою + checkmark, card border зелений 2px (як у мокапі).

### 3. New component: `components/store/lots-filters.tsx` (client component)

Mirror existing `CatalogSidebar` pattern. Forms render checkboxes/radios/range inputs; submit triggers `router.push` з оновленими search params (без full reload, через useRouter + URLSearchParams).

Categories list та counts — приймає `categories: { id, name, count }[]` як props (server-side `prisma.lot.groupBy({ by: ['productId'] })` join з category — обчислити counts зі server component).

### 4. New component: `components/store/lots-filter-sheet.tsx` (client, mobile)

Bottom sheet з тими ж controls що у `lots-filters.tsx`. Може бути спільним компонентом `<LotsFiltersForm />` що рендериться як sidebar на desktop і як sheet content на mobile (DRY).

Pattern uvas existing `CatalogFilterSheet` — копіюй структуру.

### 5. New page: `apps/store/app/(store)/lot/[barcode]/page.tsx`

URL: `/lot/{barcode}`. Lookup `prisma.lot.findUnique({ where: { barcode } })` з повним include `product` + `product.category` + `product.images` (для fallback якщо немає video).

Якщо лот не знайдений — `notFound()`.

Layout (за мокапом view-detail):

```
[Breadcrumbs: Головна / Лоти / Лот {barcode}]
[2-col grid lg:grid-cols-2 gap-8:
  LEFT (sticky lg:top-20):
    Inline video player (click → VideoModal embed) АБО product.images[0] як fallback АБО placeholder
    Trust badge "Це відео знято на нашому складі — реальний вміст лота"
  RIGHT (min-w-0):
    Status badge
    H1 "Лот: {product.name}"
    Barcode (font-mono)
    Price block (UAH крупно + EUR + примітка про курс)
    KeyFactsList (✔ 8 рядків — дублюється з product але адаптовано):
      - Вага лота: {lot.weight} кг
      - К-сть одиниць: {lot.quantity} {шт|пар}
      - Сорт: product.quality
      - Сезон: product.season
      - Стать: product.gender
      - Розміри: product.sizes
      - Країна: product.country
      - Категорія: <Link>{category.name}</Link>
    CTA "Додати лот до замовлення" (повноширочинна) + heart wishlist
    Disclaimer "Замовлення обробляє менеджер..."
    Info-блок з посиланням на /product/{slug} ("Це частина товарної позиції — Перейти до товару →")
    ShareIcons (icon-only)
]
[Опис лота — section з product.description (поки лот не має власного опису)]
[Інші лоти цього товару — query lots where productId=product.id AND barcode≠current AND status in [free, on_sale], LIMIT 6, render LotCard grid]
[Delivery info]
```

Metadata (`generateMetadata`):

```ts
title: `Лот ${barcode} — ${product.name}`;
description: `Лот ${barcode}: ${product.name}, ${lot.weight} кг, ${lot.quantity} шт. ${product.description.slice(0, 120)}`;
canonical: `${SITE_URL}/lot/${barcode}`;
```

`revalidate = 300` (як на product page).

### 6. New API route: `/api/lots` (optional — only if filters need client-side fetching)

Якщо `LotsFilters` робить full server-side render через router.push — API не потрібен. Якщо хочеш progressive enhancement з skeleton → live updates — додай GET /api/lots з тими ж params. **Рекомендую**: server-side render, NO API. Простіше і SEO-friendly.

### 7. Connect `useCart()` for instant feedback

`AddToCartButton` уже існує (lot-based). На LotCard використовуй його як є — він уже знає про `lotId` і робить in-cart check.

### 8. Reuse `VideoModal` from S60

Імпорт: `import { VideoModal } from "@/components/store/video-modal";`. Ніяких змін у самій VideoModal не треба.

### 9. Sale percentage computation

На LotCard у grid треба показати "−X%" якщо лот на акції. Звідки взяти %? `Price` model має `priceType` "wholesale" і "akciya". Sale % = `(wholesale - akciya) / wholesale * 100`.

Передавай `salePercent` пропом у LotCard. Server-side обчислюй для кожного лота через `lot.product.prices` (треба include).

**Spec for query:**

```ts
include: {
  product: {
    select: {
      id: true, slug: true, name: true, quality: true, season: true,
      country: true, priceUnit: true, categoryId: true,
      category: { select: { name: true } },
      prices: { select: { priceType: true, amount: true } },
    },
  },
},
```

Обчислюй `salePercent` у helper функції перед рендером.

### 10. URL safety for barcode

Barcode може містити лише `[0-9A-Z]` (від 1С). Без слешів і пробілів. Тому `/lot/[barcode]` працює як plain dynamic segment без encodeURIComponent. Якщо у DB зустрічається barcode зі спецсимволами (старі дані) — додай `encodeURIComponent(lot.barcode)` у Link href та `decodeURIComponent` при resolve.

## Out of scope

- Mobile app /lots screen — paused.
- Quote request flow — окрема задача (S22 spec).
- Wishlist для лотів — поки тільки для продуктів (можна додати у наступній сесії, не зараз).
- Recommendations engine для лотів — out of scope. На detail page показуємо тільки "Інші лоти цього товару".
- Video lazy load (intersection observer) — оптимізація, не зараз.

## Testing

- Unit `components/store/lot-card.test.tsx`: render with/without video, in-cart state, status variants.
- Unit `components/store/lots-filters.test.tsx`: URL params encode/decode.
- Optional E2E: `lots-grid.spec.ts` — open /lots, apply filter, verify grid updates.

`pnpm format:check && pnpm -r typecheck && pnpm -r test` — green.

## Verification (worker checklist)

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `cd apps/store && pnpm build` — standalone build success
- [ ] Manual: `/lots` рендерить grid 1/2/3 cols, sidebar з фільтрами
- [ ] Manual: натиснути фільтр (наприклад "Тільки з відеооглядом") → URL оновлюється, grid фільтрується
- [ ] Manual: натиснути play на card → відкривається VideoModal з YouTube embed (БЕЗ редіректу)
- [ ] Manual: card без video → placeholder "Огляд скоро" (no play button)
- [ ] Manual: натиснути "Додати" на card → лот у cart, кнопка стає "У замовленні", card border зелений
- [ ] Manual: відкрити `/lot/{barcode}` → detail page рендериться, video player або fallback image
- [ ] Manual: на mobile viewport (Pixel 7 412px) — фільтри сховані, з'являється кнопка "Фільтри", grid 1 col, no horizontal scroll
- [ ] Manual: search "штани" → grid фільтрується
- [ ] Manual: pagination — наступна сторінка працює, scroll залишається

## Commit strategy

Атомарні коміти:

1. `feat(s61a): lot-card component (reusable for grid + other-lots)`
2. `feat(s61b): lots-filters + lots-filter-sheet (sidebar + mobile sheet)`
3. `feat(s61c): /lots page rewrite — grid + filters + search + sort`
4. `feat(s61d): /lot/[barcode] detail page`
5. `test(s61): lot-card + lots-filters unit tests`

Push branch `claude/s61-lots-page-redesign`. NOT merge to main, NOT create PR.

## Hard rules (CLAUDE.md)

- Не чіпати `output: 'standalone'`.
- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- Не редагувати CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- Не запускай `pm2`.
- Усі user-facing strings українською (`lang="uk"`).
- L-TEX продає не тільки секонд-хенд: сток, іграшки, Bric-a-Brac. SEO/copy має враховувати.
- Не додавай онлайн-платіжки.
