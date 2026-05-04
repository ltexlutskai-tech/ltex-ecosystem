# Session 63 — Lots Mobile Fixes + Wishlist for Lots (Worker Spec)

**Дата:** 2026-05-03
**Тип:** worker
**Ефорт:** ~4-5 год
**Branch:** `claude/s63-lots-mobile-wishlist`
**Контекст:** S62 deployed — є 4 issues з QA на мобільному + новий функціонал.

## Issues

### 1. Mobile: layout toggle (grid/list) на /lots не працює

**Симптом:** На mobile у `/lots` кнопки переключення grid↔list не міняють layout. Видно (скрін від QA): toggle icons рендеряться між sort dropdown і кнопкою "Шукати", але клік не впливає на URL/grid.

**Гіпотеза кореня:** Search + sort + toggle обгорнуті у `<form>` (бо є кнопка "Шукати"), а `<CatalogLayoutToggle>` рендерить `<button onClick={...}>` БЕЗ `type="button"`. У HTML default-тип кнопки в формі — `submit`, тож клік на toggle сабмітить форму до `?q=...&sort=...` (без `layout`), а `router.push` з toggle або не виконується, або одразу overrides формою.

**Фікс:**

- У `apps/store/components/store/catalog-layout-toggle.tsx` додати `type="button"` до обох `<button>` (рядки ~32, ~44 у поточному коді).
- Альтернативно (краще): винести toggle ЗА межі `<form>` у `apps/store/app/(store)/lots/page.tsx` — search + Шукати у формі, а sort/toggle/Фільтри — окремо. Але `type="button"` теж достатньо.
- Перевір що `CatalogSidebar`/каталог не мають тієї ж проблеми (form submit на toggle). Якщо так — додай `type="button"` теж там, щоб не повторювати у наступних спеках.

**Verification:** Mobile Chrome DevTools (Pixel 7 412×915), `/lots` → клік "list" icon → URL змінюється на `?layout=list`, картки рендеряться horizontally.

### 2. Перейменувати "Купити в один клік" → "Замовити в один клік"

Файли:

- `apps/store/components/store/lot-card.tsx` — текст secondary CTA на картці
- `apps/store/components/store/quick-order-modal.tsx` — `<DialogTitle>` + submit button text + success message якщо потрібно
- Будь-які інші згадки у `lot-card.test.tsx` / `quick-order-modal` тестах

Просто `Купити в один клік` → `Замовити в один клік`.

### 3. Додати "Детальніше" кнопку у LotCard поряд з "Додати"

User wants клієнтів вести у `/lot/[barcode]` через явну кнопку, бо клік по назві товару не очевидний.

**Файл:** `apps/store/components/store/lot-card.tsx`

Поточно у card-bottom (grid layout) рядок: `[ціна (left)] [Додати (right)]`.

**Новий layout (grid mode):** ціна окремо вгорі (можна лишити як зараз), потім **рядок з 2 кнопок**: `[Детальніше (flex-1, ширша) | Додати]` — обидві green-button стилем, у одному рядку.

```tsx
<div className="mt-2 flex gap-2">
  <Link
    href={`/lot/${encodeURIComponent(lot.barcode)}`}
    className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-green-600 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
  >
    Детальніше
  </Link>
  <AddToCartButton lot={...} /> {/* існуюча — стандартний green */}
</div>
```

**List mode** — також додати "Детальніше" поряд з "Додати" у info-column.

**Видимість:** "Детальніше" завжди видима, навіть для `reserved`/`sold` лотів (бо корисно подивитись опис). "Додати" — тільки для free/on_sale.

Update `lot-card.test.tsx` — додай тест що `Детальніше` лінк існує і веде на `/lot/{barcode}`.

### 4. Wishlist для лотів

User хоче що клієнт міг зберегти конкретний лот у "Обране". Wishlist на L-TEX зараз — **тільки localStorage** (без DB sync, видно у `apps/store/lib/wishlist.tsx`). Тож **DB міграція не потрібна**.

**Файл:** `apps/store/lib/wishlist.tsx`

Розширити `WishlistItem`:

```ts
export interface WishlistItem {
  // discriminator
  kind: "product" | "lot";

  // для обох kind
  productId: string;
  slug: string;
  name: string;
  quality: string;
  imageUrl: string | null;
  priceEur: number | null;
  priceUnit: string;

  // тільки якщо kind === "lot"
  lotId?: string;
  barcode?: string;
  weight?: number;
  quantity?: number;
  videoUrl?: string | null;
}
```

Уніфікований ключ: `kind === "lot" ? \`lot-${lotId}\` : \`product-${productId}\``.

API:

```ts
interface WishlistContextType {
  items: WishlistItem[];
  addItem: (item: WishlistItem) => void;
  removeItem: (key: string) => void;
  isInWishlist: (key: string) => boolean; // приймає уніфікований ключ
  hasProduct: (productId: string) => boolean; // helper для product-cards
  hasLot: (lotId: string) => boolean; // helper для lot-cards
  itemCount: number;
}
```

Backward-compat: існуючі consumers `WishlistButton` для продуктів продовжують працювати — додай default `kind="product"` коли не передано.

**Файл:** `apps/store/components/store/wishlist-button.tsx` — extend prop signature на `kind` + `lot` data. Коли `kind="lot"` — кнопка тогглить wishlist для лоту замість product.

**Файл:** `apps/store/components/store/lot-card.tsx` — додати `<WishlistButton kind="lot" lot={...} />` у card. Розташування: на video thumb top-right (як heart на product card у каталозі) АБО поряд з status badge. Йди верхній-правий куток thumb.

**Файл:** `apps/store/app/(store)/wishlist/page.tsx` — оновити рендер щоб показувати дві секції: "Збережені товари" + "Збережені лоти". Якщо обидві порожні — single "Список порожній" message.

`useWishlist` тести (`lib/wishlist.test.tsx`) — додай 3 тести: `hasLot`, addLot, removeLot.

### Out of scope

- DB persistence wishlist для логінованих клієнтів — окрема задача (пов'язана з S21 auth).
- Mobile app wishlist parity — paused.
- Telegram/Email-нотифікація про "знижка на збережений лот" — окрема задача.
- "Купити" з wishlist одним кліком — тільки повернення на /lot/[barcode].

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `cd apps/store && pnpm build` standalone build success
- [ ] Manual mobile (Chrome DevTools Pixel 7): `/lots` → клік layout toggle → grid стає list, URL `?layout=list`
- [ ] Manual: на LotCard є 2 рядки: ціна і pair кнопок [Детальніше | Додати]; "Детальніше" веде на `/lot/{barcode}`
- [ ] Manual: текст secondary CTA — "⚡ Замовити в один клік" замість "Купити"
- [ ] Manual: heart-кнопка на video thumb LotCard → toggle save до wishlist; `/wishlist` показує лот окремо від товарів
- [ ] Manual: heart-кнопка на ProductCard продовжує працювати як раніше (no regression)

## Commit strategy

1. `fix(s63a): catalog-layout-toggle — type="button" to prevent form submit on mobile`
2. `chore(s63b): rename "Купити в один клік" → "Замовити в один клік"`
3. `feat(s63c): lot-card — add "Детальніше" CTA next to "Додати" linking to /lot/[barcode]`
4. `feat(s63d): wishlist — extend to support lots (kind discriminator)`
5. `feat(s63d): lot-card + wishlist page — heart toggle for lots + Збережені лоти section`
6. `test(s63): wishlist + lot-card unit tests for new lot wishlist flow`

Push `claude/s63-lots-mobile-wishlist`. NOT merge to main, NOT create PR.

## Hard rules (CLAUDE.md)

- Не чіпати `output: 'standalone'`.
- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- Не редагуй CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- НЕ запускай pm2.
- Усі user-facing strings українською.
- Wishlist залишається localStorage-only — НЕ додавай DB sync без окремого узгодження.
- НЕ міняй DB schema (Favorite model лишається продуктовим).
