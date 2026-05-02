# Session 59 — Product Card Redesign (Worker Spec)

**Дата:** 2026-05-02
**Тип:** worker
**Ефорт:** ~6-8 год
**Branch:** `claude/s59-product-card-redesign`
**Mockup reference:** `docs/MOCKUP_S59_PRODUCT_CARD.html` (відкрити локально для візуального порівняння)

## Бізнес-ціль

Поточна product detail сторінка (`/product/[slug]`) — функціональна, але не продає. Конкуренти (stocksecond, britishsecond, srs-company) мають кращу карточку: video-reviews, structured "tech specs", чистий CTA, trust signals. Робимо вищий conversion **БЕЗ** додавання онлайн-оплат — замовлення йдуть на email менеджеру через існуючий `/api/orders`.

User хоче, щоб клієнт міг додавати у замовлення:

- **позицію загалом** (без конкретного лоту) — менеджер сам обере доступний
- **конкретний лот** (за barcode) — клієнт сам подивився відеоогляд лоту і обрав

## High-level scope

### 1. DB migration: 4 нові nullable поля у `Product` + `Lot.videoUrl` вже є

`packages/db/prisma/schema.prisma` → model Product, додати:

```prisma
gender       String?  // "male" | "female" | "unisex" | "kids" або вільний текст
sizes        String?  // "XS-2XL", "36-44", вільний текст
unitsPerKg   String?  // "3-4 шт/кг", "5-6 пар/кг" — рендж як рядок (1С шле текстом)
unitWeight   String?  // "0.25-0.35 кг", "200-300 г" — рендж як рядок
@@map("products")  -- (вже є)
```

Migration: `pnpm --filter @ltex/db exec prisma migrate dev --name 20260502_product_attrs`. Файл міграції закомітити.

**Не міняти** наявні поля. Не додавати enum-и (1C шле вільним текстом, валідуємо тільки на frontend rendering).

### 2. Cart: дозволити items без `lotId`

Файл: `apps/store/lib/cart.tsx`

```ts
export interface CartItem {
  lotId?: string; // ← made optional
  productId: string;
  productName: string;
  barcode?: string; // ← made optional
  weight: number;
  priceEur: number;
  quantity: number;
}
```

`cartReducer` ADD case: якщо `item.lotId` присутній — dedupe by lotId; якщо немає — dedupe by productId (не дозволяти 2 "загальні" позиції одного продукту).

`mergeItems`: ключ = `lotId ?? productId-${productId}`.

`/api/cart/route.ts` (GET/POST/DELETE) — Zod схема CartItem додати `.optional()` на lotId/barcode. Не падати на старих cart-ах у localStorage (backward-compat).

### 3. `/api/orders/route.ts` — приймати items без lotId

Файл: `apps/store/lib/validations.ts` — `orderSchema.items` зробити lotId/barcode optional.

`/api/orders/route.ts` логіка:

- Items з lotId → створюються як зараз (`OrderItem.lotId` set).
- Items без lotId → створюється `OrderItem` з `lotId = null`, `barcode = null`. У `OrderItem` schema перевір — якщо `lotId` required, треба зробити nullable через окрему migration. Якщо вже nullable — нічого не робиш.
- Email template (`apps/store/lib/email.ts::sendOrderConfirmationEmail`) — додай секцію "Загальні позиції (потрібно підібрати лот)" окремо від "Конкретні лоти".

**Перевір** `OrderItem` модель: якщо `lotId` non-nullable, додай мікро-migration `20260502_orderitem_lot_optional`.

### 4. Product page (`apps/store/app/(store)/product/[slug]/page.tsx`) — повний rewrite

Layout (точно по mockup):

```
[Breadcrumbs]
[2-col grid (lg:grid-cols-2 gap-8):
  LEFT (sticky lg:sticky lg:top-20):
    ImageGallery (existing component)
    TrustBadge "Усі фото є оригінальними"
  RIGHT:
    H1 + articleCode
    Price block (sale + regular + UAH equivalent)
    StockIndicator: "В наявності" (green dot) АБО "Очікуємо" (yellow dot) — based on inStock
    KeyFactsList (8 рядків з ✔, render тільки якщо поле != null)
    CTA primary "Додати до замовлення" + ❤ wishlist
    Disclaimer "Замовлення обробляє менеджер..."
    ShareIcons (icon-only)
]
[Description block (full width)]
[LotReviews block — replaces "Доступні лоти"]
[RecentReviewsCarousel]
[Delivery info block]
[Similar products grid]
```

**Ціна block:** показати `priceEur` (red-600) + сturck-через regular (якщо є sale price у `Price`), `/<priceUnit>` мітка, плюс `≈ ${(priceEur*rate).toFixed(0)} ₴/${priceUnit}` сірим. Курс — з `getCurrentRate()` helper (див. п.5).

**StockIndicator:**

```tsx
{
  product.inStock ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="inline-block w-2 h-2 bg-green-600 rounded-full" />
      <span className="text-green-700 font-medium">В наявності</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-sm">
      <span className="inline-block w-2 h-2 bg-amber-500 rounded-full" />
      <span className="text-amber-700 font-medium">Очікуємо надходження</span>
    </div>
  );
}
```

**НЕ показувати** "X лотів, Y кг" — тільки текст.

**KeyFactsList** — рендер тільки тих рядків де значення не null/empty. Порядок: Сезон, Сорт (=quality), Стать, Розміри, Країна, К-сть одиниць, Вага одиниці, Вага лота (=averageWeight). Видалити старий 4-cell grid.

### 5. Helper `getCurrentRate()` для UAH

Новий файл: `apps/store/lib/exchange-rate.ts`

```ts
import { cache } from "react";
import { prisma } from "@ltex/db";

export const getCurrentRate = cache(async (): Promise<number> => {
  const latest = await prisma.exchangeRate.findFirst({
    where: { currencyFrom: "EUR", currencyTo: "UAH" },
    orderBy: { date: "desc" },
  });
  return latest?.rate ?? 43; // fallback rate
});
```

Викликається з product page (server component) та LotReviews. Кешований через React `cache()` — ОДИН query на render.

### 6. Нові компоненти

#### `components/store/lot-reviews.tsx` (server component)

Замість поточної `Доступні лоти` таблиці. Приймає `lots: Lot[]` + `productName` + `rate: number`.

```
- For each lot (status in ["free", "on_sale"]):
  - Card з video-thumb (16:9, w-full lg:w-60) + lot info справа
  - Якщо lot.videoUrl — extract YouTube ID + show https://i.ytimg.com/vi/{id}/hqdefault.jpg + play overlay. На клік → відкрити lightbox (можна reuse Dialog з ImageGallery або новий VideoLightbox)
  - Якщо lot.videoUrl null — placeholder "Огляд скоро" (як у мокапі)
  - Info: barcode (font-mono), weight, quantity, priceUah = priceEur * rate (formatted), `(€XXX.XX)` дрібним сірим
  - AddToLotCartButton ("Додати лот до замовлення") — використовує існуючий useCart()
```

YouTube ID extraction helper — додай до `lib/youtube.ts` (якщо є — використай; якщо ні — створи). Підтримка форматів: `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`.

#### `components/store/recent-reviews-carousel.tsx` (server component)

Приймає `currentProductId: string` (для exclude). Робить query:

```ts
prisma.product.findMany({
  where: {
    videoUrl: { not: null },
    inStock: true,
    NOT: { id: currentProductId },
  },
  orderBy: { updatedAt: "desc" },
  take: 12,
  select: { id, slug, name, videoUrl },
});
```

Рендер: horizontal scroll (`flex gap-4 overflow-x-auto scrollbar-hide`), кожен card width 64 (16rem), `<a href="/product/{slug}">` обгортка. Стрілка вверху-справа: "Усі огляди на YouTube →" → лінк на YouTube channel/playlist URL з env `NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL` (fallback `https://www.youtube.com/@LTEX`).

#### `components/store/share-icons.tsx` (client component)

Replace існуючий `ShareButtons`. Receive `url: string, title: string`. Render icon-only:

- Copy link → `navigator.clipboard.writeText(url)` + toast confirmation
- Telegram → `https://t.me/share/url?url=${url}&text=${title}`
- Viber → `viber://forward?text=${url}`
- Facebook → `https://www.facebook.com/sharer/sharer.php?u=${url}`
- WhatsApp → `https://wa.me/?text=${url}`

Кожна іконка `p-2 rounded-full hover:bg-{brandcolor}-50`, brand color SVG inline (як у mockup). Tooltip via `title` attribute.

#### `components/store/trust-badge.tsx`

Маленький `<div className="flex items-center gap-2 text-xs text-gray-600">` з email-іконкою + текст "Усі фото є оригінальними — зроблені на нашому складі". Render під ImageGallery thumbnails.

#### `components/store/add-to-cart-button.tsx` — extend

Додай новий prop `mode?: "lot" | "product"`. Якщо `"product"` — додає у cart item без `lotId`/`barcode`, тільки productId+productName+weight (avg)+priceEur (з default Price). Інакше працює як зараз.

Або краще — створи окремий `<AddProductToCartButton product={product} />` для primary CTA, лишивши старий тільки для лотів. Worker сам обирає чистіший варіант.

### 7. Видалити старе

- Поточну "Доступні лоти" таблицю у `product/[slug]/page.tsx` (рядки ~292+).
- Старий 4-cell grid з Якість/Сезон/Країна/Од. ціни (~213-244).
- Старий ShareButtons (`components/store/share-buttons.tsx`) → замінити на ShareIcons.
- "Дивитись відео-огляд" звичайний link → інтегрований у galery badge "Є відео-огляд" + у RecentReviewsCarousel.

### 8. Адмінська форма `/admin/products/[id]`

Додати inputs для нових полів (gender/sizes/unitsPerKg/unitWeight). Звичайні `<input type="text">` з поточним стилем. `actions.ts::updateProduct` додає їх у `data`.

## Testing

- Unit: `apps/store/lib/cart.tsx` — додай тести для cart items без lotId (dedupe by productId, mergeItems behavior).
- Unit: `lib/youtube.ts` — extractYouTubeId on 3 URL formats.
- Unit: `components/store/lot-reviews.tsx` — render snapshot з/без videoUrl.
- E2E: existing product page тест має pass (можливо треба update selectors).

`pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено.

## Out of scope

- Backfill `gender/sizes/unitsPerKg/unitWeight` для існуючих 805 SKU — user наповнить вручну через admin form OR пізніше через 1С sync update (окрема задача).
- Mobile app product screen — паралельно paused, не чіпай.
- Quote Request system (S22 spec) — окрема задача, нічого не імпортувати з неї.
- Online payments — забороно (business rule).
- Customer auth (S21) — окрема задача, cart лишається guest+sessionId.
- Wishlist для product page (heart icon працює як toast "Додано в обране" через існуючий `useWishlist` якщо є; інакше просто placeholder без функціоналу — НЕ створювати нову модель).

## Verification (worker checklist)

- [ ] Migration applied locally без помилок: `pnpm --filter @ltex/db exec prisma migrate dev --name 20260502_product_attrs`
- [ ] `pnpm format:check` pass
- [ ] `pnpm -r typecheck` pass (всі 6 workspaces)
- [ ] `pnpm -r test` pass (290+ тестів)
- [ ] `cd apps/store && pnpm build` standalone build success
- [ ] Manual: відкрити `/product/<any-slug>` локально (dev), порівняти з mockup
- [ ] Manual: натиснути "Додати до замовлення" (без лоту) → cart має item з `lotId: undefined`
- [ ] Manual: натиснути "Додати лот" на одному з лотів → cart має item з конкретним `lotId`
- [ ] Manual: відкрити `/cart`, оформити → email шле через nodemailer (на dev SMTP) з 2 секціями
- [ ] Manual: продукт без `videoUrl` — RecentReviewsCarousel не падає; продукт без лотів — LotReviews показує "Лотів зараз немає"

## Commit strategy

Атомарні коміти по логічних блоках:

1. `feat(s59a): db migration — Product gender/sizes/unitsPerKg/unitWeight + OrderItem lot nullable`
2. `feat(s59b): cart — allow items without lotId (general product additions)`
3. `feat(s59c): exchange-rate helper + UAH conversion in cart/lots`
4. `feat(s59d): new components — lot-reviews, recent-reviews-carousel, share-icons, trust-badge`
5. `feat(s59e): product page rewrite — checklist info + new CTA + sections per mockup`
6. `feat(s59f): admin form — inputs for new product attributes`
7. `test(s59): cart + youtube + lot-reviews unit tests`

Push `claude/s59-product-card-redesign`. NOT merge to main, NOT create PR.

## Hard rules (CLAUDE.md)

- Не чіпати `output: 'standalone'` у `next.config.js`.
- Не запускати `pm2 ...` (sandbox).
- Не редагувати CLAUDE.md / HISTORY.md / SESSION_TASKS.md (orchestrator job).
- TypeScript strict, 0 `any`.
- Не bypass-ити pre-commit hook (`--no-verify`).
- Server reads `lang="uk"` — всі user-facing strings українською.
- Не додавати онлайн-платіжки.
- L-TEX продає не тільки секонд-хенд: SEO/copy має згадувати сток, іграшки, Bric-a-Brac коли це доречно.
