# Session 60 — Product Card + Cart Fixes (Worker Spec)

**Дата:** 2026-05-02
**Тип:** worker
**Ефорт:** ~3-4 год
**Branch:** `claude/s60-product-card-fixes`
**Контекст:** S59 deployed — є 4 issues від QA на проді.

## Issues to fix

### 1. Duplicate wishlist button on product page

`apps/store/app/(store)/product/[slug]/page.tsx`: зараз є **2** `WishlistButton` — рядки 232-245 (top-right title row) та 323-334 (поряд з CTA "Додати до замовлення").

**Видалити верхню (рядки 232-245).** Залишити тільки ту що поряд з CTA.

Title row тоді стає простим: `<h1>` + `<p>` для articleCode без правої колонки. Видали обгортку `<div className="flex items-start justify-between gap-4">` — лишай simple block layout.

### 2. Mobile layout breakage with multi-image products

Симптом: коли у продукта багато фото, mobile-вʼюпорт zoom-out — page renders ширше за viewport.

**Корінь:** CSS Grid items за замовчуванням мають `min-width: auto`, що дозволяє content (як thumbnail strip з `overflow-x-auto`) розширити колонку понад viewport.

**Фікс:** додай `min-w-0` до обох grid children у `<div className="mt-6 grid gap-8 lg:grid-cols-2">` (рядок 198):

```tsx
<div className="mt-6 grid gap-8 lg:grid-cols-2">
  <div className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start">
    {" "}
    // ← min-w-0
    {/* Gallery + TrustBadge */}
  </div>
  <div className="min-w-0 space-y-5">
    {" "}
    // ← min-w-0
    {/* Details */}
  </div>
</div>
```

Також перевір що `image-gallery.tsx` thumbnail strip має `min-w-0` на parent якщо потрібно. Якщо thumbnail-кнопка має `shrink-0` — лишай.

Додатково: у `lot-reviews.tsx` перевір що `<div className="flex flex-col gap-4 ... lg:flex-row">` не overflow. Додай `min-w-0` до info column якщо потрібно.

У `recent-reviews-carousel.tsx` перевір що `-mx-4 ... px-4` overflow-x-auto не розтягує parent. Якщо так — обгорни секцію у `<div className="overflow-hidden">` АБО заміни на `mx-0 px-0` без negative margin trick.

**Verification:** локальний `pnpm dev` + Chrome DevTools "Pixel 7" viewport (412px) на product з 13+ фото — page не повинна horizontal-scroll-итись, header text має бути нормального розміру.

### 3. Cart pricing + UAH conversion

**Проблема 1:** `AddProductToCartButton` зберігає `priceEur` як **per-kg** (€7.90), а `Lot.priceEur` зберігає **total** (€161.95 за лот). Це робить cart total інконсистентний.

**Проблема 2:** Cart показує тільки EUR. Користувач хоче UAH.

**Проблема 3:** Для items без barcode (general positions) треба показати "приблизну" вартість на average weight.

**Файл:** `apps/store/components/store/add-product-to-cart-button.tsx`

Зміни:

```ts
addItem({
  productId,
  productName,
  weight,
  priceEur: priceEur * weight, // ← total = per-kg × averageWeight
  quantity: 1,
});
```

Це робить semantics однакові з лотами: `cart item.priceEur === total cost for that line`.

**Файл:** `apps/store/app/(store)/cart/page.tsx`

1. Імпортуй курс із сервера. Cart це client component, тому або:
   - **(A)** Передай rate prop з server wrapper (краще). Створи `cart-page.tsx` як server component що робить `await getCurrentRate()` і передає у новий `<CartClient rate={rate} />`. Перейменуй поточний `page.tsx` на `cart-client.tsx`, експортуй default.
   - **(B)** Додай новий `/api/exchange-rate` endpoint і fetch на mount. **Не рекомендую** — додає flicker.

   Йди (A).

2. У cart UI:
   - **Колонка "Ціна"**: рендер `formatUah(eurToUah(item.priceEur, rate))` (total UAH). Дрібним сірим під — `(€{item.priceEur.toFixed(2)})`. Для items без barcode додай префікс `≈` і tooltip "Розраховано на середню вагу — менеджер уточнить":

     ```tsx
     <td>
       {!item.barcode && (
         <span title="Розраховано на середню вагу — менеджер уточнить">≈ </span>
       )}
       <strong>{formatUah(eurToUah(item.priceEur, rate))}</strong>
       <span className="ml-1 text-xs text-gray-400">
         (€{item.priceEur.toFixed(2)})
       </span>
     </td>
     ```

   - **Підсумок (sidebar):** Сума повинна показувати UAH крупно, EUR дрібно під:

     ```
     Сума: 7 305 ₴
            (€169.85)
     ```

   - **Назва колонки в header**: "Ціна EUR" → "Ціна". Прибери `dict.cart.priceEur` reference або update i18n key.

3. **i18n** (`apps/store/lib/i18n` чи де dict живе): додай якщо треба `dict.cart.priceTotal` ("Ціна").

### 4. Inline video player for lots (no YouTube redirect)

User хоче дивитись огляд лоту прямо на сайті, без переходу на YouTube.

**Файл:** новий `apps/store/components/store/video-modal.tsx` (client component):

```tsx
"use client";
import { useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@ltex/ui";
import { X } from "lucide-react";

interface VideoModalProps {
  videoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoModal({ videoId, open, onOpenChange }: VideoModalProps) {
  if (!videoId) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-0 bg-black p-0">
        <div className="relative aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            className="absolute inset-0 h-full w-full"
            allow="accelerated-2d-canvas; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title="Відеоогляд"
          />
          <button
            onClick={() => onOpenChange(false)}
            className="absolute -top-10 right-0 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Файл:** `apps/store/components/store/lot-reviews.tsx` — `LotReviewCard` зробити client component (через окремий wrapper або винести у `lot-review-card.tsx` з `"use client"`):

Варіант A (чистіший): новий файл `apps/store/components/store/lot-review-card.tsx` з `"use client"`, отримує `lot`, `productId`, `productName`, `rate`. Усередині useState для modal open + `<VideoModal>`. Замість `<a href="https://www.youtube.com/...">` тепер `<button onClick={() => setOpen(true)}>` з тими ж стилями.

`lot-reviews.tsx` лишається server component, імпортує `LotReviewCard` (client). Це працює — server can render client child.

**Файл:** `apps/store/components/store/recent-reviews-carousel.tsx` — НЕ міняй на inline player. Вона веде на product page (це SEO + UX — клієнт побачить deтails продукту). Лишай `<Link href="/product/{slug}">` як є.

⚠️ CSP уже дозволяє `frame-src https://www.youtube.com https://youtube.com` (`next.config.js:88`), тому iframe працює без додаткових змін.

## Out of scope

- Backend rate caching — поточний `getCurrentRate()` уже cached через React `cache()`.
- Mobile app — paused.
- Inline player на recent reviews carousel — не треба, нехай click веде на product page.
- Update Order email template для UAH — окрема задача (зараз email показує EUR, що OK для menager).
- Дублювання heart іконки на mobile (header heart лишається — це wishlist navigation у /wishlist, не плутати з product wishlist).

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` — green
- [ ] `cd apps/store && pnpm build` — standalone build success
- [ ] Manual: відкрити `/product/<slug-з-багатьма-фото>` на mobile (Chrome DevTools, viewport 412×915 Pixel 7) — НЕ повинно бути horizontal scroll, текст нормального розміру
- [ ] Manual: на product page — тільки 1 wishlist button (поряд з CTA), не 2
- [ ] Manual: натиснути "Додати до замовлення" → cart показує суму у UAH (наприклад "7 305 ₴" з "(€169.85)" дрібним) для weight=20kg × €7.90 = €158
- [ ] Manual: rows у cart показують UAH, для рядків без barcode є префікс "≈"
- [ ] Manual: натиснути play на лоті у "Огляди лотів" — відкривається modal з YouTube embed, НЕ редірект на youtube.com
- [ ] Manual: ESC або клік backdrop у модалці — закриває

## Commit strategy

1. `fix(s60a): remove duplicate wishlist button on product page`
2. `fix(s60b): mobile layout — min-w-0 on grid children to prevent overflow`
3. `feat(s60c): cart — UAH conversion + per-line totals + ≈ prefix for general items`
4. `fix(s60c): AddProductToCartButton stores total priceEur (per-kg × weight) for lot consistency`
5. `feat(s60d): inline video player — VideoModal + lot-review-card client refactor`

Push branch `claude/s60-product-card-fixes`. NOT merge to main, NOT create PR.

## Hard rules

- TypeScript strict, 0 `any`.
- Не чіпати `output: 'standalone'`.
- Не редагувати CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- Pre-commit hook auto-prettier — НЕ bypass.
- ASCII-only PowerShell скрипти (н/а).
