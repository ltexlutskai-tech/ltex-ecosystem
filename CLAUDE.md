# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `main` (all work through **Session 34** merged).

**L-TEX website is LIVE on self-hosted Windows Server:** https://new.ltex.com.ua (Cloudflare Tunnel)

- **Live production:** `https://new.ltex.com.ua` via Cloudflare Tunnel `ltex-prod` (UUID `1b604cd0-1beb-4b0a-897f-93d67e58357f`), Windows Server 2022 (i5-9600K, 32GB, 107 Mbit symmetric)
- **DNS:** `ltex.com.ua` на Cloudflare NS (`fiona` + `trey`). Hostiq hosting email/cPanel (non-web records як DNS-only).
- **Netlify** `stalwart-dango-04a9b9.netlify.app` deprecated але живий (fallback).
- **DB:** local PostgreSQL 16 на `E:\PostgreSQL\16` — primary (805 products, 725 lots, 49 categories). Next.js читає звідти у runtime (`apps/store/.env` → `localhost:5432`). Supabase PostgreSQL (Frankfurt) — cold backup mirror, **не active** (оновлюється тільки при exporting changes; migration `20260428_notifications` apply-ється на ньому тільки якщо активуємо Netlify fallback). Supabase Auth (admin login) + Supabase Storage (banners, product images, відео) **лишаються активні**.
- **Auto-start:** cloudflared + PostgreSQL як Windows services; PM2 через Scheduled Task "PM2 Resurrect" (60s delay).
- **Monitoring:** UptimeRobot Free, 3 monitors (`/`, `/catalog`, `/admin/login`), 5-min interval.
- **Backups:** Daily `pg_dump -Fc` at 03:00 → `E:\ltex-backups\` (14-day retention).
- **CI green:** 243 unit + 36 E2E tests, TypeScript strict, 0 `any`.
- **Security:** Sessions 16-17 закрили 4 CRITICAL + 3 HIGH вразливості перед self-hosted deploy.
- **Mobile client (Expo SDK 52):** working — Home з banners + 3 product rails (S34), 4-tab nav, Catalog 2-column grid + bottom-sheet filter (S38), wishlist persistence + saved-products screen (S39), chat unread badge на MoreTab + MoreScreen (S35), notifications screen з deep links + mark-read (S36), points to `https://new.ltex.com.ua/api`. QuickView — pending. **Native APK не distributed** — користувачі поки скачують лише PWA з веб-сайту.

### Session log (recent)

- **S27** deploy.ps1 hardening v1 (direct pnpm filter, .env sync, --update-env)
- **S28-S32** web catalog UX (product card quickfixes, remove Compare, filters left sidebar + mobile bottom-sheet, grid/list toggle, wishlist always visible)
- **S33** mobile home screen Rozetka-style + 4-tab restructure (Home / Search / Cart / More + FAB messenger)
- **S37** deploy.ps1 hardening v2 (Tee-Object pipe + PM2 try/catch + pm2 ping). PM2 daemon resilience verified end-to-end. Tee-Object thesis для buffering — невірний (S39 закрив).
- **S38** mobile catalog parity with web (ProductCard 4:3 + NEW/SALE + wishlist heart UI, bottom-sheet `CatalogFilterSheet` with all web filters, FlatList numColumns=2). Done by background worker subagent in ~10 min.
- **S39** deploy step 4 fix + wishlist persistence. **Both prior buffering theses (S37 Tee-Object, "real fix is cmd /c") були хибними** — direct `pnpm --filter @ltex/store run build` працює як треба. Не додавати редирект у крок [4/8] жодного типу. Mobile wishlist: SecureStore-backed (100-item cap), fire-and-forget mirror у `/api/mobile/favorites` коли logged in, WishlistScreen — 2-col grid.
- **S34** mobile home banners + 3 product rails (Топ / Акції / Новинки). Single-shot `/api/mobile/home` endpoint (60s ISR), pure-RN BannerCarousel (rgba overlay, no expo-linear-gradient dep) + HorizontalProductRail. Endpoint live, банери на сайті — pending admin upload (P0 #4).
- **Регресія S34→S42:** другий поспіль deploy висне на [4/8] бо PM2 worker (cluster АБО fork) тримає file handle на `apps/store/.next/standalone/...`. **Закрито у S42** через `pm2 kill` prelude (daemon-level signal вбиває всіх дітей). S40/S41 спроби (`pm2 stop`, `pm2 delete`+regex) не спрацювали — application-level API на Windows нестабільне. Spec у `docs/SESSION_40_DEPLOY_PM2_NODE_LOCK.md` (S40) + `docs/SESSION_41_DEPLOY_FORK_MODE.md` (S41).
- **S35** mobile chat unread badge — light `/api/mobile/chat/unread` endpoint (count manager+unread+customerId), `<ChatUnreadProvider>` polling 30с only when logged-in + AppState foreground refresh, `tabBarBadge` на MoreTab (#dc2626, "9+" cap) + бейдж біля "Чат з менеджером" на MoreScreen, optimistic clear у ChatScreen (initial fetch + SSE manager message). 8 files, +243/-6, tests 249/249.
- **S36** mobile notifications screen + new `Notification` model. DB migration `20260428_notifications` (table + 2 indexes + FK CASCADE), GET extended additively з in-app feed (`take: 100`), new PUT для mark-single/mark-all з tenant scoping. Mobile FlatList: type icons, inline `formatRelative`, unread blue dot, optimistic mark-read, header-right mark-all, pull-to-refresh, deep links (order_status / new_video / chat_message / system). 6 files, +571/-16, tests 255/255. **⚠️ Перед deploy потрібен `prisma migrate deploy` на обох DBs.**
- **S43** DB `ViewLog` model + recommendations engine. Migration `20260429_view_log` (table + 2 indexes + FK Cascade/SetNull). New POST `/api/mobile/products/[id]/view` (auth optional, fire-and-forget) + GET `/api/mobile/recommendations` (category-match для authed з 30-day window, fallback newest in-stock). Спільний `lib/mobile-product-shape.ts` між home + recommendations. 4-й rail "Рекомендоване для вас" на mobile HomeScreen + `productsApi.trackView()` на ProductScreen mount. 14 files, +604/-85, tests 264/264. **⚠️ Перед deploy `prisma migrate deploy` на local DB.**
- **S44** mobile UX batch. CatalogFilterSheet: backdrop/X/Android-back з discard warning через `Alert.alert` коли dirty (snapshot+JSON-compare). Subcategory drill-down: новий `GET /api/categories?parent=<slug>` + 2-level pickers у sheet, reset child при switch parent. List/Grid toggle у CatalogScreen header — `expo-secure-store` `mobile.catalogListMode`, ProductCard `layout="list"` (horizontal flex, 120×120 thumbnail + country line). API plumbing: `/api/catalog` приймає `categorySlug` (expand parent+children) + `subcategorySlug` precedence + `inStock=true`. 10 files, +601/-21, tests 271/271.
- **S45** mobile QuickView modal. Bottom-sheet (`QuickViewModal.tsx`, 320 рядків, `presentationStyle="overFullScreen"` + transparent + slide animation): hero image + SALE badge + heart toggle через `useWishlist`, назва, meta (якість·сезон·країна), ціни (акційна+опт), lots count, "Закрити"/"Дивитись повністю" CTA. ProductCard: `onLongPress?` prop з `delayLongPress={500}` на grid+list. Wired у CatalogScreen, HomeScreen (всі 4 rails), WishlistScreen, HorizontalProductRail прокидує. Hard rule: trackView НЕ викликається на open QuickView (тільки full ProductScreen mount). 6 files, +364/-2, tests 271/271.
- **S46** husky + lint-staged pre-commit hook. Auto `prettier --write` на staged .ts/.tsx/.js/.jsx/.json/.md перед commit. Bypass через `--no-verify`. Server unaffected (dev-time only — `prepare` script ставить husky при `pnpm install`). 3 files, +417/-24.
- **S47** mobile UX completion. Pull-on-login wishlist merge: на customerId change `favoritesApi.list()` → union з local SecureStore (server-win on conflict) → cap 100. `lastSyncedCustomerIdRef` блокує re-runs у session, reset на logout. QuickView image carousel: pure RN `FlatList horizontal pagingEnabled` + dots indicator (тільки коли `images.length > 1`). Backend `/api/mobile/favorites` GET тепер віддає canonical `WebCatalogProduct` shape (через `mapMobileProduct`) замість thin shape. 4 files, +109/-34, tests 271/271.
- **S52** mobile FAB redesign. MessengerFab переніс з bottom-right у центр над tab bar (overlay), з ring border #fff і shadow для notched look. Unread badge з `useChatUnread()` (cap 9+). 4-tab pop-to-root regression fix через `tabPress` listener helper для всіх tabs (Головна/Пошук/Кошик/Ще). 292/292 tests baseline.
- **S53** mobile home content expansion (4 нові секції після newArrivals). Backend extends `/api/mobile/home` з `videoReviews` (8 продуктів з videoUrl) + `categories` (top-level з product count). Components: `CategoriesCarousel` (icon tile picker → catalog filtered), `useRecentlyViewed` hook (SecureStore key `mobile.recently_viewed_v1`, cap 12, addItem на ProductScreen mount), `TestimonialsCarousel` (5 mock відгуків з `lib/testimonials.ts`). HomeScreen wires всі 9 секцій. 292/292 tests.
- **S54** EAS Build preview APK setup. `eas.json` з 3 profiles (development/preview/production), `app.json` додав `runtimeVersion: { policy: "sdkVersion" }` + `updates.url` placeholder + `extra.eas.projectId` placeholder. Worker створив icon.png/splash.png/adaptive-icon.png placeholders (Sharp). Документація `docs/EAS_BUILD.md` для user setup. **Real projectId**: `83900d4b-6b2a-4d7c-bb63-562bb96b6948` (commit 8187a5e після `eas init`). User Expo account: `ltex.lutsk.ai@gmail.com` через Google OAuth (no password — login через `EXPO_TOKEN` env var).
- **S55** mobile hotfix — Ionicons font preload (іконки зникали у нативному APK через відсутній `expo-font` preload, у Expo Go runtime їх підвантажував). Додав `expo-font` + `expo-splash-screen` у package.json, App.tsx з `Font.loadAsync(Ionicons.font)` + 3-сек failsafe timeout. Hide-on-Chat для FAB через `useNavigationState` — **REVERTED** (S55-followup) бо crashes app з "Couldn't get the navigation state" — FAB рендериться поза screen у RootNavigator, hook вимагає бути всередині screen. ChatScreen `inputBar.paddingBottom: 96` як заміну (FAB не перекриває input).
- **S56** Supabase service-role key for admin storage. Новий `lib/supabase/admin.ts` з `createServiceRoleClient()` (cached singleton, no cookies, bypass RLS). Замінив `createSupabaseAdmin` (alias на anon-key client) у banners/products actions для image upload+delete. `.env.example` додав `SUPABASE_SERVICE_ROLE_KEY`. **User-action post-deploy:** додати ключ у `apps/store/.env`, видалити legacy "Admin INSERT" RLS policy у Supabase Dashboard.
- **S57** banner redesign image-only clickable. Видалено title/subtitle/ctaLabel поля з form (DB nullable, ctaHref required), web BannerCarousel rewrite (`aspect-[16/9]`, цілий image у Link, без prev/next chevrons + dots overlays — fix desktop crop), mobile BannerCarousel — Pressable з URL routing (internal `/catalog` → `navigation.navigate("Catalog")`, /product/\* → web fallback, http(s) → Linking.openURL). Migration `20260430_banner_imageonly` — DELETE FROM banners + ALTER columns. **Hotfix `2917d09`**: homepage filter banners з `ctaHref: null` (Prisma TS не дозволяє `not: null` filter, тому `.filter()` after query). 9 files, 292/292 tests.
- **S58** product image optimization. ImageGallery rewrite з raw `<img>` на `next/image fill` (main `aspect-[4/3]` + sizes `(max-width:1024px) 100vw, 50vw` + priority на selectedIndex===0; thumbs `relative h-16 w-16` + sizes `64px` + lazy; lightbox `fill object-contain` quality=90). Додано z-10/z-20 + pointer-events-none на overlay щоб chevron clicks не блокувалися (next/image fill теж absolute). Server-side sharp pipeline у `uploadProductImage` (1920×1920 inside-fit, webp q82, EXIF rotate) + `uploadBannerImage` (2400×1350, q85). `sharp` переїхав з devDeps у dependencies (runtime use). 5 files, +80/-39, 292/292 tests, build green. **Effect:** product з 13 фото на mobile тепер ~2 МБ замість ~50 МБ + zero CLS. **No backfill** — існуючі фото лишаються original, але рендеряться через `_next/image` оптимізатор автоматично.
- **S59** product card redesign per `docs/MOCKUP_S59_PRODUCT_CARD.html`. Migration `20260502_product_attrs_lot_optional`: 4 нові nullable text-поля у Product (`gender` / `sizes` / `unitsPerKg` / `unitWeight`) + OrderItem.lotId + CartItem.lotId стали nullable з `ON DELETE SET NULL` + dropped `@@unique([cartId, lotId])` (dedup на app-level). Cart дозволяє items без lotId — клієнт може додати "позицію загалом" (менеджер обере вільний лот) АБО конкретний лот через "Огляди лотів" блок. New components: `LotReviews` (replaces "Доступні лоти" — video thumb 16:9 з YouTube `i.ytimg.com/vi/{id}/hqdefault.jpg` + play overlay або "Огляд скоро" placeholder, ціна у грн з `(€)` дрібним сірим, per-lot AddToCart), `RecentReviewsCarousel` (12 продуктів videoUrl != null orderBy updatedAt desc, exclude current; стрілка "Усі огляди на YouTube →" з `NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL` env, fallback `@LTEX`), `ShareIcons` (icon-only Copy/Telegram/Viber/Facebook/WhatsApp з brand colors + tooltip; replace ShareButtons), `TrustBadge` ("Усі фото є оригінальними"), `AddProductToCartButton` (general product без lotId). Helpers: `lib/exchange-rate.ts::getCurrentRate()` (cache via React `cache()`, fallback rate=43), `lib/youtube.ts::extractYouTubeId` (3 URL формати, перенесено з video-reviews.ts з re-export для backward-compat). Email template `sendOrderConfirmationEmail` — 2 секції ("Конкретні лоти" з barcode vs "Загальні позиції"). StockIndicator: тільки "В наявності" (зелений) АБО "Очікуємо надходження" (бурштиновий) — без кількості лотів/кг. KeyFactsList: 8 рядків з ✔, render тільки коли поле != null. Admin form: inputs для 4 нових полів. 29 files, +1412/-530, 284 tests pass, typecheck/build green. **⚠️ Перед deploy:** `pnpm --filter @ltex/db exec prisma migrate deploy` на local DB. Worker не міг запустити migrate (sandbox без PostgreSQL).
- **S60** product card + cart fixes (4 issues від QA). Видалено дубль `WishlistButton` на product page (лишилась тільки біля CTA). Mobile layout — `min-w-0` на обох grid children у `lg:grid-cols-2` (фікс zoom-out на mobile при багатьох фото — корінь у CSS Grid default `min-width:auto`). Cart: `AddProductToCartButton` тепер зберігає `priceEur = perKg * weight` (total, як у лотах) — це фіксує інконсистентність з `lot.priceEur` (який є total). `cart/page.tsx` розділено на server wrapper (читає `getCurrentRate()`) + client `cart-client.tsx`; per-line UAH primary + EUR дрібно сірим, items без barcode мають префікс "≈" з tooltip "Розраховано на середню вагу — менеджер уточнить", sidebar total UAH крупно. New `VideoModal` (client, `@ltex/ui` Dialog + iframe `youtube.com/embed/{id}?autoplay=1&rel=0`, `{open && <iframe>}` для unmount при закритті щоб зупинити відео), `LotReviewCard` винесено у client component для useState modal open. CSP уже дозволяє `frame-src` YouTube. 9 files, +491/-409, 309 tests, build green.
- **S61** lots page redesign per `docs/MOCKUP_S61_LOTS_PAGE.html`. `/lots` rewrite з таблиці на catalog-style grid: sidebar з фільтрами (status, hasVideo, category з counts, quality, season, country, weight range, priceEur range), search, sort (newest/priceAsc/priceDesc/weightDesc), pagination 30/page, mobile bottom-sheet через спільний `LotsFiltersForm` (DRY desktop sidebar + mobile sheet). New `LotCard` (client, video thumb 16:9 зверху + info під ним, click play → `VideoModal`, in-cart state через `useCart()`, status badges Вільний/Акція −X%/Зарезервований/Продано, шт/пар per `priceUnit`, salePercent з `prices.wholesale` vs `prices.akciya`). New `/lot/[barcode]` detail page: `LotVideoPlayer` (click thumbnail → swap у inline iframe in-place — без модалки на hero), KeyFactsList ✔ 8 рядків (Вага лота / К-сть / Сорт / Сезон / Стать / Розміри / Країна / Категорія), CTA "Додати лот", info-блок з лінком на product page, "Інші лоти цього товару" 6×LotCard, ShareIcons. URL `/lot/{barcode}` — `encodeURIComponent` defensively на href. Server-side render (no `/api/lots` endpoint). Merge S60+S61 conflict у `video-modal.tsx` — лишили S61 версію (`{open && <iframe>}` стопає відео при закритті, `shadow-2xl`, `accelerometer` removed). 11 files, +1500ish, 301 tests.
- **S62** lots page polish + quick order (7 issues від QA). Apply button для price/weight ranges (замість onBlur — клас UX win). Sidebar `max-h-[calc(100vh-6rem)] overflow-y-auto` — окремий scroll від сторінки. Mobile sheet — прибрана окрема "Застосувати" кнопка (унифіковано з desktop через ту саму кнопку у формі), додано X close у header. Status filter: 3 radio → 4 checkbox multi-select (Заброньовані / Вільні / Акції / Новинки=isNew → createdAt ≥ 14 днів). Default коли пусто: `["free","on_sale"]`. LotCard додає "NEW" badge якщо createdAt у 14d window. Видалено фільтр "Тільки з відеооглядом" (всі лоти мають video у проді) + URL handling + backend filter. List/grid layout toggle через існуючий `CatalogLayoutToggle` (URL `?layout=list|grid`). LotCard `layout="list"` — horizontal flex з video thumb `w-48 h-28` + info справа з `mt-auto` для CTA внизу. Quick order: secondary CTA "⚡ Купити в один клік" на LotCard (тільки free/on_sale), новий `QuickOrderModal` client component (name+phone form, success state), новий `/api/quick-order` endpoint (Zod validate + rate limit 3/min + lot status guard 409 + Customer findFirst+create бо phone non-unique + email/Telegram fire-and-forget). 9 files, +842/-185, 335 tests pass.

### Post-S57 hotfixes (2026-04-30)

- **`d44a2d1`** — `next.config.js` `experimental.serverActions.allowedOrigins: ["new.ltex.com.ua", "ltex.com.ua", "localhost:3000"]`. Cloudflare Tunnel робить `Host: localhost:3000` але browser шле `Origin: https://new.ltex.com.ua` → дефолтний Server Actions security check рейлив 403 на ВСІ POST до server actions.
- **`e2d0e39`** — `scripts/deploy.ps1` `pm2 kill` обернув у try/catch + `2>&1 | Out-Null`. `$ErrorActionPreference = "Stop"` робив warning "[PM2][WARN] No process found" terminating error → script aborts після [3/8] якщо PM2 уже мертвий від попередньої невдалої спроби.
- **`a9b61a9`** + **`caeb5d0`** + **`c65beaa`** — mobile App.tsx defensive boot: failsafe timeout, потім remove ready gate + ErrorBoundary з visible error message + видалити `useNavigationState` з MessengerFab (це і був корінь white-screen після всіх попередніх фіксів — hook crash invisible до додавання ErrorBoundary).

### Cloudflare WAF Custom Rule (production-critical)

`Skip WAF for admin uploads` — `URI Path starts with /admin` → action **Skip** → checked: All managed rules + Browser Integrity Check. Без цього правила Cloudflare Managed Rules блокують POST з multipart form-data на `/admin/*` (anti-XSS/SQL-injection patterns). Це блокувало banner upload навіть з валідним auth + service-role key.

**IMPORTANT FOR NEW SESSIONS:** Do NOT re-audit or re-merge branches. Проект повністю функціональний. Читай `docs/HISTORY.md` для деталей попередніх сесій.

## Quick Navigation

| Документ                                                   | Коли читати                                              |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | Tech stack, file tree, DB schema, env vars, URLs, tests  |
| [docs/HISTORY.md](docs/HISTORY.md)                         | Що робилось у Sessions 4-18 (completion reports)         |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)                 | Do-not-touch list, existing systems, technical decisions |
| [docs/SESSION_TASKS.md](docs/SESSION_TASKS.md)             | Що треба зробити далі (priority queue P0-P3)             |
| [DEPLOYMENT.md](DEPLOYMENT.md)                             | Як деплоїти на Windows Server                            |
| [PROJECT_AUDIT_2026-04-18.md](PROJECT_AUDIT_2026-04-18.md) | Повний audit snapshot (695 рядків, 12 секцій)            |

## Critical Rules for All Sessions

1. **DO NOT repeat Sessions 4-18** — дивись `docs/HISTORY.md`. Seed, merge, infrastructure setup — все зроблено.
2. **DO NOT touch `output: 'standalone'`** у `apps/store/next.config.js` — critical для self-hosted standalone build.
3. **DO NOT touch server infrastructure** (PM2 Task, cloudflared service, backup script) без конкретної потреби.
4. **DO NOT break CI** — запускай `pnpm format:check && pnpm -r typecheck && pnpm -r test` перед push.
5. **L-TEX НЕ приймає онлайн-оплати** — таблиця `payments` тільки для відображення з 1С.
6. **Orchestrator планує і мерджить. Worker кодить і пушить у feature branch.**
7. **You cannot SSH to the server.** Windows + PowerShell. Для infra-fix — диктуй команди, юзер виконує локально.

Більше правил — у `docs/CONVENTIONS.md`.

## Orchestration Workflow

### Session Types

**Orchestrator** — управляє проектом, НЕ кодить:

- Review та merge feature branches в main
- Видалення merged branches
- Перевірка CI/deploy статусу
- Оновлення `docs/SESSION_TASKS.md` (планування) і `docs/HISTORY.md` (звіти)
- Планування задач для worker-сесій

**Worker** — кодить, НЕ управляє:

- Виконує задачі з `docs/SESSION_TASKS.md` або окремої worker-spec у `docs/SESSION_N_*.md`
- Автоматично створює feature branch
- Пушить результат на свою гілку
- НЕ мерджить в main — це робить orchestrator

### Процес

```
Orchestrator: план → docs/SESSION_TASKS.md → push main
    ↓
Worker: читає spec → кодить → push feature branch
    ↓
Orchestrator: review → merge → cleanup → новий план
```

### Worker Session Checklist (для orchestrator після кожної worker-сесії)

- [ ] `git fetch origin` — знайти нову гілку
- [ ] `git log origin/<branch> --oneline` — переглянути коміти
- [ ] `git diff main..origin/<branch> --stat` — переглянути зміни
- [ ] `git merge origin/<branch>` — merge в main
- [ ] `git push origin main` — push main
- [ ] `git push origin --delete <branch>` — видалити merged branch (може впасти 403, тоді GitHub UI)
- [ ] Перевірити CI — green?
- [ ] Оновити `docs/HISTORY.md` — звіт + `docs/SESSION_TASKS.md` нові задачі

## Tech Stack

- Monorepo: Turborepo + pnpm 9.x
- Language: TypeScript 5.x (strict, 0 `any`)
- Web: Next.js 15 (App Router, `output: 'standalone'`) + React 19
- Styles: Tailwind CSS 3.4 + shadcn/ui + Radix
- Database: PostgreSQL 16 (Supabase Frankfurt + local Windows) + Prisma 6.x
- Auth: Supabase Auth (admin) + custom HMAC JWT (mobile)
- Files: Supabase Storage
- Testing: Vitest + Playwright
- CI/CD: GitHub Actions (format + test + typecheck + build + E2E)
- Hosting: self-hosted Windows Server + Cloudflare Tunnel (primary), Netlify (fallback)

Детальний tech stack — у `docs/ARCHITECTURE.md`.

## Important Notes

- **Language:** Ukrainian (primary), site `lang="uk"`
- **Currency:** EUR для wholesale prices, UAH для display (rate from 1C)
- **Minimum order:** від 10 кг
- **Products have YouTube video reviews** (767/805)
- **Quality levels:** Екстра, Крем, 1й сорт, 2й сорт, Сток, Мікс
- **Lots** (мішки/bags) have individual barcodes, weight, quantity, YouTube videos
- **Price per kg** (most products) OR per piece/pair (footwear, 91 items)
- **Assortment:** секонд хенд, СТОК, іграшки, Bric-a-Brac, косметика
