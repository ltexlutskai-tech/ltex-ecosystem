# Session 57 — Worker Task: Banner Redesign (image-only clickable)

**Створено orchestrator-ом:** 2026-04-30
**Пріоритет:** P1 (UX — banners перевизначення)
**Очікуваний ефорт:** 1.5-2 години
**Тип:** worker session

---

## Контекст

Поточні банери мають title/subtitle/CTA-button overlay поверх зображення. User вирішив що це обмежує дизайн — хоче банери де **вся інформація вже всередині картинки** (текст, лого, заклик — все вмонтовано у графічний дизайн самого банера). Адмін форма стає простіша: тільки image + посилання + позиція + active.

**Новий UX:**

1. Admin завантажує готову картинку банера (типу 1920×1080 PNG/JPG з усім текстом)
2. Вказує посилання (куди клік веде — `/catalog`, `/product/abc`, або зовнішня URL)
3. На сайті — цілий image clickable, без overlay тексту/кнопок

**Старі банери (з текстом) — видаляємо з БД** через migration.

---

## Branch

`claude/session-57-banner-redesign` від main.

---

## Hard rules

1. НЕ дропати колонки `title`/`subtitle`/`ctaLabel` у БД — лише робимо nullable, на випадок якщо передумаємо. `ctaHref` робимо required.
2. Aspect ratio фіксований **16:9** (`aspect-[16/9]` Tailwind / `aspectRatio: 16/9` RN). Рекомендований розмір картинки: 1920×1080.
3. Web carousel — лишаємо swipe/auto-rotate/dots-indicator/prev-next. Прибираємо лише overlay з текстом і кнопкою. Цілий `<Image>` загорнутий у `<Link>`.
4. Mobile carousel — те саме, цілий image у `<Pressable>` що навігує по ctaHref (internal route → `navigation.navigate`, external https → `Linking.openURL`).
5. Migration cleanup: `DELETE FROM banners` (user підтвердив що старі видалити).
6. CI: 292 unit baseline + format + typecheck + build green. Без нових тестів (UI refactor).

---

## Файли

### 1. Schema: `packages/db/prisma/schema.prisma`

```prisma
model Banner {
  id         String   @id @default(cuid())
  title      String?  // ← was String (required), now nullable (legacy)
  subtitle   String?
  imageUrl   String
  ctaLabel   String?
  ctaHref    String   // ← was String? (optional), now required
  position   Int      @default(0)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([isActive, position])
  @@map("banners")
}
```

### 2. Migration: `packages/db/prisma/migrations/20260430_banner_imageonly/migration.sql`

```sql
-- Cleanup old banners (user request — нові будуть image-only)
DELETE FROM "banners";

-- title тепер опційний (legacy)
ALTER TABLE "banners" ALTER COLUMN "title" DROP NOT NULL;

-- ctaHref тепер обов'язковий (банер без посилання не має сенсу)
ALTER TABLE "banners" ALTER COLUMN "ctaHref" SET NOT NULL;
```

### 3. Admin form: `apps/store/app/admin/banners/banner-form.tsx`

Прибрати inputs:

- `<input name="title">`
- `<textarea name="subtitle">`
- `<input name="ctaLabel">`

Перейменувати `<input name="ctaHref">` placeholder з "/catalog" на "Посилання (обов'язкове) — наприклад /catalog або https://..." і додати `required`.

Лишити: image upload (primary), ctaHref (required), position, isActive.

### 4. Server actions: `apps/store/app/admin/banners/actions.ts`

```typescript
const bannerSchema = z.object({
  imageUrl: z.string().min(1, "Зображення обов'язкове"),
  ctaHref: z.string().min(1, "Посилання обов'язкове").max(500),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

function parseBannerForm(formData: FormData) {
  const positionRaw = formData.get("position");
  return bannerSchema.parse({
    imageUrl: (formData.get("imageUrl") as string) ?? "",
    ctaHref: (formData.get("ctaHref") as string) ?? "",
    position:
      typeof positionRaw === "string" && positionRaw.length > 0
        ? parseInt(positionRaw, 10)
        : 0,
    isActive: formData.get("isActive") === "on",
  });
}
```

`createBanner` / `updateBanner` — лишаємо як є, бо `data` тепер не містить title/subtitle/ctaLabel (Prisma їх ігнорує — вони nullable). `uploadBannerImage` НЕ чіпати — він окремий і вже працює через service-role (S56).

### 5. Web carousel: `apps/store/components/store/banner-carousel.tsx`

Замінити поточний рендер на:

```typescript
return (
  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
    <Link href={current.ctaHref} className="block h-full w-full" data-analytics="banner-click">
      <Image
        src={current.imageUrl}
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
        className="object-cover transition-opacity duration-500"
      />
    </Link>
    {banners.length > 1 && (
      <>
        {/* prev/next/dots — як зараз. Не у середині Link, поверх. */}
      </>
    )}
  </div>
);
```

`alt=""` — бо image декоративний (вся інформація графічна, для accessibility — текст усередині картинки. Якщо потрібен — потім додамо `altText` поле у Banner моделі).

Update `Banner` interface у файлі — `title` стає optional, `subtitle/ctaLabel` забираємо, `ctaHref` стає required.

### 6. Mobile carousel: `apps/mobile-client/src/components/BannerCarousel.tsx`

Замінити рендер каждого банера. Загорнути `<Image>` у `<Pressable onPress={() => handlePress(banner.ctaHref)}>`. Прибрати overlay text/CTA. Aspect ratio 16:9.

```typescript
function handlePress(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    Linking.openURL(href).catch(() => {});
    return;
  }
  // Internal route: parse '/catalog', '/product/{slug}' тощо.
  // Reuse logic з NotificationsScreen deep link handler якщо існує.
  // Або просто navigation.navigate("CatalogTab") з paramsами якщо matches.
  // MVP: тільки /catalog і /product/{slug} — інакше fallback Linking.openURL з повним URL.
}
```

Worker подивиться як інші компоненти (`HorizontalProductRail`, `QuickViewModal`) робили навігацію з продукту і зробить аналогічно. Якщо ctaHref починається з `/product/` — `navigation.navigate("Product", { slug: ... })`. Якщо `/catalog` — `navigation.navigate("CatalogTab")`. Якщо інше — `Linking.openURL("https://new.ltex.com.ua" + href)`.

### 7. API endpoint: `apps/store/app/api/mobile/home/route.ts`

Перевірити що `banners` map включає `ctaHref` (зараз має бути, але з urlChange — required). Якщо у select є явний перелік полів — додати `ctaHref` (хоча скоріш за все там просто весь Banner).

### 8. Cleanup unused imports

У web banner-carousel прибрати `data-analytics="banner-cta-click"` бо CTA більше нема. Залишити `data-analytics="banner-click"` на Link.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` 292/292 ✅
4. ASCII-only `deploy.ps1` ✅ (не зачіпається)
5. Manual: `pnpm --filter @ltex/store dev` → `/admin/banners/new` показує лише image+ctaHref+position+isActive. Після створення — на homepage цілий банер клікається.

---

## Out-of-scope

- Окреме поле `altText` для accessibility (поки `alt=""` бо вся інфа графічна — додамо коли user попросить)
- Видалення колонок title/subtitle/ctaLabel з БД (лишаємо nullable на випадок rollback)
- Аналітика кліків (Umami сам трекатиме URL переходи через `data-analytics="banner-click"`)
- Lazy-load наступних банерів (зараз всі рендеряться у DOM, при 3-5 банерах — ОК)
- Drag-to-reorder у admin списку (лишається поточний position input)

---

## Branch + commit + push

Branch: `claude/session-57-banner-redesign`
Commit: `feat(s57): banner redesign — image-only clickable, drop title/subtitle/CTA fields`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

**⚠️ Migration required:** після pull на сервері ОБОВ'ЯЗКОВО:

```powershell
cd E:\ltex-ecosystem
pnpm --filter @ltex/db prisma migrate deploy
.\scripts\deploy.ps1
```

Migration:

- `DELETE FROM banners` — видалить ВСІ існуючі банери (user підтвердив)
- `title` стане nullable
- `ctaHref` стане NOT NULL (немає рядків — safe)

Mobile — окремий `eas build --platform android --profile preview` після merge.
