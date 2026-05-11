# Session 58 — Product Image Optimization (Worker Spec)

**Дата:** 2026-05-01
**Тип:** worker
**Ефорт:** ~2-3 год
**Branch:** `claude/s58-photo-optimization`
**Орієнтир:** mobile broken when product has multiple photos — gallery downloads MB-size originals; admin uploads stored as raw JPEG/PNG

## Проблема

`apps/store/components/store/image-gallery.tsx` використовує сирий `<img>` (НЕ `next/image`) для main image, всіх thumbnail-ів і lightbox. Кожне фото — пряме посилання на Supabase Storage, повнорозмірне.

`apps/store/app/admin/products/actions.ts::uploadProductImage` приймає файли до 5 МБ і кладе в bucket as-is, без resize/compression.

Результат: товар з 13 фото = ~30-50 МБ траффіку, layout стрибки під час завантаження, mobile фактично "ламається" на 4G.

`apps/store/components/store/product-card.tsx` уже використовує `next/image` — каталог працює нормально.

`next.config.js` уже має `remotePatterns` для `*.supabase.co`, тож `next/image` запрацює без додаткової конфігурації.

## Scope (обов'язкові обидві частини)

### Part A — Image Gallery rewrite з `next/image`

Файл: `apps/store/components/store/image-gallery.tsx`

1. Замінити raw `<img>` на `next/image` у всіх трьох місцях (main, thumbnails, lightbox).
2. **Main image**:
   - Огорнути в `<div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border ...">` (або існуючий контейнер adjust-нути).
   - `<Image fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" priority />` для першого зображення (selectedIndex===0 ? priority : undefined).
   - Hover scale-zoom лишити через `className`.
   - Зберегти `cursor-pointer` + `onClick` для lightbox.
3. **Thumbnails strip**:
   - Лишити `flex gap-2 overflow-x-auto pb-1` контейнер.
   - Кнопка `h-16 w-16 shrink-0 relative` + `<Image fill sizes="64px" loading="lazy" className="object-cover" />`.
4. **Lightbox**:
   - `<Image fill sizes="100vw" quality={90} className="object-contain" />` всередині `relative h-[90vh] w-full` контейнера.
5. Зберегти всю поточну логіку: prev/next buttons (+/-1 з wrap-around через `goTo`), chevrons на main image при `images.length > 1`, dot counter `{selectedIndex+1} / {images.length}`, lightbox dialog open/close.
6. Loader skeleton у `dynamic()` import (page.tsx:33) лишається — `aspect-[4/3]` уже є.

**Важливо:** прохід типів (`fill` вимагає parent `position: relative`). Перевірити що TS не лається.

### Part B — Server-side resize + WEBP при upload

Файл 1: `apps/store/app/admin/products/actions.ts::uploadProductImage` (рядки 66-111)

```ts
import sharp from "sharp";
// ...після validateImageFile, перед supabase.upload:
const buf = Buffer.from(await file.arrayBuffer());
const optimized = await sharp(buf)
  .rotate() // honor EXIF orientation
  .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
  .webp({ quality: 82 })
  .toBuffer();

const fileName = `${productId}/${Date.now()}.webp`;

const { error } = await supabase.storage
  .from("product-images")
  .upload(fileName, optimized, { contentType: "image/webp" });
```

Файл 2: `apps/store/app/admin/banners/actions.ts` — знайти аналогічну `uploadBanner` (або як вона називається), застосувати ту саму логіку, але з більшим max-width (бо банери 16:9):

```ts
.resize({ width: 2400, height: 1350, fit: "inside", withoutEnlargement: true })
.webp({ quality: 85 })
```

Файл 3: `apps/store/package.json` — додати `"sharp": "^0.33.5"` у dependencies. На Windows Server PM2 build має зібратися без додаткових кроків (sharp postinstall завантажить prebuilt binary).

**Важливо:**

- НЕ міняти `validateImageFile` — magic-bytes валідація на оригіналі лишається.
- `maxBytes: 5 * 1024 * 1024` лишається (input limit).
- EXIF rotation через `.rotate()` без аргументів (Sharp читає orientation tag і виправляє).
- Output extension завжди `.webp` незалежно від input.

### Out of scope

- Backfill існуючих фото (805 SKU × N фото) — окрема задача, може зробити user через `scripts/recompress-existing.ts` пізніше.
- Multi-variant generation (thumb 256w / medium 800w) — `next/image` робить це on-demand.
- Mobile app gallery (Expo client) — mobile work paused.
- Lightbox keyboard nav (Esc/arrow keys) — поза scope, зберегти поточну поведінку.

## Verification

1. `pnpm format:check && pnpm -r typecheck && pnpm -r test` — все зелене (243+ tests).
2. `cd apps/store && pnpm build` — successful standalone build, `next/image` оптимізатор активний.
3. Manual: відкрити `/admin/products/<id>`, завантажити 4 МБ JPEG → перевірити у Supabase bucket що файл `<productId>/<ts>.webp` ~150-400 КБ.
4. Manual: відкрити `/product/<slug>` з 5+ фото у Chrome DevTools (Network throttling → "Fast 4G", viewport "Pixel 7"):
   - Initial page load <2 МБ total transferred.
   - No layout shift під час loading (CLS=0).
   - Thumbnails lazy-load на скрол стрічки.
5. Manual: existing photos (без `.webp` extension у URL) рендеряться через `next/image` — він трансформує JPEG/PNG на льоту.

## Commit strategy

- Атомарні коміти:
  - `feat(s58a): image gallery — next/image with proper sizing`
  - `feat(s58b): sharp resize+webp on admin upload (products + banners)`
- Push `claude/s58-photo-optimization`, orchestrator merge у main.

## Hard rules

- Не чіпати `output: 'standalone'` у `next.config.js`.
- Не редагувати CLAUDE.md / HISTORY.md / SESSION_TASKS.md — це робить orchestrator після merge.
- ASCII-only у будь-яких PowerShell скриптах (наразі не треба, але pravilo).
- Не міняти Supabase bucket policies / RLS.
- НЕ робити `prisma migrate` — DB schema не зачіпається.
