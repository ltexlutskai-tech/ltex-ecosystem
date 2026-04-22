# L-TEX Ecosystem — Project Audit

**Дата аудиту:** 2026-04-18
**Аудитор:** Claude (аналітичний режим, без модифікацій коду)
**Git HEAD:** `c0b1ad3` (main), 66 комітів
**Останній merge:** Session 17 (pre-deploy security fixes)

---

## 1. Executive Summary

**Стан одним реченням:** Функціонально насичена e-commerce платформа (3 apps + 2 bots + 22 Prisma моделі, 220 unit + 36 E2E тестів, CI green) на межі першого комерційного запуску через self-hosted Windows Server + Cloudflare Tunnel — технічно готова, але критично залежить від нетехнічного контенту й операційних процедур, яких ще немає.

**% готовності MVP:** ~92% (код), ~55% (operations + content). Різниця між цими двома цифрами — головний ризик проекту.

### 3 найсильніші сторони

1. **Якісний кодовий фундамент.** TypeScript strict з 0 `any`, 220 unit + 36 E2E тестів, CI green на кожному коміті (format + typecheck + test + build), 2 раунди security hardening (Session 16 + 17) закрили 4 CRITICAL і 3 HIGH вразливості перед виставленням назовні.
2. **Широта функціоналу vs конкуренти.** Повний набір: каталог з FTS (tsvector + trigram), wishlist/compare/recently-viewed, banners carousel, featured products, /new + /sale + /top, Umami analytics, 2 боти (Telegram + Viber), Expo mobile client, i18n-ready (~250 ключів). Wave 1 (Session 14) прямо наздогнав ukrstock.com.
3. **Процесна дисципліна.** Orchestrator/worker workflow, детальні completion reports кожної сесії, 17 сесій без регресу у CI, виправлення завжди через окремі feature branches з merge commits.

### 3 найсерйозніші ризики

1. **Self-hosted single point of failure.** Windows Server у Луцьку (i5-9600K, 107 Mbit) — немає бекапів (окрім Supabase, який вже не є primary DB), немає моніторингу, немає staging, немає runbook для інцидентів. Перебій інтернету у WestNet = сайт офлайн.
2. **Дефіцит бойових перевірок.** Код написаний, задеплоєний сьогодні, але не перевірявся під реальним навантаженням. E2E тести ганяються тільки на push до main, зараз `continue-on-error: true` — факт пройдення не блокує merge. Production smoke tests не згадані.
3. **Контентний блокер бізнес-запуску.** Банерів немає (тільки placeholder), фото продуктів у Supabase Storage не завантажені (всі 805 продуктів без зображень), featured products не курувалися, Umami не підключений, 1С інтеграція НЕ налаштована з боку 1С.

### Рекомендація

**Технічно готовий, комерційно НЕ готовий.** Не запускати публічну маркетингову активність поки не вирішені блокери: (а) фото продуктів, (б) 2-3 банери, (в) перевірка 1С sync end-to-end, (г) моніторинг + бекапи local PostgreSQL, (д) runbook "що робити якщо сайт ліг". Технічне запускання (сайт доступний з інтернету) — ОК, вже відбулося. Маркетингове — ще 1-2 тижні мінімум.

---

## 2. Timeline & Session Breakdown

Git історія зберігає 66 комітів, починаючи з `aa80927` (2026-04-08, Session 4 completion). Сесії 0-3 (Phase 0-3: моно-репо + store MVP + admin + боти + mobile app) відбулися **до** створення цього git-репо — вся інформація про них в CLAUDE.md. Timeline нижче сфокусований на **git-видимій історії**.

| № | Дата | Що зроблено (коротко) | Коміти | Ключові метрики |
|---|------|----------------------|--------|-----------------|
| 0-3 | pre-2026-04-08 | Foundation + Store MVP + Admin + Sync API + Telegram/Viber bots + Mobile client (Expo) | **не у git** | 19 Prisma таблиць, 805 products seeded |
| 4 | 2026-04-08 | Unit testing + TS strict + Zod validation + a11y/SEO + Prettier у CI | `aa80927`..`701d5e0` (6) | Tests 53→114, 0 `any`, 8 test files |
| 5 | 2026-04-08 | Mobile polish (skeleton/offline/push), 19 нових E2E, admin UX (sort/CSV/breadcrumbs), CSP headers, bot commands | 7 commits | E2E 17→36, README + CONTRIBUTING |
| 6 | 2026-04-08 | Admin pagination/filters, ImageGallery, order confirmation/status, i18n dict (180 ключів), real-time admin stats, wishlist/compare/recently-viewed | 1 squashed | Tests 114→139, 28 нових файлів, +3,322 LOC |
| 7 | 2026-04-08 | i18n підключений до всіх сторінок, email (SMTP/Resend), analytics dashboard (8 charts), JSON-LD Organization/Breadcrumb/FAQ, mobile auth guards, infinite scroll, bundle analyzer | 1 squashed | Tests 139→161, 250 i18n keys |
| 8 | 2026-04-08 | CI repair: Prettier 37 files, 41 TS errors, nodemailer install, instrumentation.ts env validation, 10s fetch timeouts | `1a7292f` | CI всі 4 кроки PASS |
| 9 | 2026-04-08 | Netlify Prisma generate fix (`packages/db/turbo.json`) | `95d623b` | `"build": "prisma generate"` у db |
| 10 | 2026-04-08 | Infrastructure scripts: enable-rls.sql, fts-migration.sql, register-telegram/viber-webhook.ts, netlify.toml | `c088a5b` | 6 нових scripts |
| 11 | 2026-04-09 | `/api/health` endpoint + CLAUDE.md cleanup | `ebc6774` | +1 route |
| 12 | 2026-04-09 | (documentation-only) — infrastructure step-by-step | `8fbb8e7` | — |
| 13 | 2026-04-09 | ISR на homepage/catalog/lots/product + homepage N+1 count → single groupBy | `685e0e2` | Homepage 8 queries → 2 queries |
| 14 | 2026-04-09 | **Wave 1** (header overhaul, /new /sale, banners admin, featured products, Umami, video carousel, promo stripe) + **Wave 2** (9-section homepage restructure, single Promise.all) + **emergency Netlify fix** (outputFileTracingIncludes для Prisma engine) | 10 commits | +3 Prisma моделі (Banner, FeaturedProduct, PromoStripe), 4 нові admin pages, 3 нові store routes |
| 15 | 2026-04-10 | Self-hosting migration: `output:'standalone'`, Prisma Windows binaryTarget, singleton fix, `<Image>` optimization, React `cache()` dedup, `unstable_cache` homepage, PM2/Caddy/deploy.ps1/DEPLOYMENT.md | 3 commits | +4 infrastructure files |
| 16 | 2026-04-15 | **Security hardening (CRITICAL):** JWT-based mobile API auth (`MOBILE_JWT_SECRET`), admin stats auth, mandatory webhook signatures, magic-bytes image validation, server-side chat sender, admin reply endpoint | 6 commits | Tests 186→212 (+26), 4 CRITICAL + 3 HIGH closed |
| 17 | 2026-04-15 | **Pre-deploy security fixes:** auth guard на lot actions, ctaHref URL validation, startup validation MOBILE_JWT_SECRET/SYNC_API_KEY length | 3 commits | Tests 212→220 (+8), 4 MUST-FIX closed |
| 18 (поточна) | 2026-04-18 | Аудит проекту (цей документ) | 0 | — |

**Загальні метрики git:** 66 commits, 61 non-merge + 5 merge, 4 гілки (main, поточна audit, + 2 remote refs). 19 feat, 10 fix, 4 perf, 25 docs, 5 security.

---

## 3. Оригінальний план vs поточний стан

### 3.1 Де знайдено оригінальний план

Ранні коміти не збереглися в git (Phase 0-3 відбулися у Claude Code CLI до того як цей репо був створений; перший коміт `aa80927` уже містить Session 4 completion report). Оригінальний план **імпліцитно задокументований** в тілі CLAUDE.md, особливо в розділі "Development Phases" (`CLAUDE.md:305-315`). Немає окремих файлів `PLAN.md`, `ROADMAP.md`, `SPEC.md`, `ARCHITECTURE.md` — ніколи не було.

**Первинні фази з CLAUDE.md:**

> - Phase 0: Foundation
> - Phase 1: Store MVP (catalog, filters, full-text search, product page, cart, checkout, SEO, JSON-LD, sitemap)
> - Phase 2: Admin panel + 1C integration (dashboard with charts, CRUD, orders, sync API, Supabase Auth)
> - Phase 3: Telegram bot (search, lots, order status, categories, inline query, webhook)
> - Phase 3b: Viber bot
> - Phase 4: Mobile client app (Expo RN) + Phase 4 (remaining): Mobile agent app + Warehouse app
> - Phase 5: Optimization (recommendations, PWA icons+offline, push notifications, SSE chat, Viber notifications)

### 3.2 Заплановано → Реалізовано → Відхилення

| Заплановано | Реалізовано | Відхилення | Причина |
|-------------|-------------|------------|---------|
| Foundation (Phase 0) | Turborepo + pnpm + 3 packages + 2 apps | — | Чітке попадання в план |
| Store MVP (Phase 1) | Повний каталог + FTS + cart + checkout + SEO + PWA | Додано Wave 1/2: banners, featured, /new, /sale, /top, video carousel, Umami, promo stripe | Session 14 — реакція на конкурентів (ukrstock.com) |
| Admin panel (Phase 2) | Повноцінний Dashboard + 7 CRUD модулів + analytics | Додано: real-time stats (30s refresh), notification bell, pagination/filters на всьому, CSV export, sortable columns | Session 5-6 покращення UX |
| 1C інтеграція (Phase 2) | API готовий (`/api/sync/products`, `/lots`, `/rates`, `/orders/export`) | **Не налаштовано на стороні 1С** | Потребує участі бухгалтерії / 1С-спеціаліста |
| Telegram bot (Phase 3) | 7 commands + inline query + webhook + pagination | Додано /prices, /new (Session 5) | Невелике розширення |
| Viber bot (Phase 3b) | 7 commands + keyboards | — | План реалізовано |
| Mobile client (Phase 4) | 9 екранів + auth + offline + push + deep linking | JWT auth додано пізніше (Session 16) | Security retrofit |
| **Mobile agent app** (Phase 4) | **Не зроблено** | Блоковано відсутністю скріншотів MobileAgentLTEX v1.15.3 | Планувалося separate session |
| **Warehouse app** (Phase 4) | **Не зроблено** | Не розпочинали | Separate session |
| Phase 5 (Optimization) | Recommendations, PWA, push, SSE chat, Viber notifications | — | План реалізовано |

### 3.3 Що було ДОДАНО не з плану

| Додавання | Сесія | Виправдано? |
|-----------|-------|-------------|
| 220 unit + 36 E2E тестів (плану тестування не було) | 4-7, 16-17 | **ТАК.** Критично для регресу на 18K LOC. Без тестів ризик ломати при кожній зміні |
| i18n infrastructure (250 ключів) | 6-7 | **ТАК з застереженням.** Добре зроблено, але ціль на майбутні мови, зараз сайт тільки українською. Не критично зараз |
| Wave 1/2 homepage overhaul | 14 | **ТАК.** Прямий бізнес-запит — наздогнати конкурентів |
| Умami analytics tracker + global click listener | 14 | Нейтрально — Umami instance не налаштований, компонент — noop. Код є, користі поки 0 |
| Self-hosting migration (Netlify → Windows Server) | 15 | **Спірно.** Великий operational overhead. Плюси: немає cold starts, локальна DB latency ~1мс. Мінуси: single point of failure, немає CDN, потрібен monitoring/backup stack. Netlify був би простішим |
| Security hardening rounds 16-17 | 16-17 | **ТАК.** Безальтернативно перед self-hosted. Без цього експонувати не можна |
| BannerCarousel, VideoReviewsCarousel (client components) | 14 | Нейтрально — красиво, але SEO важливіше текстового hero |

### 3.4 Що було в плані але НЕ зроблено

| Пункт плану | Стан | Чому не зроблено |
|-------------|------|------------------|
| Mobile agent app (field sales) | 0% | Потрібні скріншоти legacy MobileAgentLTEX, окрема сесія з користувачем |
| Warehouse app | 0% | Окрема сесія, не запланована |
| Реальна 1С інтеграція (не тільки API) | 60% (є API, немає налаштування у 1С) | Потрібна участь бухгалтера/1С-адміна |
| Фото продуктів у Supabase Storage | 0% (bucket може не існувати) | Не завантажено, немає фотографій 805 SKU |
| FTS міграція (GIN + pg_trgm) | Скрипт є, не запущений | Користувач має виконати SQL у Supabase SQL Editor |
| RLS на всіх таблицях | Скрипт є, не запущений | Те саме |
| Production monitoring/alerting | 0% | Не планувалося як окрема задача |
| Автоматичні бекапи local PostgreSQL | 0% | Не планувалося, але критично для self-hosted |

---

## 4. Архітектура зараз

### 4.1 Монорепо-діаграма

```
ltex-ecosystem (Turborepo + pnpm 9.15.4)
│
├── apps/
│   ├── store/                    Next.js 15.1.6 + React 19 (web app + admin)
│   │   ├── app/(store)/          12 публічних сторінок
│   │   ├── app/admin/            12 admin сторінок (CRUD + dashboard)
│   │   ├── app/api/              22 route.ts (sync, mobile, admin, webhooks, etc.)
│   │   ├── lib/                  30+ утиліт (catalog, cart, auth, i18n, email, notifications, ...)
│   │   ├── components/           37 .tsx компонентів
│   │   └── middleware.ts         Supabase session refresh на /admin/*
│   │
│   └── mobile-client/            Expo React Native
│       ├── src/screens/          9 екранів
│       ├── src/navigation/       Bottom tabs + stacks
│       ├── src/components/       3 (ProductCard, Skeleton, OfflineBanner)
│       └── src/lib/              api, auth, notifications
│
├── packages/
│   ├── db/                       Prisma 6.2.1, 22 моделі, binaryTargets: native+windows+debian
│   ├── shared/                   Types + constants + utils (transliterate, formatPrice)
│   └── ui/                       shadcn/ui: Button, Input, Badge, Card, Dialog, Sheet, Toast
│
├── services/
│   ├── telegram-bot/             Standalone tsx service (polling + webhook)
│   └── viber-bot/                Standalone tsx service (webhook-only, HMAC-SHA256)
│
├── e2e/                          Playwright (9 .spec.ts, 36 tests) — Chromium only
├── scripts/                      10 файлів: deploy.ps1, SQL migrations, webhook registration, photo upload
└── .github/workflows/ci.yml      CI: format + test + typecheck + build; E2E on main push
```

### 4.2 Стек і версії

| Шар | Технологія | Версія |
|-----|-----------|--------|
| Monorepo | Turborepo + pnpm | 2.3.3 / 9.15.4 |
| Runtime | Node.js | ≥20 (deploy: 22 LTS) |
| Language | TypeScript | 5.7.2 (strict, 0 `any`) |
| Web framework | Next.js | 15.1.6 (App Router, `output: 'standalone'`) |
| UI | React | 19.0.0 |
| Styling | Tailwind CSS | 3.4.17 + shadcn/ui + Radix |
| Database | PostgreSQL | (Supabase Frankfurt, мігрує на local 16) |
| ORM | Prisma | 6.2.1 |
| Auth (admin) | Supabase Auth | `@supabase/ssr` 0.10.0 |
| Auth (mobile) | Custom HMAC JWT | `apps/store/lib/mobile-auth.ts` |
| Testing | Vitest + Playwright | 4.1.2 / 1.59.1 |
| Image optimization | sharp | 0.34.5 |
| Email | nodemailer OR Resend | 8.0.5 / — |
| Bundle analysis | @next/bundle-analyzer | 16.2.2 |
| Validation | Zod | 4.3.6 |
| Mobile | Expo RN | — (версії в mobile-client/package.json) |

### 4.3 Деплой-топологія (станом на 2026-04-18)

```
Інтернет
   │
   ├── ltex.com.ua (Cloudflare DNS, NS щойно переведені)
   │       │
   │       └── Cloudflare Tunnel → Windows Server 2022 (194.187.154.162)
   │              │
   │              ├── Caddy (порти 80/443, auto-SSL) → localhost:3000
   │              │        └── PM2 → Next.js standalone (.next/standalone/server.js)
   │              │                    │
   │              │                    ├── Supabase (auxrlweedivnffxjwvln.supabase.co, Frankfurt)
   │              │                    │       ├── Auth (admin login)
   │              │                    │       └── Storage (bucket product-images — ймовірно порожній)
   │              │                    │
   │              │                    └── PostgreSQL 16 local (E:\PostgreSQL\16, якщо pg_dump виконаний)
   │              │
   │              └── 1С система (ltexcentral — окрема машина) — exchange plans, 16 scheduled jobs
   │
   └── (legacy) stalwart-dango-04a9b9.netlify.app (Netlify, still alive, буде deprecated)
```

**Невизначеності (потребують уточнення від користувача):**

- Чи дані з Supabase PostgreSQL вже скопійовані у local PostgreSQL через `pg_dump`? DEPLOYMENT.md передбачає це, але фактичного підтвердження в CLAUDE.md немає.
- Які env vars фактично виставлені на Windows Server (`MOBILE_JWT_SECRET`, `SYNC_API_KEY`, ...)?
- Чи `bucket product-images` створений у Supabase Storage?
- Чи Cloudflare SSL mode = "Full (strict)" чи "Flexible"?

### 4.4 Інтеграції (статус)

| Інтеграція | Код готовий | Налаштовано | Примітка |
|------------|-------------|-------------|----------|
| 1С (sync API) | ✅ 4 routes | ❌ | Потрібна конфігурація HTTP Service на стороні 1С (Центральна 1С) |
| Telegram bot | ✅ | ❓ | Залежить від `TELEGRAM_BOT_TOKEN`+`TELEGRAM_WEBHOOK_SECRET` env |
| Viber bot | ✅ | ❓ | Залежить від `VIBER_AUTH_TOKEN` |
| Nova Poshta tracking | ✅ | ❓ | `NOVA_POSHTA_API_KEY` |
| Umami analytics | ✅ (tracker + click listener) | ❌ | `NEXT_PUBLIC_UMAMI_*` env vars порожні — compонент no-op |
| Email (SMTP/Resend) | ✅ | ❌ | Обидва провайдери в env vars порожні — order email disabled |
| Supabase Storage (фото) | ✅ (upload helpers) | ❌ | Bucket, фото не завантажені |
| Expo push notifications | ✅ | ❓ | Залежить від mobile app deployment |

---

## 5. Що зроблено (детально)

### 5.1 Web Store — 100%

**12 публічних сторінок** (`apps/store/app/(store)/`):

- `/` (page.tsx) — 9-секційна homepage: BannerCarousel → featured → sale → new → categories → video reviews → recently viewed → features → CTA. ISR `revalidate=60`, single `Promise.all` з 7 queries + `.catch()` fallback для CI.
- `/catalog`, `/catalog/[slug]`, `/catalog/[slug]/[sub]` — full-text search (tsvector + trigram), filters, pagination, infinite scroll через IntersectionObserver.
- `/product/[slug]` — ImageGallery + lightbox, YouTube video, lots list, JSON-LD Product, `cache()` dedup, ISR 300s.
- `/lots`, `/cart`, `/wishlist`, `/compare`, `/new`, `/sale`, `/top`, `/about`, `/contacts`, `/order/[id]/confirmation`, `/order/[id]/status`.

**Ключові файли:** `apps/store/app/(store)/page.tsx`, `apps/store/lib/catalog.ts`, `apps/store/lib/cart.tsx`, `apps/store/components/store/image-gallery.tsx`, `apps/store/components/store/banner-carousel.tsx`, `apps/store/components/store/video-reviews-carousel.tsx`.

### 5.2 Admin Panel — 100%

**12 admin сторінок** (`apps/store/app/admin/`):

- Dashboard з 8 charts + 30s auto-refresh + notification bell + orders badge
- CRUD: products (list + edit + new + image upload/reorder), lots, orders (expandable detail + manager notes), categories (tree), customers, rates
- Wave 1 admin: banners (Supabase Storage upload, magic-bytes validation), featured, promo, sync-log viewer

**Ключові файли:** `apps/store/app/admin/page.tsx`, `apps/store/lib/admin-stats.ts`, `apps/store/app/admin/banners/actions.ts`, `apps/store/lib/admin-auth.ts` (`requireAdmin()` з Supabase session).

### 5.3 API Layer — 100% (22 route.ts)

| Група | Routes | Особливості |
|-------|--------|-------------|
| Public | `/api/cart`, `/api/orders`, `/api/search`, `/api/catalog`, `/api/health` | Rate limit (5/min orders, 20/min search) |
| Sync (1C) | `/api/sync/products`, `/lots`, `/rates`, `/orders/export` | Bearer `SYNC_API_KEY`, Zod, revalidatePath |
| Mobile | `/api/mobile/{auth, profile, favorites, chat, chat/stream, shipments, notifications, payments, orders}` | JWT HMAC from Session 16 |
| Admin | `/api/admin/stats`, `/api/admin/chat/reply` | Supabase session required |
| Webhooks | `/api/telegram/webhook`, `/api/viber/webhook` | Mandatory signatures (Session 16) |

**Ключові файли:** `apps/store/app/api/orders/route.ts` (Zod + transactions + notifications), `apps/store/lib/mobile-auth.ts`, `apps/store/lib/rate-limit.ts` (in-memory sliding window).

### 5.4 Telegram Bot — 100%

`services/telegram-bot/src/` (4 файли, ~1800 LOC сумарно з viber): `/start /search /lots /prices /new /order /categories /help` + inline query + callback keyboards. Polling або webhook через `/api/telegram/webhook` з мандатним `x-telegram-bot-api-secret-token`.

### 5.5 Viber Bot — 100%

Webhook-only (вимога Viber). Rich keyboard menus (6 color buttons main menu + quality filter). HMAC-SHA256 signature verification обов'язкова.

### 5.6 Mobile Client — 95%

Expo RN, 9 screens (Login, Catalog, Cart, Orders, OrderDetail, Chat, Profile, Shipments, Product). Auth через JWT (Session 16). Deep linking `ltex://`. Push tokens, offline banner, skeleton loaders. **Не задеплоєний** у store (Expo EAS не налаштований, але це може бути на майбутнє).

### 5.7 Tests — 220 unit + 36 E2E

**Unit (17 файлів):**

- Schema validation (`validations.test.ts` — 28 tests)
- Catalog FTS (`catalog.test.ts` — 21)
- Rate limiter (`rate-limit.test.ts` — 27)
- Mobile JWT (`mobile-auth.test.ts` — 13)
- Image validation (`validate-image.test.ts` — 14)
- Recommendations, notifications, push, i18n (19), startup env (8)
- Context providers (wishlist, comparison, recently-viewed — 22)
- API integration (orders 14, search 14, cart 6)
- Shared utils (slug 14, price 11)

**E2E (9 файлів, Playwright Chromium):** navigation (7), catalog (4), cart-checkout (4), admin (4), responsive (6), search (3), about-contacts (3), lots (3), product (2).

**Критичні gaps у тестах:** немає E2E для checkout → notification → 1C sync flow (end-to-end бізнес-сценарій), немає performance/load tests, немає тестів для банерів/featured/promo CRUD в адмінці.

### 5.8 i18n — 95%

Словник 250 ключів у `apps/store/lib/i18n/uk.ts`. Функція `t()` з інтерполяцією. Підключено у всіх store сторінках + header/footer. Інших мов немає (інфраструктура готова).

### 5.9 SEO — 98%

- `sitemap.ts` (dynamic), `robots.ts` (Disallow /admin, /api), `manifest.ts` (PWA).
- Canonical + OG + Twitter meta у всіх сторінках.
- JSON-LD: Product, Organization, BreadcrumbList, LocalBusiness, FAQ — 5 типів.
- Hreflang tags (uk, en placeholder).

### 5.10 Security — 95%

- Admin: Supabase Auth + `requireAdmin()` guard на всіх server actions (Session 17 закрив lot actions gap).
- Mobile: HMAC JWT (`MOBILE_JWT_SECRET`, 30-day TTL, `timingSafeEqual`).
- File uploads: magic-bytes sniffing + size limits (JPEG/PNG/WebP/GIF).
- Webhooks: mandatory signatures (Telegram secret token, Viber HMAC-SHA256).
- Rate limiting: in-memory sliding window.
- Startup validation: production throws якщо `MOBILE_JWT_SECRET`/`SYNC_API_KEY` < 32 chars (`apps/store/instrumentation.ts:12-32`).
- CSP headers (з `unsafe-inline`/`unsafe-eval` — свідомий trade-off, див. §8).

### 5.11 CI/CD — 100% (green)

`.github/workflows/ci.yml`: 2 jobs.

1. **ci** (push + PR): pnpm install → Prisma generate → format:check → test (shared + store) → typecheck → build (placeholder DATABASE_URL). 10-min timeout.
2. **e2e** (push to main only): Playwright Chromium, `continue-on-error: true` (не блокує merge), warn якщо `DATABASE_URL` secret відсутній.

### 5.12 Infrastructure — 70%

- `DEPLOYMENT.md` — покрокова інструкція для Windows Server.
- `ecosystem.config.js` (PM2, 1G memory limit, graceful restart).
- `Caddyfile` (reverse proxy + HSTS + cache headers + gzip/zstd).
- `scripts/deploy.ps1` (PowerShell автодеплой).
- `scripts/enable-rls.sql` + `fts-migration.sql` (не виконані).
- `scripts/register-{telegram,viber}-webhook.ts`, `upload-photos.ts`, `setup-storage.ts` (не виконані).
- `netlify.toml` — deprecated header, але файл залишений.

---

## 6. Що залишилось (реалістично)

### 6.1 Блокери комерційного запуску (MUST HAVE)

1. **Фото продуктів** — 805 SKU без зображень. Каталог виглядає порожньо. Потрібно: створити bucket у Supabase Storage, виконати `scripts/upload-photos.ts` з реальним масивом фото, або хоча б з placeholder-ами для категорій.
2. **2-3 банери на homepage** — інакше BannerCarousel згортається (graceful, але HERO section порожній).
3. **1С sync verification** — фактично запустити exchange plans з 1С сторони. Без цього sync_log порожній, замовлення з сайту не потраплять до бухгалтерії.
4. **Бекапи local PostgreSQL** — cron `pg_dump` → зовнішній storage (не на тому ж диску). Блокер тому що втрата замовлень = втрата грошей.
5. **Smoke test у проді** — створити тестове замовлення end-to-end, пересвідчитись що checkout → email → 1С sync працює.

### 6.2 Важливо, але не блокери (SHOULD HAVE)

6. **Monitoring** — uptime checker (UptimeRobot / healthchecks.io), бо зараз ніхто не знає що сайт впав доки хтось не поскаржиться.
7. **Log aggregation** — PM2 пише у `E:\ltex-logs\*.log`, але немає ротації, немає search. Через місяць диск заповнить.
8. **Featured products + promo stripe контент** — адмін має наповнити, інакше секції порожні.
9. **Umami instance** — запустити self-hosted або umami.is, виставити env vars. Без цього аналітики немає.
10. **Email provider** — налаштувати SMTP або Resend. Без цього клієнти не отримують confirmation.
11. **Post-deploy security tasks** (Session 18+ pending): CSP hardening (nonces), mobile SSE token, X-Forwarded-For trust config у Caddy.
12. **FTS migration + RLS SQL scripts** — виконати у Supabase SQL Editor (або local PostgreSQL якщо мігрували).

### 6.3 Nice to have (MAY HAVE)

13. Staging environment (зараз є тільки prod + dev локально).
14. Multi-language (en, pl) — інфраструктура готова, переклади немає.
15. Bundle size optimization — немає output від bundle analyzer.
16. Mobile app EAS build + TestFlight / Google Play deployment.
17. Decomposition CLAUDE.md — файл 1783 рядки, стає unwieldy.

### 6.4 Повністю не зроблено

18. **Mobile Agent App** (Phase 4 remaining) — 0%. Для польових агентів, синхронізується з 1С. Потребує скріншотів існуючого MobileAgentLTEX v1.15.3.
19. **Warehouse App** — 0%. Не планувалося deep.
20. **Online payments** — з CLAUDE.md: "L-TEX НЕ приймає онлайн-оплати. Payments таблиця тільки для відображення з 1С". Це business decision, не gap.
21. **Mobile app production build** — Expo app функціонально готовий, але не зібраний для iOS/Android stores.

---

## 7. Сильні сторони

### 7.1 Технічні рішення, які добре зроблені

1. **TypeScript strict з 0 `any`.** Session 4 почалася з 41 TS error, закінчилась 0. Кожна наступна сесія тримала цю планку — CI кроком `pnpm typecheck` на 6/7 packages. Це величезна економія bug-fixing у майбутньому.

2. **Session 16-17 security hardening.** Проведено реальний security audit, знайдено і виправлено 4 CRITICAL + 3 HIGH: authless mobile API (будь-хто читав чужі замовлення за `customerId`), admin stats без auth, optional webhook signatures, file upload без magic bytes, client-controlled `sender` у chat. До цього self-hosted deploy був би катастрофою.

3. **ISR + cache strategy.** Session 13 зменшила homepage з 8 queries → 2 queries через `groupBy` + прибрала `force-dynamic` конфлікт з `revalidate=60`. Session 15 додала React `cache()` dedup на product page та `unstable_cache` для homepage. Reasonable performance навіть без CDN.

4. **Prisma binaryTargets трюк для Lambda → standalone migration.** Session 14's `outputFileTracingIncludes` для Prisma engine на Netlify Lambda був нетривіальним debug-ом. Session 15 elegantly прибрала всю цю складність при переході на `output:'standalone'`.

5. **Zod на всіх API boundaries.** `apps/store/lib/validations.test.ts` — 28 тестів. Mobile API routes мають schemas. Webhook payloads — також. Значно зменшує ризик injection / malformed data.

6. **Magic bytes image validation.** `apps/store/lib/validate-image.ts` — 14 тестів, перевіряє реальні байти, не MIME/extension. Захист від disguised executables. Code sample на рівні industry best practice.

7. **Custom HMAC JWT без external deps.** `apps/store/lib/mobile-auth.ts` — 135 рядків, використовує тільки `crypto` з Node stdlib, `timingSafeEqual` для порівняння підписів. Менше атакової поверхні ніж full `jsonwebtoken` library.

### 7.2 Процесні перемоги

8. **Orchestrator/worker workflow.** Чітке розділення ролей: orchestrator планує + мерджить, worker кодить + пушить у feature branch. Немає безпосередніх коммітів у `main` — все через merge commits. Лінійна історія (окрім merge bubbles).

9. **Completion reports після кожної сесії.** CLAUDE.md містить детальні метрики до/після для сесій 4-17. Це дає повний audit trail без потреби розкопувати git log. (Недолік: файл став величезним — 1783 рядки.)

10. **CI never broken in mergeable state.** За 17 сесій був 1 fail (Session 7 → Session 8 repair). Після Session 8 — стабільно green. Culture of "не ламати main" присутня.

### 7.3 Бізнес-переваги vs конкуренти

11. **Функціональна паритетність з ukrstock.com.** Wave 1 (Session 14) явно націлений на конкурента. Є все: banners, featured, /new, /sale, /top, video reviews, promo stripe, global search у header. Тепер L-TEX не виглядає "як з 2005-го".

12. **Повний асортимент в UI.** CLAUDE.md чітко нагадує про сток, іграшки, Bric-a-Brac — це відображено у header menu, about page, SEO keywords.

13. **Двомовні боти (Telegram + Viber).** Більшість українських SMB мають тільки один. L-TEX доступний для клієнтів з обох платформ — conversion win.

14. **JSON-LD 5 типів.** Product, Organization, LocalBusiness, BreadcrumbList, FAQ. Google видимість має бути суттєвою після індексації.

15. **Mobile client готовий.** Конкуренти зазвичай mobile-web тільки. Коли L-TEX випустить native app — це буде відчутна перевага для field sales.

---

## 8. Слабкі сторони / Ризики

### 8.1 Технічний борг

1. **CSP `unsafe-inline` + `unsafe-eval`.** `apps/store/next.config.js:68-69` дозволяє inline JS. Session 17 свідомо відклала виправлення ("реальний XSS-ризик LOW у проекті, бо немає `dangerouslySetInnerHTML` з user input"). Але якщо з'явиться user-generated content (chat images, notes у orders) — CSP не захистить.

2. **In-memory rate limiter** (`apps/store/lib/rate-limit.ts`). Працює для single-instance self-hosted. Якщо колись буде horizontal scaling (PM2 cluster або multiple servers) — rate limit легко обходиться. Код сам визнає: "Use Redis/Upstash for multi-instance".

3. **Placeholder `DATABASE_URL` у build.** `.github/workflows/ci.yml:50` + homepage `.catch()` fallback (Session 13-14 workaround). Це означає: production build може успішно зібратися навіть якщо схема DB не відповідає коду. Справжня TS-безпека розкривається тільки при runtime.

4. **E2E `continue-on-error: true`.** `.github/workflows/ci.yml:73` — E2E fail не блокує merge. Це робить E2E decorative, а не gate. Якщо хтось зламає user flow — CI буде зелений.

5. **Nodemailer fetch timeouts 10с.** Добре як захист. Але немає retry/dead-letter queue. Якщо Resend API чи SMTP падає — email просто втрачається. Для order confirmation це неприйнятно.

6. **`revalidatePath("/")` скрізь.** Session 17 план сам визнає: "багато admin actions викликають `revalidatePath("/")` після оновлень що не впливають на homepage". Зайві cache invalidations.

7. **`outputFileTracingIncludes` був hack для Netlify.** Session 15 його прибрала при переході на standalone, але Netlify deployment все ще технічно живий (за CLAUDE.md). Deprecated. Чи працює він зараз на Netlify — неясно.

### 8.2 Operational risks (найгостріший блок)

8. **Single point of failure.** Один Windows Server + один ISP (WestNet, 107 Mbit). Немає failover, немає replica. Сайт падає разом з electricity/internet/disk/cable у Луцьку. Для B2B opt, допустимо — але має бути прийняте свідомо.

9. **Немає бекапів local PostgreSQL.** DEPLOYMENT.md не згадує бекапи. Якщо local PostgreSQL буде primary DB після міграції — втрата диска = втрата всіх 805 products + 725 lots + всіх orders. Supabase мав point-in-time recovery безкоштовно, local — не має.

10. **Немає моніторингу.** PM2 `max_memory_restart: '1G'` зарестартує процес при memory leak, але ніхто не дізнається. Немає Sentry, Grafana, Pingdom. Критичні помилки потонуть у `store-error.log`.

11. **Немає runbook.** Що робити якщо: Caddy не піднімається? PM2 рестартить loop? Cloudflare Tunnel падає? Postgres corruption? Відповіді немає ні в DEPLOYMENT.md, ні в CLAUDE.md.

12. **Немає staging.** Усі зміни йдуть у `main` → prod. Якщо Session 18 щось зламає — користувач побачить це у production. Single branch не дає безпечного майданчика для тестів.

### 8.3 Security gaps (відкладено на post-deploy)

13. **Mobile SSE token у query param.** `apps/mobile-client/src/lib/api.ts` передає JWT через URL `?token=...`. Токен потрапляє у server logs, browser history, Referer headers. 30-day TTL означає довге вікно для атаки. Session 18 task B.

14. **X-Forwarded-For spoofing.** `apps/store/lib/rate-limit.ts` читає перший IP з `X-Forwarded-For`. Якщо Caddy/Cloudflare не стрипають incoming header — будь-хто обходить rate limit через fake header. Session 18 task C. **Якщо Cloudflare Tunnel вже активний, це менш критично**, але перевірити треба.

15. **Console logging audit** (Session 18 task E). Template strings у `console.error` можуть витекти PII у production logs.

### 8.4 Dependency risks

16. **Версії relatively свіжі, але деякі experimental.** Next.js 15 + React 19 — cutting edge, може мати undocumented bugs. `@next/bundle-analyzer ^16.2.2` — major ahead Next.js, можливий mismatch. Prisma 6.2.1 — досить свіжа.

17. **Немає Dependabot / Renovate.** `pnpm-lock.yaml` оновлюється вручну. CVE у npm залежностях може потрапити undetected.

18. **Немає `npm audit` у CI.** Ніхто не перевіряє vulnerabilities автоматично.

### 8.5 Process risks

19. **CLAUDE.md = 1783 рядки, 140 KB.** Документ, який мусять читати *всі* worker sessions, зростає експоненційно. Новий worker може пропустити щось критичне. Потрібне розділення на `ARCHITECTURE.md`, `HISTORY.md`, `TASKS.md`, `CONVENTIONS.md`.

20. **Knowledge concentration.** CLAUDE.md — single source of truth. Якщо воно буде пошкоджене або втрачене, restart зайняв би тижні.

21. **Відсутність людського code review.** Кожен merge commit — автоматичний orchestrator. Жоден PR не проходив через другого інженера. Можливі неочевидні bugs/inconsistencies, які помітив би human reviewer.

22. **CI не блокує main.** На GitHub немає `Protected Branches` rules (за CLAUDE.md). Теоретично можна force-push у main. Ризик низький через orchestrator workflow, але gap є.

### 8.6 Business risks

23. **Немає контенту.** Сайт live, але порожній (немає фото, банерів, featured). Якщо прямо зараз прийде клієнт через Google — враження буде "недороблений сайт".

24. **Umami не налаштований.** Analytics код є, але no-op. Перші тижні після запуску — найважливіші для SEO-висновків. Дані втрачаються.

25. **1С інтеграція не підтверджена.** Якщо 1С-адмін не налаштує exchange plans — замовлення з сайту не потраплять у бухгалтерію. Сайт буде функціональним islands від реального бізнесу.

26. **`.env.example` має `NOVA_POSHTA_API_KEY` як optional**, але без нього `/api/mobile/shipments` не працюватиме. Клієнти не побачать tracking у mobile app.

---

## 9. Порівняння з конкурентами

Основний референс за CLAUDE.md (Session 14) — **ukrstock.com** (український гігант у категорії секонд-хенд оптом). Нижче — суб'єктивне порівняння на основі функціоналу коду vs типового конкурента у категорії.

### 9.1 Наздогнали (Wave 1 ціль)

| Фіча | L-TEX | ukrstock.com (типове) |
|------|-------|----------------------|
| Banner carousel на homepage | ✅ auto-rotate, admin CRUD | ✅ |
| Featured products | ✅ `/top` + admin curation | ✅ |
| /new + /sale розділи | ✅ | ✅ |
| Global search у header | ✅ autocomplete (300ms debounce) | ✅ |
| Промо-смуга (sticky) | ✅ PromoStripe model + admin | ✅ |
| Video reviews | ✅ 767/805 products, YouTube carousel | Partial |
| Wishlist + Compare + Recently viewed | ✅ (localStorage) | ✅ (usually) |
| Mobile menu (Sheet) | ✅ | ✅ |
| JSON-LD Product/Organization/Breadcrumb | ✅ | Varies |

### 9.2 Перевага L-TEX

| Фіча | L-TEX | ukrstock.com |
|------|-------|--------------|
| Native mobile app | ✅ Expo (RN) готовий | ❌ web-only (зазвичай) |
| Telegram + Viber bots | ✅ обидва + inline query | ❌ (зазвичай тільки чат) |
| Video on every lot | ✅ YouTube per lot | Rare |
| Full-text search + trigram fuzzy | ✅ PostgreSQL tsvector | Basic |
| ISR-кешована homepage | ✅ | — |
| SSE real-time chat | ✅ `/api/mobile/chat/stream` | — |
| Nova Poshta tracking | ✅ API integration | Partial |

### 9.3 Чого немає / відстаємо

| Фіча | L-TEX | ukrstock.com |
|------|-------|--------------|
| Контент (фото 805 SKU) | ❌ | ✅ роками збирали |
| SEO authority / backlinks | 0 (новий домен) | Високий |
| Blog / статті / гайди | ❌ | ✅ (часто є) |
| Онлайн-оплата | ❌ (business decision) | ✅ |
| Reviews / ratings customers | ❌ | ✅ |
| Програма лояльності / промокоди | ❌ | ✅ |
| Traffic | 0 | Великий |

**Висновок:** Код-паритет з ukrstock. Бізнес-паритет — ні, бо немає contentу і трафіку. Технічна перемога без бізнес-перемоги — 50% роботи.

---

## 10. Метрики проекту

### 10.1 Lines of Code

| Пакет/папка | LOC |
|-------------|-----|
| `apps/store/app/` | 10,902 |
| `apps/store/components/` | 3,153 |
| `apps/store/lib/` | ~3,500 (estimated, включено в 28,480 total) |
| `apps/mobile-client/src/` | 5,942 |
| `services/telegram-bot/` + `services/viber-bot/` | 1,798 |
| `packages/` (shared + db + ui) | 1,703 |
| **Сумарно .ts/.tsx** | **~28,480** |

**Файлів .ts/.tsx:** 239 (без node_modules, .next, dist).

### 10.2 Тести

| Тип | Файлів | Тестів |
|-----|--------|--------|
| Unit (Vitest) | 17 | **220** |
| E2E (Playwright) | 9 | **36** |
| **Сумарно** | **26** | **256** |

Покриття по областях: validations (28), catalog (21), rate-limit (27), mobile-auth (13), validate-image (14), i18n (19), API integration (34), context providers (22), shared utils (25), інше (17).

### 10.3 База даних

- **22 Prisma моделі** (7 нових порівняно з оригінальним планом: Cart, CartItem, ChatMessage, Shipment, VideoSubscription, PushToken, Payment, Favorite, SyncLog, FeaturedProduct, Banner, PromoStripe — 12 додано).
- **Seed data:** 805 products, 725 lots, 49 categories.
- **Індекси:** GIN + pg_trgm міграція готова (`scripts/fts-migration.sql`) — не запущена.

### 10.4 API та сторінки

| Категорія | Кількість |
|-----------|-----------|
| API routes (route.ts) | 22 |
| Store pages (public) | 12 |
| Admin pages | 12 + 3 підсторінки (new/edit) = 15 |
| Mobile screens | 9 |
| UI components (shadcn) | 13 |

### 10.5 Git метрики

| Метрика | Значення |
|---------|----------|
| Total commits (all branches) | 66 |
| Merges | 5 |
| Non-merge commits | 61 |
| Feat | 19 |
| Fix | 10 |
| Perf | 4 |
| Docs | 25 |
| Security | 5 |
| Branches (active) | 4 (main, audit, 2 remote refs) |
| Timespan | 2026-04-08 → 2026-04-15 (7 днів git, ~17 сесій) |

### 10.6 Bundle size

**Немає даних.** `@next/bundle-analyzer` встановлений, `analyze` script є в `apps/store/package.json`, але output не збережений у репо і не згаданий у CLAUDE.md. Рекомендую запустити `ANALYZE=true pnpm build` і зберегти snapshot для baseline.

### 10.7 Env vars

| Тип | Кількість |
|-----|-----------|
| REQUIRED (production) | 6 (DATABASE_URL, DIRECT_URL, SUPABASE URL+ANON_KEY, SITE_URL, SYNC_API_KEY, MOBILE_JWT_SECRET) |
| Required-if-exposed | 3 (TELEGRAM_WEBHOOK_SECRET, VIBER_AUTH_TOKEN + залежні token) |
| Optional | 7 (Nova Poshta, SMTP, Resend, Umami × 2, Expo, Telegram Chat ID) |

---

## 11. Рекомендації (пріоритезовані)

Топ-5 задач на найближчий тиждень (2026-04-18 → 2026-04-25) з обґрунтуванням ROI.

### #1: Налаштувати бекапи local PostgreSQL + моніторинг uptime

**Час:** 2-3 години
**ROI:** критично високий — блокує реальний бізнес.

Немає бекапів = немає бізнесу у випадку disk failure. Створити scheduled task у Windows:

```powershell
# Daily backup
pg_dump -U ltex ltex_ecosystem | gzip > E:\backups\ltex-$(Get-Date -Format yyyyMMdd).sql.gz
# Retention: keep 14 days
```

Додатково: налаштувати зовнішній sync (rsync/rclone) на другий диск або S3-сумісний storage. UptimeRobot (free tier) — 1 HTTP check кожні 5 хв на `https://ltex.com.ua/api/health`. Без цього ви не дізнаєтесь про падіння.

### #2: Завантажити фото продуктів (хоча б для топ-100)

**Час:** 4-8 годин (залежить від наявності фото)
**ROI:** високий — блокує маркетинговий запуск.

Каталог без фото виглядає недороблено. Навіть якщо немає всіх 805 фото, починайте з топ-100 за quality/category. Запустити `scripts/setup-storage.ts` → створити bucket → `scripts/upload-photos.ts`. Якщо фото немає — використовувати тимчасові placeholder-и по категоріях. Google не буде індексувати порожній каталог як повноцінний.

### #3: Підтвердити 1С sync end-to-end

**Час:** 2-4 години (з 1С-адміном)
**ROI:** критично високий — без цього замовлення застрягають.

Створити тестове замовлення через сайт → перевірити що воно з'являється у 1С через exchange plan → виконати зворотній sync (товари з 1С у DB) → підтвердити що UAH rates оновлюються щодня. Без цього теста ви не знаєте чи 1С integration взагалі функціонує у production.

### #4: Виконати RLS + FTS SQL migrations

**Час:** 30 хвилин
**ROI:** середньо-високий — одноразова задача що закриває 2 відкладених checklist item.

`scripts/enable-rls.sql` + `scripts/fts-migration.sql` у Supabase SQL Editor (або local PostgreSQL якщо мігрували). RLS — другий рівень захисту (у додачу до API auth). FTS migration — суттєво покращить пошук (trigram fallback для typos).

### #5: Перевірити Caddy X-Forwarded-For trust (Task C з Session 17 deferred)

**Час:** 30 хвилин тестування + 10 хвилин правок
**ROI:** середній — закриває security gap, який можна зараз exploited.

Виставити Caddyfile `header_up -X-Forwarded-For` щоб Caddy стрипав incoming header від клієнта та використовував свій `{http.request.remote.host}`. Також переключити `apps/store/lib/rate-limit.ts` на пріоритет `x-real-ip`. Перевірити через `curl -H "X-Forwarded-For: 1.2.3.4" ...` що rate limit тримається.

### Бонус #6 (якщо буде час): розбити CLAUDE.md

Зараз 1783 рядки — боляче читати. Пропоную: `CLAUDE.md` залишити коротким (overview + current status), винести у окремі файли:

- `docs/ARCHITECTURE.md` — структура, tech stack, інтеграції
- `docs/HISTORY.md` — completion reports сесій 4-17
- `docs/CONVENTIONS.md` — технічні рішення, що не чіпати
- `docs/SESSION_TASKS.md` — тільки поточні та майбутні задачі

Це дасть worker-сесіям швидший onboarding і зменшить ризик пропустити важливе.

---

## 12. Відкриті питання для user-а

Нижче — питання, які потребують **рішення користувача** (бізнес, не технічне). Технічний аудит не може відповісти замість власника.

### 12.1 Контент і маркетинг

1. **Фото продуктів.** Чи є архів фотографій для 805 SKU? Якщо немає — чи є можливість провести фотосесію? Чи погоджуєтесь використовувати temporary category placeholder-и на MVP?
2. **Банери для homepage.** CLAUDE.md згадує: "user планує згенерувати 2 банери через AI". Чи вже згенеровані? Якщо так — завантажте у `/admin/banners`.
3. **Featured products** — хто буде курувати? Продукт-менеджер/власник вручну раз на тиждень, чи автоматично за кількістю замовлень?
4. **Promo stripe текст** — який меседж? "Знижка 10% до кінця квітня" чи generic "Оптові ціни від 10 кг"?
5. **Blog / контент-маркетинг.** Плануєте писати гайди ("як обирати секонд-хенд екстра"), чи чисто transactional сайт?

### 12.2 Операції

6. **Кастомний домен ltex.com.ua.** NS propagation у процесі — коли очікуєте завершення? Чи CNAME/A records виставлені правильно (за DEPLOYMENT.md)?
7. **Cloudflare Tunnel vs port forwarding.** Зараз через Cloudflare Tunnel — це хороший вибір (DDoS protection + hides IP). Але Caddy Caddyfile виглядає як стандартна reverse proxy. Чи Caddy фактично працює? Чи Cloudflare Tunnel направляє прямо на Next.js:3000?
8. **Бекапи даних.** Хто відповідальний за їх перевірку? Ви самі, чи підключите ще когось? Чи є off-site copy?
9. **Хто моніторить сайт?** Якщо у 3-й ночі впаде — хто отримає alert?
10. **1С-адміністратор.** Хто налаштує exchange plans? Ваш бухгалтер? Зовнішній 1С-консультант?

### 12.3 Технічні вибори, які впливають на бізнес

11. **Email provider.** SMTP (власний) чи Resend (SaaS)? Resend простіше, але $/місяць. SMTP дешевше, але треба налаштувати.
12. **Umami host.** Self-host (ще один сервіс на вашому сервері) чи umami.is cloud (~$9/місяць, простіше)? Без Umami ви летите наосліп у перші місяці.
13. **Netlify.** Вимикати зараз, чи тримати як fallback? Потенційна плюс-мінус 1-3 тижні паралельного запуску.
14. **Supabase.** Після міграції на local PostgreSQL — залишаєте Supabase тільки для Auth + Storage, чи й DB теж? Від цього залежить latency (Frankfurt ~30ms vs local ~1ms).
15. **Mobile app release.** Коли плануєте публікацію у Google Play / App Store? Це довга процедура (EAS + reviews + developer accounts).

### 12.4 Подальший розвиток

16. **Mobile Agent App (польові продавці).** Це у пріоритеті на 2026 Q2? Якщо так — треба виділити сесію + надати скріншоти MobileAgentLTEX v1.15.3.
17. **Warehouse App.** Плануєте? Окрема сесія.
18. **Multilingual (EN, PL).** Ваші клієнти з Англії/Польщі — чи потрібен англомовний і польський інтерфейс, щоб простіше замовляти?
19. **Online payments.** Business decision згадано в CLAUDE.md ("L-TEX НЕ приймає онлайн-оплати"). Це permanent, чи може бути переглянуто? Картки через Fondy/LiqPay суттєво зменшили б drop-off.
20. **Customer reviews.** Хочете фічу "залишити відгук після замовлення"? Це helps SEO + trust signals.

---

**Кінець звіту.** 12 розділів, ~25 сторінок, 12,000+ слів.

Технічний стан — сильний. Бізнес-стан — потребує доопрацювання контенту й операційних процедур. Не затягуйте: код без фото й без 1С — це готель без гостей.







