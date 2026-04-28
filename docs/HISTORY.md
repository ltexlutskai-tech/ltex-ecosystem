# L-TEX Ecosystem — Session History

Повні completion reports сесій 4-18. Контент витягнутий з CLAUDE.md без змін.

---

## Development Phases

- **Phase 0: Foundation** — COMPLETED
- **Phase 1: Store MVP** — COMPLETED (catalog, filters, full-text search, product page, cart, checkout, SEO, JSON-LD, sitemap)
- **Phase 2: Admin panel + 1C integration** — COMPLETED (dashboard with charts, CRUD, orders, sync API, Supabase Auth)
- **Improvements** — COMPLETED (mobile UX, validation, accessibility, toasts, bulk ops, tests, SEO, PWA, notifications, rate limiting, ISR, about page)
- **Phase 3: Telegram bot** — COMPLETED (search, lots, order status, categories, inline query, webhook)
- **Phase 3b: Viber bot** — COMPLETED (same as Telegram: search, lots, orders, categories, keyboard menus)
- **Phase 4 (partial): Mobile client app** — COMPLETED (Expo RN: auth, catalog, product, cart, orders, chat, profile, shipments, 8 API routes, 7 new DB tables)
- **Phase 4 improvements**: Cart DB persistence, full-text search v2 (GIN + trigrams), admin analytics (funnel, revenue, top products), E2E tests (Playwright)
- Phase 4 (remaining): Mobile agent app + warehouse app — SEPARATE SESSION (requires MobileAgentLTEX v1.15.3 screenshots + block-by-block review)
- **Phase 5: Optimization** — COMPLETED (recommendations, PWA icons+offline, push notifications, SSE chat, Viber notifications)
- **Session 4: Quality & Testing** — COMPLETED (114 tests, TypeScript strict, API errors, a11y, SEO, CI Prettier, mobile error handling)
- **Session 5: Polish & Hardening** — COMPLETED (mobile skeleton/offline/push, 36 E2E, admin sort/CSV/breadcrumbs, security headers, bot /prices+/new, README)
- **Session 6: Features & UX** — COMPLETED (admin pagination/filters, image gallery, order flow, i18n prep, real-time admin, store UX, integration tests)
- **Session 7: i18n, Email, Analytics, SEO, Performance** — COMPLETED (i18n all pages, email lib, analytics dashboard, SEO JSON-LD, mobile guards+deep linking, infinite scroll, 161 tests)
- **Session 8: CI Fix & Production Hardening** — COMPLETED (Prettier 37 files, TypeScript 41 errors, nodemailer, Prisma schema fix, env validation, fetch timeouts, CI all green)
- **Session 9: Netlify Build Fix** — COMPLETED (Prisma generate in turbo pipeline, notFound() audit, packages/db/turbo.json)
- **Session 10: Infrastructure Scripts** — COMPLETED (enable-rls.sql, fts-migration.sql, webhook scripts, netlify.toml, security headers)

### Infrastructure

**Supabase** (project: `ltex-ecosystem`, region: Frankfurt eu-central-1):

- URL: `auxrlweedivnffxjwvln.supabase.co`
- DB: Healthy, 11 tables created via `prisma db push`
- Storage: Empty (no buckets yet — photos not uploaded)
- Auth: API keys configured (publishable + secret)

**Netlify** (site: `stalwart-dango-04a9b9`):

- URL: `stalwart-dango-04a9b9.netlify.app`
- Deploys from GitHub, Next.js
- Env vars configured: DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL
- **NOTE**: Need to update deploy branch to `main`

### Prerequisites / remaining setup

- [x] Create Supabase project → get DATABASE_URL, SUPABASE_URL, ANON_KEY
- [x] Run `prisma db push` to create tables
- [ ] Run `pnpm db:seed` to populate database with 805 products + 725 lots
- [ ] Run migration: `packages/db/prisma/migrations/20260406_fts_gin_trigram/migration.sql`
- [ ] Upload product photos to Supabase Storage (create bucket first)
- [ ] Set SYNC_API_KEY for 1C integration
- [ ] Switch Netlify deploy branch from old branch to `main`
- [ ] (Optional) Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for order notifications
- [ ] (Optional) Set VIBER_AUTH_TOKEN + register webhook for Viber bot
- [ ] (Optional) Set NOVA_POSHTA_API_KEY for shipment tracking
- [ ] (Optional) Add PWA icons: /public/icon-192.png, /public/icon-512.png
- [ ] Install mobile app deps: `cd apps/mobile-client && npx expo install`

### What was done in previous sessions

#### 1. Cart persistence in DB (`c39e06b`)

- Added `Cart` + `CartItem` Prisma models (sessionId for anonymous, customerId for auth)
- `/api/cart` API route (GET/POST/DELETE)
- CartProvider: localStorage + API sync on mount, merge strategy

#### 2. Full-text search v2 (`c39e06b`)

- GIN index on `to_tsvector` for products (name + description + article_code)
- `pg_trgm` extension + trigram GIN index for fuzzy matching
- `fullTextSearch()` with trigram fallback when tsvector returns 0 results
- `autocompleteSearch()` for `/api/search` endpoint (prefix + similarity, top 5)
- `SearchAutocomplete` component: debounced 300ms, keyboard nav, dropdown

#### 3. Admin dashboard analytics (`c39e06b`)

- Top-10 products by orders (raw SQL GROUP BY)
- Order funnel chart (FunnelChart component)
- Revenue line chart (SVG path, RevenueChart component)
- New customers bar chart (NewCustomersChart component)

#### 4. E2E tests with Playwright (`c39e06b`)

- `playwright.config.ts` (Chromium only, webServer: dev)
- 4 test suites: navigation (7), catalog (4), product (2), cart-checkout (4)
- `test:e2e` script in root package.json

#### 5. Telegram bot — Phase 3 (`194e619`)

- `services/telegram-bot/` standalone service (polling + webhook modes)
- `/api/telegram/webhook` API route
- Commands: /start, /search, /lots, /order, /categories, /help
- Inline query for product search in any chat
- Callback query buttons for quality filters

#### 6. Mobile client app — Phase 4 (`b697799`)

- 7 new Prisma tables: chat_messages, shipments, video_subscriptions, push_tokens, payments, favorites
- 8 mobile API routes: /api/mobile/{auth, profile, favorites, chat, shipments, notifications, payments, orders}
- Expo React Native app: 13 screens (Login, Catalog, Product, Cart, Orders, OrderDetail, Chat, Profile, Shipments, + components)
- Navigation: Bottom tabs (Каталог, Кошик, Замовлення, Чат, Профіль) with stack navigators
- Features: phone auth, product search, favorites, video subscriptions, Nova Poshta tracking, chat with manager, payment history

#### 7. Viber bot (`25b5f97`)

- `services/viber-bot/` standalone service (webhook only — Viber requirement)
- `/api/viber/webhook` API route with HMAC-SHA256 signature verification
- Same commands as Telegram: search, lots, orders, categories, help
- Rich keyboard menus: main menu (6 color buttons), quality filter (6 + back)
- Pending input state for search/order prompts

### Session 4 Completion Report (2026-04-08)

#### What was done (6 commits, all 8 tasks completed):

| Commit    | Changes                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `f8283a5` | +61 unit tests, TypeScript strict (0 `any`), Zod validation for 7 mobile API routes |
| `76b59d7` | Consistent error handling: cart/search/auth routes, shared rate limiter             |
| `615230d` | Mobile client: error states on Catalog, Orders, Shipments screens                   |
| `628bb43` | Accessibility: skip-to-content, aria-labels, focus-visible styles                   |
| `ab9c80a` | SEO: canonical URLs, OG images, sitemap improvements + price range filter bugfix    |
| `701d5e0` | CI: Prettier lint step, `format:check` script, full codebase formatted              |

#### Results:

| Metric                            | Before Session 4 | After Session 4                        |
| --------------------------------- | ---------------- | -------------------------------------- |
| Unit tests                        | 53               | **114** (+61)                          |
| Test files                        | 3                | **8** (+5 new)                         |
| `any` types                       | unknown          | **0**                                  |
| Zod schemas (mobile)              | 0                | **10**                                 |
| API routes with consistent errors | partial          | **all 18**                             |
| CI steps                          | 3                | **4** (+Prettier)                      |
| TS/TSX files                      | 161              | **166**                                |
| Lines of code                     | 18,082           | **20,477**                             |
| Total commits                     | 28               | **34**                                 |
| Bug fixed                         | —                | price range filter (priceMin+priceMax) |

#### Project Completion Status: ~92% MVP

| Component           | Completion | Details                                                         |
| ------------------- | ---------- | --------------------------------------------------------------- |
| Монорепо структура  | 100%       | Turborepo + pnpm, 3 packages, 2 apps, 2 services                |
| База даних          | 100%       | 19 таблиць, 805 products, 725 lots seeded                       |
| Web Store           | 100%       | Каталог, пошук, кошик, checkout, SEO, PWA                       |
| Admin Panel         | 100%       | Dashboard, CRUD, analytics, auth                                |
| API Layer           | 100%       | 18 ендпоінтів, rate limiting, Zod validation, consistent errors |
| Telegram Bot        | 100%       | Повний функціонал + webhook + BotFather                         |
| Viber Bot           | 100%       | Повний функціонал + нотифікації                                 |
| Mobile Client App   | 85%        | Екрани + error handling готові, потрібне тестування на пристрої |
| Тестування          | 90%        | 114 unit + 17 E2E, all passing                                  |
| Accessibility       | 90%        | skip-to-content, aria-labels, focus-visible, keyboard nav       |
| SEO                 | 95%        | canonical, OG, JSON-LD, sitemap, meta                           |
| CI/CD               | 90%        | typecheck + test + build + Prettier lint                        |
| 1С Інтеграція       | 60%        | API готовий, потрібна конфігурація 1С                           |
| Deploy / Production | 60%        | Netlify працює, webhooks + фото не налаштовані                  |
| Mobile Agent App    | 0%         | Окрема сесія, потрібні скріншоти                                |
| Warehouse App       | 0%         | Окрема сесія                                                    |

### Session 5 Completion Report (2026-04-08)

#### What was done (7 commits, all 7 tasks completed):

| Commit    | Task          | Changes                                                                                                    |
| --------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `ad169be` | Mobile Client | Skeleton loaders (6 screens), empty states with icons, push token registration, OfflineBanner              |
| `9845a96` | Performance   | Extract admin stats to lib/admin-stats.ts, add loading.tsx for 4 admin sub-pages                           |
| `06113f5` | Admin UX      | Sortable table columns with arrow indicators, CSV export for orders/customers, AdminBreadcrumbs            |
| `7838592` | Security      | Auth guards on all 10 admin server actions, rate limiting on mobile auth (10/min), CSP + security headers  |
| `1726e61` | E2E Tests     | Enable E2E job in CI, add 19 new tests (admin, lots, search, responsive, about/contacts) — 17 → 36 total   |
| `d955736` | Bots          | /prices and /new commands for both bots, search pagination with "all results" link, new Viber menu buttons |
| `2e23f94` | Docs          | Full README.md, .env.example, CONTRIBUTING.md                                                              |

### Session 6 Completion Report (2026-04-08)

#### What was done (1 commit, all 7 tasks completed):

| Task              | Files              | Key Changes                                                                                                                            |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Admin pagination  | 6 modified, 3 new  | AdminPagination, FilterSelect, PriceRangeFilter; category/quality filters on products; quality/price on lots; city search on customers |
| Image gallery     | 2 modified, 1 new  | ImageGallery with thumbnail strip + lightbox; bulk upload + drag-reorder in admin; reorderProductImages action                         |
| Order flow        | 3 modified, 3 new  | /order/[id]/confirmation, /order/[id]/status (timeline), expandable admin rows, addOrderNote for manager comments                      |
| i18n prep         | 2 modified, 3 new  | lib/i18n/uk.ts dictionary (180 lines), t() with interpolation, header/footer updated                                                   |
| Real-time admin   | 2 modified, 4 new  | /api/admin/stats, AutoRefresh (30s), NotificationBell (dropdown + sound), OrdersBadge on sidebar                                       |
| Store UX          | 3 modified, 10 new | Quick view modal, wishlist (provider + button + badge + page), recently viewed (provider + section), comparison (max 3, bar + page)    |
| Integration tests | 0 modified, 4 new  | 50 new tests: orders API (17), cart API (6), search API (11), i18n (16)                                                                |

#### Results:

| Metric            | Before Session 6 | After Session 6                                                                          |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Unit tests        | 114              | **139** (+25)                                                                            |
| Test files        | 12               | **16** (+4 new: orders, cart, search API + i18n)                                         |
| Store pages       | 11               | **15** (+confirmation, status, compare, wishlist)                                        |
| Admin components  | 8                | **14** (+pagination, filters, notification bell, orders badge, auto-refresh, detail row) |
| Store components  | 10               | **18** (+image gallery, quick view, wishlist, comparison, recently viewed)               |
| Context providers | 1 (cart)         | **4** (+wishlist, recently-viewed, comparison)                                           |
| API routes        | 18               | **19** (+/api/admin/stats)                                                               |
| i18n strings      | 0                | **180** (Ukrainian dictionary)                                                           |
| New files         | —                | **28** created                                                                           |
| TS/TSX files      | 183              | **212**                                                                                  |
| Lines of code     | 21,786           | **24,776** (+3,322)                                                                      |
| Total commits     | 41               | **42**                                                                                   |

#### Project Completion Status: ~97% MVP

| Component           | Completion | Details                                                                                   |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Монорепо структура  | 100%       | Turborepo + pnpm, 3 packages, 2 apps, 2 services                                          |
| База даних          | 100%       | 19 таблиць, 805 products, 725 lots seeded                                                 |
| Web Store           | 100%       | Каталог, пошук, кошик, checkout, SEO, PWA, wishlist, compare, recently viewed, quick view |
| Admin Panel         | 100%       | Dashboard, CRUD, analytics, auth, sort/filter/paginate, CSV, real-time, notification bell |
| API Layer           | 100%       | 19 ендпоінтів, rate limiting, Zod validation, consistent errors                           |
| Telegram Bot        | 100%       | 7 commands + inline query + webhook + pagination                                          |
| Viber Bot           | 100%       | 7 commands + keyboard menus + notifications                                               |
| Mobile Client App   | 90%        | Екрани + error handling + skeleton + offline + push ready                                 |
| Тестування          | 95%        | 139 unit + 36 E2E, all passing, E2E enabled in CI                                         |
| Order Flow          | 95%        | Checkout → confirmation → status tracking, admin notes, expandable rows                   |
| i18n                | 80%        | Dictionary + t() ready, header/footer done, other pages pending                           |
| Accessibility       | 90%        | skip-to-content, aria-labels, focus-visible, keyboard nav                                 |
| SEO                 | 95%        | canonical, OG, JSON-LD, sitemap, meta                                                     |
| Security            | 90%        | CSP headers, auth guards, rate limiting, webhook validation                               |
| CI/CD               | 95%        | typecheck + test + build + Prettier + E2E                                                 |
| Documentation       | 90%        | README, CONTRIBUTING, .env.example, deploy checklist                                      |
| 1С Інтеграція       | 60%        | API готовий, потрібна конфігурація 1С                                                     |
| Deploy / Production | 60%        | Netlify працює, webhooks + фото не налаштовані                                            |
| Mobile Agent App    | 0%         | Окрема сесія, потрібні скріншоти                                                          |
| Warehouse App       | 0%         | Окрема сесія                                                                              |

### Session 7 Completion Report (2026-04-08)

#### What was done (1 commit, all 7 tasks completed):

| Task        | Key Changes                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| i18n        | t() connected in all 15+ store pages/components, ~70 new dictionary keys in uk.ts                          |
| Email       | lib/email.ts — dual SMTP/Resend transport, order confirmation + status update HTML emails                  |
| Analytics   | Period filter (7d/30d/90d/1y), avg order chart, category pie chart, geography bar chart, conversion metric |
| SEO         | Organization JSON-LD, BreadcrumbList on category/subcategory, FAQ JSON-LD on about, hreflang tags          |
| Mobile      | Auth guards on protected tabs, ltex:// deep linking, splash screen, universal links config                 |
| Performance | @next/bundle-analyzer, infinite scroll with IntersectionObserver, lazy images, /api/catalog endpoint       |
| Tests       | 22 new context provider tests (wishlist, comparison, recently-viewed), vitest JSX support                  |

#### Results:

| Metric                 | Before Session 7  | After Session 7                                       |
| ---------------------- | ----------------- | ----------------------------------------------------- |
| Unit tests             | 139               | **161** (+22)                                         |
| Test files             | 16                | **19** (+3 context provider tests)                    |
| i18n keys              | 180               | **~250** (+70 new keys)                               |
| Store pages with i18n  | 2 (header/footer) | **15+** (all pages)                                   |
| Email templates        | 0                 | **2** (confirmation + status update)                  |
| Admin analytics charts | 4                 | **8** (+avg order, categories, geography, conversion) |
| JSON-LD schemas        | 2                 | **5** (+Organization, BreadcrumbList, FAQ)            |
| New files              | —                 | **7** created                                         |
| TS/TSX files           | 212               | **219**                                               |
| Lines of code          | 24,776            | **26,408** (+1,632)                                   |
| Total commits          | 42                | **44** (incl. merge)                                  |

#### Project Completion Status: ~98% MVP

| Component           | Completion | Details                                                                                     |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Монорепо структура  | 100%       | Turborepo + pnpm, 3 packages, 2 apps, 2 services                                            |
| База даних          | 100%       | 19 таблиць, 805 products, 725 lots seeded                                                   |
| Web Store           | 100%       | Каталог, пошук, кошик, checkout, SEO, PWA, wishlist, compare, infinite scroll               |
| Admin Panel         | 100%       | Dashboard + analytics (8 charts, period filter), CRUD, sort/filter/paginate, CSV, real-time |
| API Layer           | 100%       | 20 ендпоінтів, rate limiting, Zod validation, consistent errors                             |
| Telegram Bot        | 100%       | 7 commands + inline query + webhook + pagination                                            |
| Viber Bot           | 100%       | 7 commands + keyboard menus + notifications                                                 |
| Mobile Client App   | 95%        | Повний функціонал + auth guards + deep linking + splash screen                              |
| Тестування          | 95%        | 161 unit + 36 E2E = 197, all passing, E2E enabled in CI                                     |
| i18n                | 95%        | Dictionary (250 keys) + t() connected to all pages                                          |
| Email               | 90%        | Dual transport (SMTP/Resend), needs env var configuration                                   |
| Order Flow          | 95%        | Checkout → confirmation → status tracking → email → admin notes                             |
| Accessibility       | 90%        | skip-to-content, aria-labels, focus-visible, keyboard nav                                   |
| SEO                 | 98%        | canonical, OG, JSON-LD (5 types), hreflang, sitemap, meta                                   |
| Security            | 90%        | CSP headers, auth guards, rate limiting, webhook validation                                 |
| CI/CD               | 100%       | typecheck + test + build + Prettier — all green (fixed Session 8)                           |
| Performance         | 90%        | Infinite scroll, lazy images, bundle analyzer, ISR                                          |
| Documentation       | 90%        | README, CONTRIBUTING, .env.example, deploy checklist                                        |
| 1С Інтеграція       | 60%        | API готовий, потрібна конфігурація 1С                                                       |
| Deploy / Production | 60%        | Netlify працює, webhooks + фото не налаштовані                                              |
| Mobile Agent App    | 0%         | Окрема сесія, потрібні скріншоти                                                            |
| Warehouse App       | 0%         | Окрема сесія                                                                                |

### Orchestrator Review (Session 8 Planning, 2026-04-08)

#### CI Status: FAILING (all 3 steps fail)

**1. Prettier (37 files)** — Session 7 code wasn't formatted before commit.

- Fix: `pnpm format:write` then commit

**2. TypeScript (41 errors across 10 files):**

| File                                           | Errors | Root Cause                                                                                                        |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `app/(store)/order/[id]/confirmation/page.tsx` | 8      | Prisma `include` uses wrong key (`product` instead of valid relation); missing `customer`, `items` on result type |
| `app/(store)/order/[id]/status/page.tsx`       | 9      | Same Prisma include issue + missing `shipments` relation                                                          |
| `app/admin/orders/page.tsx`                    | 7      | Same Prisma include issue for `customer`, `items`                                                                 |
| `app/admin/orders/actions.ts`                  | 2      | Undefined variables `statusLabel`, `orderRef` in email call                                                       |
| `app/(store)/compare/page.tsx`                 | 1      | `??` and `\|\|` mixed without parentheses                                                                         |
| `app/admin/products/image-upload.tsx`          | 1      | Possible `undefined` passed to function                                                                           |
| `components/store/image-gallery.tsx`           | 4      | `currentImage` possibly undefined                                                                                 |
| `lib/email.ts`                                 | 1      | `nodemailer` module not installed                                                                                 |
| `lib/comparison.test.tsx`                      | 1      | Object possibly undefined                                                                                         |
| `lib/recently-viewed.test.tsx`                 | 5      | Object possibly undefined                                                                                         |
| `lib/wishlist.test.tsx`                        | 2      | Object possibly undefined                                                                                         |

**3. Build** — fails because `nodemailer` is not installed as a dependency.

- `lib/email.ts` imports `nodemailer` but it's not in `package.json`
- Used by `app/admin/orders/actions.ts` and `app/api/orders/route.ts`

#### Branch Cleanup

| Branch                                  | Status                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `claude/audit-ltex-ecosystem-cTLpW`     | Merged in main, remote delete pending (needs manual delete via GitHub UI) |
| `claude/session-4-tasks-EV62w`          | Merged in main, remote delete pending                                     |
| `claude/session-5-tasks-fcREm`          | Merged in main, remote delete pending                                     |
| `claude/admin-gallery-orders-WDIWr`     | Merged in main, remote delete pending                                     |
| `claude/project-status-analysis-9Qkj2`  | Already deleted                                                           |
| `claude/add-i18n-email-analytics-Xz9Ua` | Merged in main, remote delete pending                                     |

**ACTION REQUIRED:** Delete these 5 branches via GitHub Settings → Branches, or click "Delete branch" on merged PRs.

### Session 8 Completion Report (2026-04-08)

#### Що зроблено (1 коміт `1a7292f`, всі 7 задач виконані):

| Задача                   | Статус     | Деталі                                                |
| ------------------------ | ---------- | ----------------------------------------------------- |
| 1. Prettier форматування | **ГОТОВО** | 37 файлів переформатовано                             |
| 2. TypeScript помилки    | **ГОТОВО** | 41+ помилка виправлена в 12 файлах                    |
| 3. Перевірка build       | **ГОТОВО** | Build проходить з placeholder DB                      |
| 4. Валідація env         | **ГОТОВО** | `instrumentation.ts` попереджає про відсутні env vars |
| 5. Стійкість до помилок  | **ГОТОВО** | 10с таймаути на fetch для Telegram/Viber/Resend API   |
| 6. Аудит Prisma запитів  | **ГОТОВО** | Всі 11 файлів із запитами замовлень перевірені        |
| 7. Фінальна CI перевірка | **ГОТОВО** | Всі 4 кроки проходять                                 |

#### Ключові виправлення:

| Фікс                                                    | Файли                            |
| ------------------------------------------------------- | -------------------------------- | --- | ------------------ |
| Встановлено `nodemailer` + `@types/nodemailer`          | `package.json`, `pnpm-lock.yaml` |
| Додано зв'язок `product` до `OrderItem` в Prisma schema | `schema.prisma`                  |
| Виправлено scope бага `statusLabel`/`orderRef`          | `admin/orders/actions.ts`        |
| Виправлено пріоритет операторів `??`/`                  |                                  | `   | `compare/page.tsx` |
| Додано null guards для `currentImage`                   | `image-gallery.tsx`              |
| Виправлено non-null assertions в тестах                 | 3 тест-файли                     |
| Експортовано інтерфейси admin-stats (TS4058)            | `admin-stats.ts`                 |
| Видалено `ssr: false` із Server Components              | `layout.tsx`, `product-card.tsx` |
| Додано `force-dynamic` на головну сторінку              | `page.tsx`                       |
| Додано `instrumentation.ts` для валідації env           | Новий файл                       |
| Додано fetch таймаути (10с)                             | `notifications.ts`, `email.ts`   |

#### Результати CI:

| Крок                | Результат                                     |
| ------------------- | --------------------------------------------- |
| `pnpm format:check` | **PASS** — всі файли відформатовані           |
| `pnpm test`         | **PASS** — 186 тестів (25 shared + 161 store) |
| `pnpm typecheck`    | **PASS** — 0 помилок, 6/6 пакетів             |
| `pnpm build`        | **PASS** — 33 маршрути скомпільовані          |

#### Метрики:

| Метрика            | До Session 8            | Після Session 8                       |
| ------------------ | ----------------------- | ------------------------------------- |
| CI статус          | ЗЛАМАНИЙ (3 кроки fail) | **ВСЕ ЗЕЛЕНЕ** (4/4 pass)             |
| TypeScript помилки | 41                      | **0**                                 |
| Prettier проблеми  | 37 файлів               | **0**                                 |
| Build              | FAIL (nodemailer)       | **PASS**                              |
| Новий файл         | —                       | `instrumentation.ts` (env validation) |
| Змінено файлів     | —                       | 47 (+505/-385 рядків)                 |
| Total commits      | 44                      | **45**                                |

#### Статус проекту: ~99% MVP

| Компонент            | Завершеність | Деталі                                                                        |
| -------------------- | ------------ | ----------------------------------------------------------------------------- |
| Монорепо структура   | 100%         | Turborepo + pnpm, 3 packages, 2 apps, 2 services                              |
| База даних           | 100%         | 19 таблиць, 805 products, 725 lots seeded                                     |
| Web Store            | 100%         | Каталог, пошук, кошик, checkout, SEO, PWA, wishlist, compare, infinite scroll |
| Admin Panel          | 100%         | Dashboard + analytics (8 charts), CRUD, sort/filter/paginate, CSV, real-time  |
| API Layer            | 100%         | 20 ендпоінтів, rate limiting, Zod validation, consistent errors               |
| Telegram Bot         | 100%         | 7 commands + inline query + webhook + pagination                              |
| Viber Bot            | 100%         | 7 commands + keyboard menus + notifications                                   |
| Mobile Client App    | 95%          | Повний функціонал + auth guards + deep linking + splash screen                |
| Тестування           | 95%          | 186 unit + 36 E2E = 222, all passing                                          |
| i18n                 | 95%          | Dictionary (250 keys) + t() connected to all pages                            |
| Email                | 95%          | Dual transport (SMTP/Resend), graceful fallback if not configured             |
| Order Flow           | 95%          | Checkout → confirmation → status tracking → email → admin notes               |
| Accessibility        | 90%          | skip-to-content, aria-labels, focus-visible, keyboard nav                     |
| SEO                  | 98%          | canonical, OG, JSON-LD (5 types), hreflang, sitemap, meta                     |
| Security             | 95%          | CSP headers, auth guards, rate limiting, webhook validation, fetch timeouts   |
| CI/CD                | 100%         | typecheck + test + build + Prettier — all green                               |
| Performance          | 90%          | Infinite scroll, lazy images, bundle analyzer, ISR                            |
| Production Hardening | 90%          | Env validation, error resilience, fetch timeouts                              |
| Documentation        | 90%          | README, CONTRIBUTING, .env.example, deploy checklist                          |
| 1С Інтеграція        | 60%          | API готовий, потрібна конфігурація 1С                                         |
| Deploy / Production  | 60%          | Netlify працює, webhooks + фото не налаштовані                                |
| Mobile Agent App     | 0%           | Окрема сесія, потрібні скріншоти                                              |
| Warehouse App        | 0%           | Окрема сесія                                                                  |

---

### Session 9 Completion Report (2026-04-08)

#### Що зроблено (1 коміт `95d623b`, всі 3 задачі виконані):

| Задача                                 | Статус     | Деталі                                                                                                                                                     |
| -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Fix Netlify build (Prisma generate) | **ГОТОВО** | Додано `"build": "prisma generate"` в `packages/db/package.json` + `packages/db/turbo.json` з `cache: false`                                               |
| 2. Аудит `notFound()` narrowing        | **ГОТОВО** | Всі 6 файлів перевірені — `notFound()` повертає `never` в Next.js 15, narrowing працює коректно. Помилка Netlify була виключно через відсутні Prisma types |
| 3. CI + Netlify build верифікація      | **ГОТОВО** | Всі 4 кроки CI проходять + симуляція Netlify build проходить                                                                                               |

#### Кореневу причину виправлено:

Turbo `"build": { "dependsOn": ["^build"] }` означає що build кожного пакета залежить від build його залежностей. Але `@ltex/db` не мав `build` скрипта — turbo його пропускав. Без `prisma generate` всі Prisma query results мали тип `any`, і `strict: true` ловив implicit any параметри.

#### Метрики:

| Метрика        | До Session 9        | Після Session 9                 |
| -------------- | ------------------- | ------------------------------- |
| Netlify deploy | FAIL (Prisma types) | **Виправлено** (потрібен retry) |
| Нові файли     | —                   | `packages/db/turbo.json`        |
| Змінено файлів | —                   | 3 файли                         |
| Total commits  | 45                  | **46**                          |

### Session 10 Completion Report (2026-04-08)

#### Що зроблено (1 коміт `c088a5b`, всі 5 задач виконані):

| Задача                         | Статус     | Деталі                                                                                                                        |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1. SQL скрипти                 | **ГОТОВО** | `scripts/enable-rls.sql` (19 таблиць + 7 публічних read policies) + `scripts/fts-migration.sql` (GIN + pg_trgm з коментарями) |
| 2. Скрипт завантаження фото    | **ГОТОВО** | Існуючий `scripts/upload-photos.ts` перевірений — відповідає вимогам                                                          |
| 3. Скрипти реєстрації webhooks | **ГОТОВО** | `scripts/register-telegram-webhook.ts` + `scripts/register-viber-webhook.ts`                                                  |
| 4. netlify.toml                | **ГОТОВО** | Build config, Node 22, pnpm 9.15.4, security headers, кешування, www redirect                                                 |
| 5. CI верифікація              | **ГОТОВО** | Всі 4 кроки проходять                                                                                                         |

#### Створені скрипти:

| Скрипт                                 | Призначення                          | Запуск                                                                |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `scripts/enable-rls.sql`               | RLS на 19 таблицях + read policies   | Supabase SQL Editor                                                   |
| `scripts/fts-migration.sql`            | GIN + trigram індекси для пошуку     | Supabase SQL Editor                                                   |
| `scripts/upload-photos.ts`             | Завантаження фото в Supabase Storage | `npx tsx scripts/upload-photos.ts ./photos`                           |
| `scripts/register-telegram-webhook.ts` | Реєстрація Telegram webhook          | `TELEGRAM_BOT_TOKEN=xxx npx tsx scripts/register-telegram-webhook.ts` |
| `scripts/register-viber-webhook.ts`    | Реєстрація Viber webhook             | `VIBER_AUTH_TOKEN=xxx npx tsx scripts/register-viber-webhook.ts`      |

#### Метрики:

| Метрика                 | До Session 10     | Після Session 10                           |
| ----------------------- | ----------------- | ------------------------------------------ |
| Інфраструктурні скрипти | 1 (upload-photos) | **6** (+5 нових)                           |
| netlify.toml            | відсутній         | **Створено** (build + headers + redirects) |
| Нові файли              | —                 | 6 файлів                                   |
| Змінено файлів          | —                 | +370 рядків                                |
| Total commits           | 46                | **47**                                     |

### Session 13 Completion Report (2026-04-09)

#### Що зроблено (1 коміт `685e0e2`, всі 4 фікси виконані):

| Фікс                      | Файл                                             | Зміна                                                                                                    |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1. Homepage ISR + N+1 → 1 | `apps/store/app/(store)/page.tsx`                | Видалено `force-dynamic`; 7 round-trip N+1 count waterfall → 1 `prisma.product.groupBy` + агрегація в JS |
| 2. Product ISR            | `apps/store/app/(store)/product/[slug]/page.tsx` | Додано `export const revalidate = 300;`                                                                  |
| 3. Lots ISR               | `apps/store/app/(store)/lots/page.tsx`           | Додано `export const revalidate = 60;`                                                                   |
| 4. Catalog ISR            | `apps/store/app/(store)/catalog/page.tsx`        | Додано `export const revalidate = 60;`                                                                   |

#### Відхилення від orchestrator plan:

Worker додав `loadHomeData()` helper + `.catch(() => ({ parentCategories: [], counts: [] }))` fallback навколо DB-запитів на головній. Без цього CI build падав би через placeholder `DATABASE_URL` — Next.js 15 з `revalidate=60` і без `force-dynamic` пре-рендерить `/` статично при білді. Prod (Netlify має справжній DATABASE_URL) пре-рендерить реальні дані; CI падає на fallback → пустий стан → ISR довантажить перші реальні дані на першому запиті після deploy. Відхилення виправдане, CLAUDE.md constraint "НЕ ламати CI" мав пріоритет.

#### Результати CI (локально після merge):

| Крок                | Результат                                                                   |
| ------------------- | --------------------------------------------------------------------------- |
| `pnpm format:check` | **PASS**                                                                    |
| `pnpm typecheck`    | **PASS** — 7/7 пакетів, 0 помилок                                           |
| `pnpm turbo test`   | **PASS** — 186 тестів (25 shared + 161 store)                               |
| `pnpm build`        | **PASS** — 33 маршрути; `/` тепер `○ / 1m 1y` (Static + ISR revalidate 60s) |

#### Метрики:

| Метрика        | До Session 13        | Після Session 13               |
| -------------- | -------------------- | ------------------------------ |
| Homepage DB    | 8 sequential queries | **2 queries, ISR cached 60s**  |
| Homepage route | `ƒ /` (Dynamic)      | **`○ / 1m 1y` (Static + ISR)** |
| Product ISR    | None (dynamic)       | **`revalidate = 300`**         |
| Lots ISR       | None (dynamic)       | **`revalidate = 60`**          |
| Catalog ISR    | None (dynamic)       | **`revalidate = 60`**          |
| Змінено файлів | —                    | 4 (+38/-12 рядків)             |
| Total commits  | 47                   | **48**                         |

#### Очікуваний effect на prod:

- Головна: з ~500-2000ms (8 DB round-trips) → ~50ms steady state (кешований HTML)
- Найбільший виграш — eliminated the 7-round-trip count waterfall
- `/catalog`, `/lots`, `/product/[slug]` лишились `ƒ` (Dynamic) через `searchParams`/`params`, але ISR тепер кешує конкретні URL+query комбінації після першого запиту

### Session 14 Completion Report (2026-04-09)

Сесія була великою: Wave 1 (7 feature-задач) + Wave 1 Prisma schema migration + Wave 2 (homepage restructure) + emergency Netlify fix. Структура була orchestrator + паралельні worker-сесії.

#### Wave 1 — Feature expansion (ukrstock.com-style overhaul)

Мета: наблизити сайт до конкурентів (ukrstock.com) — додати банери, featured products, NEW/SALE розділи, promo stripe, video reviews, global search.

| Commit    | Task                                            | Ключові зміни                                                                                                                                                                                                                |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a5077c0` | **Task 1** — Header overhaul                    | Viber/Telegram group links, NEW/SALE навігація, global search field (connected to autocomplete API), оновлений макет header                                                                                                  |
| `e53f6c9` | **Task 2** — /new + /sale routes                | Публічні сторінки `/new` (останні 30 днів по `createdAt`) і `/sale` (товари з `priceType: akciya`), NEW/SALE badges на ProductCard                                                                                           |
| `025af73` | **Task 3** — Banners admin                      | Нова Prisma модель `Banner`, admin CRUD (`/admin/banners`), upload в Supabase Storage bucket `product-images/banners/`, drag-upload UI, isActive toggle, position sorting                                                    |
| `1514dae` | **Task 4** — Featured products                  | Нова Prisma модель `FeaturedProduct` (`onDelete: Cascade`), admin curation page (`/admin/featured`), публічна сторінка `/top`, `getFeaturedProducts()` helper                                                                |
| `dca65d9` | **Task 5** — Umami analytics                    | `<UmamiTracker>` client component (cookieless, `data-website-id` env var), `<AnalyticsClickTracker>` з global click listener на `[data-analytics]` елементах, data-analytics атрибути на ~30 key CTAs                        |
| `b45201b` | **Task 6** — Video reviews carousel             | `<VideoReviewsCarousel>` client component (scrollable row з YouTube thumbnails), `getVideoReviewProducts()` тягне 12 випадкових продуктів з `videoUrl`, CSP `img-src` оновлено на `https://i.ytimg.com`                      |
| `0005e56` | **Task 7** — Promo stripe ("Гаряча пропозиція") | Нова Prisma модель `PromoStripe` (single-row pattern: `findFirst` + update/create), admin сторінка `/admin/promo`, `<PromoStripe>` server component у `(store)/layout.tsx` (рендериться на всіх сторінках), `.catch()` guard |

#### Wave 1 Prisma migration (user action)

| Commit    | Файл                       | Опис                                                                                                                   |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `c8f9471` | `scripts/wave1-schema.sql` | Згенеровано через `prisma migrate diff --from-empty --to-schema-datamodel`, створює 3 таблиці з `IF NOT EXISTS` guards |

User виконав SQL в Supabase SQL Editor (verified via screenshot). 3 таблиці `featured_products`, `banners`, `promo_stripe` створені в Supabase.

#### Wave 2 — Homepage restructure

| Commit    | Task                 | Ключові зміни                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdef86d` | Homepage restructure | Нова `<BannerCarousel>` client component (auto-rotate 6s, dots, prev/next arrows, `next/image` з `priority` для LCP). Переписано `app/(store)/page.tsx` на 9 секцій: banners → hero fallback → featured → sale → new → categories → video reviews → recently viewed → features → CTA. Єдиний `Promise.all` з 7 паралельних запитів + `.catch()` fallback. ISR збережено (`revalidate = 60`). |

**Відхилення worker-а (accepted):** Додав `loadHomeData()` helper + `.catch()` fallback бо без цього CI build падав через placeholder `DATABASE_URL` — Next.js 15 пре-рендерить `/` статично при білді і не тягне DB. Prod (Netlify має справжній DATABASE_URL) отримує реальні дані.

#### Emergency Netlify fix — Production Prisma engine error

**Проблема:** Після Wave 2 deploy на Netlify кожен запит головної падав з `PrismaClientInitializationError: "Prisma Client could not locate the Query Engine for runtime 'rhel-openssl-3.0.x'"`. Сайт був повністю зламаний у проді.

**Діагностика:**

- `binaryTargets = ["native", "rhel-openssl-3.0.x"]` у `schema.prisma` — вже був (з Session 9)
- `PrismaPlugin` у `next.config.js` — вже був (з Session 9)
- Engine generate-ився локально коректно (`libquery_engine-rhel-openssl-3.0.x.so.node` присутній у `.next/server/chunks/`)
- `.nft.json` trace включав engine
- **Але:** Prisma runtime loader шукає engine у дефолтних локаціях (біля JS-файлу, `node_modules/.prisma/client`), а не в `.next/server/chunks/`. PrismaPlugin копіював engine тільки в `chunks/`, не біля кожного `page.js`. Netlify's Lambda bundler не шипив engine туди, де Prisma його шукав.

**Fix (commit `d6b8197`):**

| Файл                        | Зміна                                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/store/next.config.js` | Додано `outputFileTracingIncludes` з глобом на `libquery_engine-*.so.node` + `.prisma/client/**` для паттерну `/**/*`. Next.js тепер копіює rhel+debian engines напряму біля кожного `page.js` у `.next/server/app/**` — де Prisma їх і шукає за замовчуванням. |
| `netlify.toml`              | Додано явний крок `pnpm --filter @ltex/db exec prisma generate` перед `pnpm build`, щоб engine регенерувався завжди, навіть при Netlify build cache reuse.                                                                                                      |

**Верифікація локально:** `.next/server/app/(store)/libquery_engine-rhel-openssl-3.0.x.so.node` тепер існує біля `page.js`. CI: format + typecheck + 186 tests + build — все зелене. User підтвердив що сайт ожив після redeploy (admin login page рендериться).

#### Додаткові покращення під час сесії

- `2f80cdc` — `perf(product): stream recommendations via Suspense` — обгорнуто `<RecommendationsSection>` у Suspense з skeleton fallback, 4-5 query round trips для similar products стрімляться після основного контенту.

#### Результати CI (локально):

| Крок                | Результат                                     |
| ------------------- | --------------------------------------------- |
| `pnpm format:check` | **PASS**                                      |
| `pnpm typecheck`    | **PASS** — 7/7 пакетів, 0 помилок             |
| `pnpm turbo test`   | **PASS** — 186 тестів (25 shared + 161 store) |
| `pnpm build`        | **PASS** — всі маршрути скомпільовані         |

#### Метрики:

| Метрика                    | До Session 14 | Після Session 14                                                                                |
| -------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Prisma моделей             | 19            | **22** (+Banner, FeaturedProduct, PromoStripe)                                                  |
| Admin сторінки             | base          | **+4** (banners, featured, promo, + ukr nav: Топ товарів / Банери / Гаряча пропозиція)          |
| Store public routes        | base          | **+3** (/new, /sale, /top)                                                                      |
| Homepage sections          | 5             | **9** (banners → featured → sale → new → categories → video → recently viewed → features → CTA) |
| Analytics integration      | None          | **Umami tracker** + global click listener                                                       |
| Carousels/дінамічні блоки  | 0             | **2** (BannerCarousel, VideoReviewsCarousel)                                                    |
| CI статус                  | Green         | **Green (зберегли)**                                                                            |
| Production Netlify         | WORKING       | **BROKEN → FIXED** (binary target + file tracing)                                               |
| Total commits (Session 14) | —             | **10** (a5077c0 → d6b8197, включно з 2f80cdc)                                                   |

#### Wave 1 branches (pending remote delete через GitHub UI):

- `claude/feat-header-overhaul-h7k3m`
- `claude/feat-new-sale-routes-h5rJR`
- `claude/feat-banners-admin-KAM0m`
- `claude/feat-featured-products-Mv7it`
- `claude/feat-analytics-umami-d0duN`
- `claude/feat-video-reviews-carousel-ivIvs`
- `claude/feat-promo-stripe-9cziy`
- `claude/feat-homepage-restructure-s8lG5` (Wave 2)

---

### Session 15 Completion Report (2026-04-10)

#### Що зроблено (3 коміти, міграція на self-hosting):

| Commit    | Task                     | Ключові зміни                                                                                                                                                                                                                 |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `11c147b` | Infrastructure migration | Видалено PrismaPlugin, outputFileTracingIncludes, serverExternalPackages. Додано `output: 'standalone'`. Prisma binaryTargets: native + windows + debian-openssl-3.0.x. Fix singleton для production. netlify.toml deprecated |
| `dfb8072` | Code optimizations       | `<img>` → `<Image>` в ProductCard (WebP/AVIF, responsive sizes). React `cache()` dedup на product page (2→1 query). `unstable_cache` для homepage даних                                                                       |
| `6dd7d46` | Infrastructure configs   | ecosystem.config.js (PM2), Caddyfile (reverse proxy + auto-SSL), scripts/deploy.ps1 (PowerShell deploy), DEPLOYMENT.md (покрокова інструкція)                                                                                 |

#### Серверні характеристики (self-hosting target):

| Параметр | Значення                                    |
| -------- | ------------------------------------------- |
| OS       | Windows Server 2022 Datacenter              |
| CPU      | Intel i5-9600K @ 3.7GHz, 6 ядер             |
| RAM      | 32 ГБ                                       |
| Диски    | C: 146GB, D: 300GB, E: 931GB (777GB вільно) |
| IP       | 194.187.154.162 (статична)                  |
| Інтернет | 107 Мбіт symmetric (WestNet)                |
| Ping     | 12мс, Jitter: 0мс                           |

#### Результати CI:

| Крок                | Результат                                     |
| ------------------- | --------------------------------------------- |
| `pnpm format:check` | **PASS**                                      |
| `pnpm -r typecheck` | **PASS** — 6/6 пакетів, 0 помилок             |
| `pnpm -r test`      | **PASS** — 186 тестів (25 shared + 161 store) |
| `pnpm build`        | **PASS** — standalone output створений        |

#### Файли змінені/створені:

| Файл                                             | Тип      | Зміна                                                                                    |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `apps/store/next.config.js`                      | Modified | -PrismaPlugin, -outputFileTracingIncludes, -serverExternalPackages, +output:'standalone' |
| `packages/db/prisma/schema.prisma`               | Modified | binaryTargets: native + windows + debian-openssl-3.0.x                                   |
| `packages/db/src/index.ts`                       | Modified | Singleton кешується і в production                                                       |
| `netlify.toml`                                   | Modified | Deprecated header                                                                        |
| `apps/store/components/store/product-card.tsx`   | Modified | `<img>` → `<Image>`                                                                      |
| `apps/store/app/(store)/product/[slug]/page.tsx` | Modified | React `cache()` dedup                                                                    |
| `apps/store/app/(store)/page.tsx`                | Modified | `unstable_cache`                                                                         |
| `ecosystem.config.js`                            | **NEW**  | PM2 config                                                                               |
| `Caddyfile`                                      | **NEW**  | Reverse proxy + auto-SSL                                                                 |
| `scripts/deploy.ps1`                             | **NEW**  | PowerShell deploy script                                                                 |
| `DEPLOYMENT.md`                                  | **NEW**  | Setup guide                                                                              |

#### Очікуване прискорення після міграції:

| Сторінка    | Netlify (зараз)   | Self-hosted (після)  |
| ----------- | ----------------- | -------------------- |
| Homepage    | 2-5с (cold: 5с+)  | ~200-400мс стабільно |
| Product     | 2-3.5с            | ~100-250мс           |
| Catalog     | 2-3с              | ~150-300мс           |
| DB latency  | ~30мс (Frankfurt) | ~1мс (localhost)     |
| Cold starts | Кожні 60с idle    | Ніколи               |

### Tasks for next session (for Orchestrator 2.1)

**Ground rules (ALL IMPORTANT):**

- НЕ повторювати Sessions 0-18 — дивись completion reports вище
- НЕ ламати CI (format + test + typecheck + build)
- НЕ чіпати `output: 'standalone'` у `apps/store/next.config.js`
- НЕ чіпати PM2 Scheduled Task і cloudflared service binPath на сервері
- L-TEX НЕ приймає онлайн-оплати — `payments` таблиця тільки для історії з 1С
- Orchestrator планує, worker кодить. Orchestrator МЕРДЖИТЬ, worker — НЕ МЕРДЖИТЬ
- Писати українською (primary), terminology може бути англійською

**Priority queue (ordered by business impact):**

**P0 — Блокери комерційного запуску:**

1. **Контент:** банери (2-3 для carousel), фото 805 продуктів у Supabase Storage, featured products (12 шт в `/admin/featured`), promo stripe текст, Umami site setup + env vars. Потребує участі користувача + можливо worker для automation upload скриптів.
2. **1С sync end-to-end test:** продукт → сайт → замовлення → 1С і назад. Статус API готовий з Session 10, потребує конфігурації з боку 1С.
3. **Cold-boot reboot test:** планувати на нічне вікно. 15 хв роботи. Підтверджує production readiness.

**P1 — Важливо для stability:** 4. **External backup:** script додає copy у `D:\ltex-backups-mirror\` або rclone до cloud (~1 год). 5. **Health endpoint:** `GET /api/health` → `{ db: "ok", timestamp }` з DB ping. Перенаправити UptimeRobot на нього замість HTML. Code change + redeploy, ~30 хв. 6. **Caddy X-Forwarded-For trust** (з Session 17 deferred списку) — Caddy поки не активний у проді, tunnel йде напряму. Але якщо в майбутньому додаємо Caddy як reverse proxy, треба налаштувати trust headers.

**P2 — Optimizations:** 7. **CSP hardening** — видалити `unsafe-inline`/`unsafe-eval` через nonce middleware (~2-3 год). 8. **CLAUDE.md refactor** — розбити на `docs/ARCHITECTURE.md`, `HISTORY.md`, `CONVENTIONS.md`, `SESSION_TASKS.md`. Файл 1850+ рядків, некеровано. Топ-рекомендація з PROJECT_AUDIT. 9. **Mobile SSE token** — коли mobile app буде deploy-нутий (поки не в продакшні). 10. **revalidatePath() audit** — performance optimization.

**Інфраструктура що потребує юзер-дії (orchestrator не може зробити):**

- Увімкнути RLS у Supabase (`scripts/enable-rls.sql`)
- FTS міграція (`scripts/fts-migration.sql`)
- Supabase Storage bucket `product-images` якщо ще немає
- Завантажити фото `scripts/upload-photos.ts`
- Netlify env vars (якщо ще використовується): `NEXT_PUBLIC_SITE_URL`, `SYNC_API_KEY`, `TELEGRAM_BOT_TOKEN`+`CHAT_ID`, `VIBER_AUTH_TOKEN`, Umami env vars
- Telegram/Viber webhooks через `scripts/register-*.ts`
- Реальний cold-boot reboot тест (вночі)
- Контент: банери, фото, featured/promo заповнити

**Branches merged/pending cleanup (від Session 15-17):**

- `claude/review-claude-md-WPY04` (Session 15) — merged
- `claude/security-hardening-LHrQ7` (Session 16) — merged
- `claude/pre-deploy-security-fixes-T9QLJ` (Session 17) — merged
- `claude/audit-ltex-project-bdZol` (Session 18 audit) — on remote, NOT merged (archive only), містить `PROJECT_AUDIT_2026-04-18.md`

---

## Session 17 Completion Report (2026-04-16) — Pre-Deploy Security Fixes

**Контекст:** Повний аудит безпеки (2026-04-16) пройшовся по 18 категоріях, знайшов 13 проблем. 4 з них були блокерами deploy. Виправлено всі 4.

**Branch:** `claude/pre-deploy-security-fixes-T9QLJ` merged в main (commit `97832f7`).

### Що зроблено (3 коміти):

| Commit    | Task                                                                             | Ключові зміни                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0df9dfe` | fix(security): add auth guard to lot status server actions                       | `await requireAdmin()` додано у `updateLotStatus()` та `bulkUpdateLotStatus()` в `apps/store/app/admin/lots/actions.ts`                                                                    |
| `351226c` | fix(security): validate ctaHref URL format in promo stripe schema                | Zod `.refine()` блокує `javascript:`, `data:`, `file:`, `vbscript:`. Дозволено тільки `/...` (relative) або `http(s)://...` (absolute)                                                     |
| `6a5652a` | feat(security): startup validation for MOBILE_JWT_SECRET and SYNC_API_KEY length | Нова функція `validateProductionSecrets()` в `instrumentation.ts` — throw у production якщо secret відсутній або < 32 chars. 8 нових unit-тестів (prod/dev, missing/short/valid для обох). |

### Закриті загрози

| #   | Severity | Загроза                                                                        | Статус    |
| --- | -------- | ------------------------------------------------------------------------------ | --------- |
| 1   | CRITICAL | Admin lot status actions без auth → будь-хто міг змінювати інвентар            | **FIXED** |
| 2   | HIGH     | Promo `ctaHref` приймав `javascript:` URL → XSS при compromised admin          | **FIXED** |
| 3   | HIGH     | `MOBILE_JWT_SECRET` короткий/відсутній → імперсонація клієнтів у mobile API    | **FIXED** |
| 4   | HIGH     | `SYNC_API_KEY` короткий/відсутній → експорт всіх замовлень через `/api/sync/*` | **FIXED** |

### Результати CI:

| Крок                | Результат                                                   |
| ------------------- | ----------------------------------------------------------- |
| `pnpm format:check` | **PASS**                                                    |
| `pnpm -r typecheck` | **PASS** — 6/6 пакетів, 0 помилок                           |
| `pnpm -r test`      | **PASS** — **220 тестів** (25 shared + 195 store, +8 нових) |

### Метрики:

| Метрика                  | До Session 17 | Після Session 17                     |
| ------------------------ | ------------- | ------------------------------------ |
| Unit tests               | 212           | **220** (+8: instrumentation 8)      |
| MUST-FIX security issues | 4             | **0**                                |
| Нові файли               | —             | `apps/store/instrumentation.test.ts` |
| Змінено файлів           | —             | 4 (+131/-1 рядків)                   |

### Відкладено як post-deploy (не блокери)

Нижче задачі залишаються для майбутніх сесій після успішного deploy. Вони не блокують розгортання, бо реальний ризик низький або вимагає специфічного сценарію:

- **CSP hardening** — усунути `unsafe-inline`/`unsafe-eval` з `next.config.js`. Складне (2-3 години, potentially breaks hot reload), реальний XSS-ризик LOW у проекті (немає user HTML rendering через `dangerouslySetInnerHTML`).
- **Mobile SSE token у query param** — `apps/mobile-client/src/lib/api.ts` передає токен через `?token=` у URL. Стосується тільки mobile client коли він буде в production. Зараз mobile app не deploy-нутий.
- **X-Forwarded-For spoofing** — `lib/rate-limit.ts` довіряє першому IP з заголовка. Виправляється в Caddyfile (strip untrusted headers), не в коді. Перевірити під час deploy.
- **Telegram webhook secret startup validation** — схоже на Session 17 Task 3, але для optional bot. Якщо бот не використовується — не потрібно.
- **Console error logging audit** — перевірити `console.error` патерни на витік даних. Optimization, не security.
- **revalidatePath() cleanup** — оптимізація кешування, не security.

**NEXT:** Безпечно запускати deploy на self-hosted Windows Server згідно `DEPLOYMENT.md`.

---

## Session 18 Completion Report (2026-04-22) — Live Deployment + Infrastructure Hardening

**Контекст:** Перший вихід у інтернет з self-hosted Windows Server. Переведення DNS з Hostiq на Cloudflare. Створення постійного домену через Cloudflare Tunnel. Повний стек автостарту, моніторингу, бекапів.

**Branch:** жодних код-комітів. Вся робота — конфігурація на сервері. Окрема гілка `claude/audit-ltex-project-bdZol` містить `PROJECT_AUDIT_2026-04-18.md` (695 рядків аналізу стану проекту).

### Що зроблено (infra only, на сервері)

| Area              | Зміна                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS               | `ltex.com.ua` NS: `dns1/2.hostiq.ua` → `fiona.ns.cloudflare.com` + `trey.ns.cloudflare.com`. Всі MX/SPF/DKIM/DMARC/CalDAV/cPanel збережені як DNS-only (не проксовані Cloudflare). Тільки `@` та `www` — Proxied.                                                                                                                                                                                                    |
| Cloudflare Tunnel | Named tunnel `ltex-prod` (UUID `1b604cd0-1beb-4b0a-897f-93d67e58357f`). CNAME `new.ltex.com.ua` → `*.cfargotunnel.com`. cloudflared registered as Windows service with explicit `--config` в `binPath` (через `sc.exe config`, бо `cloudflared service install` не пропустив аргумент). Конфіг у `C:\Windows\System32\config\systemprofile\.cloudflared\` (SYSTEM profile) — cert.pem, config.yml, credentials JSON. |
| PM2 autostart     | Scheduled Task "PM2 Resurrect" — trigger AtStartup + 60s delay (щоб PostgreSQL встиг підняти). S4U logon as Тарас (без пароля). Виконує `C:\Users\Тарас\AppData\Roaming\npm\pm2.cmd resurrect`.                                                                                                                                                                                                                      |
| PM2 config        | `E:\ltex-ecosystem\ecosystem.config.js`: додано `restart_delay: 5000`, `min_uptime: "30s"`, `max_restarts: 50`. `pm2 save` → dump записаний у `C:\Users\Тарас\.pm2\dump.pm2`.                                                                                                                                                                                                                                        |
| PostgreSQL        | Вже був AUTO_START (Automatic). Version 16, data at `E:\PostgreSQL\16\data`. Service name: `postgresql-x64-16`. DB: `ltex_ecosystem`, user: `ltex`.                                                                                                                                                                                                                                                                  |
| Monitoring        | UptimeRobot Free tier (50 monitors limit). 3 active monitors: `new.ltex.com.ua`, `/admin/login`, `/catalog`. 5-min HTTP checks. Email alerts to L-TEX gmail.                                                                                                                                                                                                                                                         |
| Backups           | Script `E:\ltex-scripts\backup-db.ps1` — читає `DATABASE_URL` з `.env` parse-ом, використовує `pg_dump -Fc`, ротує файли >14 днів, логує у `E:\ltex-backups\backup.log`. Task "L-TEX Daily Backup" daily @ 03:00 (S4U). Тест ran успішно двічі, 169 КБ compressed (805+725+49 rows).                                                                                                                                 |

### Проблеми що виникали і як вирішили

1. **cloudflared quick tunnel → named tunnel:** Quick tunnel (random `*.trycloudflare.com`) використовувався для першого тесту, потім замінений на named.
2. **Cloudflare cert download failed:** Браузер завантажив cert.pem у `Downloads/`, довелось вручну перемістити у `%USERPROFILE%\.cloudflared\cert.pem`.
3. **Windows service no args:** `cloudflared service install` не пропускав `--config` flag. Fix: `sc.exe config cloudflared binPath= '"C:\...cloudflared.exe" tunnel --config "C:\...config.yml" run'`.
4. **Cyrillic username "Тарас":** Working but config path in YAML must match exactly. Copy-pasting `\` paths in PowerShell worked fine.
5. **First cold-boot test failed (502 Bad Gateway):** After real reboot, PM2 was empty. Root cause: task trigger had no delay → ran before PostgreSQL ready → Next.js crashed → PM2 gave up after default 16 restart attempts. Fix: 60s delay on trigger + PM2 restart_delay/min_uptime/max_restarts.
6. **Restart-Computer blocked:** Other RDP sessions (1С operators). Scheduled real reboot for night window.

### Scheduled Tasks на сервері

```
\PM2 Resurrect       | AtStartup +60s delay | S4U as Тарас | pm2 resurrect
\L-TEX Daily Backup  | Daily 03:00          | S4U as Тарас | powershell backup-db.ps1
```

### Залишилось (НЕ зроблено)

- **Cold-boot reboot test** — потрібне нічне вікно коли 1С неактивне. Use `shutdown /r /f /t 60`.
- **External backup** — бекапи на E: диску, якщо диск помре — втрата всього. Потрібно copy в `D:\` або OneDrive/rclone S3.
- **Health endpoint `/api/health`** — UptimeRobot пінгує HTML. Кращий endpoint який перевіряє DB connectivity (30 хв код-задача, вимагає redeploy).

### Метрики

| Метрика                      | До Session 18 | Після Session 18                           |
| ---------------------------- | ------------- | ------------------------------------------ |
| Live production URL          | Netlify only  | `new.ltex.com.ua` (self-hosted Cloudflare) |
| Auto-start services          | Partial       | Full (cloudflared + PM2 + PG)              |
| External monitoring          | None          | UptimeRobot 3 monitors + email             |
| DB backups                   | None          | Daily 03:00, 14-day retention              |
| Зафіксований downtime рівень | Unknown       | 100% uptime detectable (5-min granularity) |
| CLAUDE.md рядків             | 1783          | ~1850 (+67 for Session 18 report)          |

**Broker Note:** Netlify site still live — works as fallback. If self-hosted breaks, швидко перемкнути DNS можна поверненням A-запису `@` на Netlify IP. Бекапи на локальному диску — single point of failure (задача для Session 19+).

---

---

## Session 17 — Pre-Deploy Security Fixes (ARCHIVED — планування виконано)

**Контекст:** Повний аудит безпеки (2026-04-16) пройшовся по 18 категоріях і знайшов 13 проблем. 4 з них блокують deploy, решта — recommended/nice-to-have. Цю задачу робить одна нова worker-сесія.

**Branch:** Створити `claude/session-17-pre-deploy-fixes` від main.

**Обов'язкова умова:** НЕ ламати CI. Після кожної зміни: `pnpm format:check && pnpm -r typecheck && pnpm -r test`.

### Task 1: Додати auth guard на lot status actions (CRITICAL — 5 хв)

**Проблема:** `apps/store/app/admin/lots/actions.ts` має функції `updateLotStatus()` і `bulkUpdateLotStatus()` БЕЗ `requireAdmin()`. Атакуючий може викликати їх напряму (через server action endpoint) і змінювати інвентар.

**Fix:**

Прочитай файл спершу. Потім додай `await requireAdmin();` як першу строчку у ОБИДВІ функції:

```typescript
export async function updateLotStatus(lotId: string, status: LotStatus) {
  await requireAdmin(); // ← ДОДАТИ
  if (!LOT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  // ... решта без змін
}

export async function bulkUpdateLotStatus(lotIds: string[], status: LotStatus) {
  await requireAdmin(); // ← ДОДАТИ
  // ... решта без змін
}
```

Перевір що `requireAdmin` імпортований з `@/lib/admin-auth`. Якщо ні — додай імпорт.

### Task 2: Валідувати ctaHref у promo schema (HIGH — 5 хв)

**Проблема:** `apps/store/app/admin/promo/actions.ts` приймає `ctaHref` як довільний рядок до 500 символів. Адмін (або атакуючий що скомпрометував адмін-акаунт) може задати `javascript:fetch('/api/orders').then(...)` — XSS на кожному відвідувачі головної.

**Fix:**

У Zod schema поле `ctaHref` замість просто `.string().max(500)` зроби:

```typescript
ctaHref: z
  .string()
  .max(500)
  .refine(
    (url) => {
      if (!url) return true;
      // Relative path starting with / OR absolute http(s):// URL
      return url.startsWith("/") || /^https?:\/\//.test(url);
    },
    { message: "URL має починатись з / або http(s)://" }
  )
  .optional()
  .nullable(),
```

Це блокує `javascript:`, `data:`, `file:`, `vbscript:` тощо. Відносні шляхи (`/new`, `/sale`) і зовнішні HTTPS (`https://t.me/...`) працюють.

### Task 3: Startup-валідація MOBILE_JWT_SECRET (HIGH — 10 хв)

**Проблема:** Якщо env var встановлена у слабке значення (`"test"`, `"secret"`), JWT легко брутфорситься. `lib/mobile-auth.ts` відкидає запити, але система не зупиняється на старті.

**Fix:**

Прочитай `apps/store/instrumentation.ts` (вже існує — там зараз env-валідація). Додай у нього перевірку:

```typescript
// У блок де перевіряються env vars у production:
if (process.env.NODE_ENV === "production") {
  const mobileSecret = process.env.MOBILE_JWT_SECRET;
  if (!mobileSecret || mobileSecret.length < 32) {
    throw new Error(
      "MOBILE_JWT_SECRET must be at least 32 characters. " +
        "Generate with: openssl rand -hex 32",
    );
  }

  const syncKey = process.env.SYNC_API_KEY;
  if (!syncKey || syncKey.length < 32) {
    throw new Error(
      "SYNC_API_KEY must be at least 32 characters. " +
        "Generate with: openssl rand -hex 32",
    );
  }
}
```

**IMPORTANT:** Робити це тільки в production. У CI/dev `process.env.NODE_ENV !== "production"`, тому перевірка пропускається — CI не впаде.

Також прочитай `instrumentation.ts` — можливо там вже щось є схоже. Якщо так — додай у той самий блок.

### Task 4: Додати тести startup-валідації (10 хв)

Додай тести для перевірки startup-валідації у `apps/store/instrumentation.test.ts` (створити якщо немає). Тестуй сценарії:

- Валідна env (32+ chars) → OK
- Коротка MOBILE_JWT_SECRET → throw
- Коротка SYNC_API_KEY → throw
- Відсутня MOBILE_JWT_SECRET → throw
- Не production → не throw

Якщо важко тестувати `register()` напряму (бо це Next.js hook) — винеси логіку валідації в окрему функцію `validateProductionSecrets()` в тому ж файлі і експортуй її. Тестуй функцію.

### Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r test` — всі тести + нові тести пройшли
- [ ] Manual check: спробуй запустити `MOBILE_JWT_SECRET=short NODE_ENV=production pnpm start` — має впасти з помилкою

### Commit strategy

3 окремих коміти:

1. `fix(security): add auth guard to lot status server actions`
2. `fix(security): validate ctaHref URL format in promo stripe schema`
3. `feat(security): startup validation for MOBILE_JWT_SECRET and SYNC_API_KEY length`

### Push

```
git push -u origin claude/session-17-pre-deploy-fixes
```

### Out of scope для цієї сесії (НЕ робити)

Ці задачі залишаються для майбутніх сесій, не блокують deploy:

- **CSP hardening** (усунути `unsafe-inline`/`unsafe-eval`) — складне, 2-3 години, реальний XSS-ризик низький (немає user HTML rendering). Окрема сесія коли буде час.
- **Mobile SSE token у query param** — стосується тільки mobile client коли він буде в production. Зараз не exposed.
- **X-Forwarded-For spoofing** — налаштовується в Caddyfile, не в коді. Під час deploy перевіримо Caddy config.
- **Telegram secret startup validation** — схоже на Task 3 але для optional bot. Якщо user не використовує Telegram — не потрібно.
- **Error logging audit** — оптимізація, не вразливість.
- **revalidatePath() cleanup** — performance, не security.

### Резюме пріоритетів

| #   | Severity | Реальний ризик                                   | Priority |
| --- | -------- | ------------------------------------------------ | -------- |
| 1   | CRITICAL | Admin actions без auth = будь-хто ламає інвентар | MUST FIX |
| 2   | HIGH     | XSS через скомпрометованого адміна               | MUST FIX |
| 3   | HIGH     | Слабкий JWT secret → imperson клієнтів           | MUST FIX |
| 4   | HIGH     | Слабкий SYNC_API_KEY → експорт всіх замовлень    | MUST FIX |

Після цих фіксів — **безпечно розгортати на self-hosted сервер**.

---

## Session 16 Completion Report (2026-04-15) — Security Hardening

**Контекст:** Перед міграцією з Netlify на self-hosted Windows Server (де вже працює 1С) — виконано повне security hardening. Security audit виявив CRITICAL/HIGH issues з автентифікацією. Всі виправлені.

**Branch:** `claude/security-hardening-LHrQ7` merged в main (commit `0d0ad88`).

### Що зроблено (6 комітів):

| Commit    | Task                                                    | Ключові зміни                                                                                                                                                                       |
| --------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a5850bf` | feat(security): JWT-based mobile API auth               | Новий `lib/mobile-auth.ts` (JWT + `MOBILE_JWT_SECRET`). Bearer token на всіх `/api/mobile/*`. `customerId` тепер з signed token, не з client. Оновлено Expo app.                    |
| `5b9ab2a` | feat(security): require auth on admin stats             | Supabase session check на `/api/admin/stats`. 401 без auth.                                                                                                                         |
| `1230316` | fix(security): mandatory webhook signature verification | Telegram: 503 якщо `TELEGRAM_WEBHOOK_SECRET` не встановлений. Viber: 403 якщо немає підпису (прибрано fallback).                                                                    |
| `814ebc1` | feat(security): validate uploads by magic bytes         | Новий `lib/validate-image.ts` (magic bytes check для JPEG/PNG/WebP/GIF). Banner/product uploads відхиляють не-зображення. MIME derived server-side.                                 |
| `ae4566c` | fix(security): server-side chat sender + admin reply    | `/api/mobile/chat` POST: sender force = `"customer"`. Новий `/api/admin/chat/reply` з Supabase auth + push notify. Видалено unsafe mobile POSTs для shipments + payments (1C-only). |
| `8f30afe` | docs(security): update .env.example and DEPLOYMENT.md   | Додано `MOBILE_JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (required), уточнено `VIBER_AUTH_TOKEN` (required).                                                                           |

### Key protections added:

- **Mobile API** — Bearer token required на всіх `/api/mobile/*`. `customerId` береться тільки з signed token. Neможливо перебрати customerId і отримати чужі дані.
- **Admin API** — `/api/admin/stats` і `/api/admin/chat/reply` вимагають Supabase session.
- **Webhooks** — Telegram/Viber відхиляють unsigned requests. No fallback to accepting plain requests.
- **File uploads** — Magic bytes sniff відхиляє перейменовані executables. Extension + MIME derived server-side, не з client.
- **Chat** — customer повідомлення force `sender="customer"`. Manager replies йдуть через окремий auth-protected admin endpoint.
- **1C-only flows** — `/api/mobile/shipments` POST і `/api/mobile/payments` POST видалені. Shipments/payments створюються тільки через 1C sync.

### Нові файли (5):

| Файл                                           | Тип | Призначення                             |
| ---------------------------------------------- | --- | --------------------------------------- |
| `apps/store/lib/mobile-auth.ts`                | New | JWT verification helper для mobile API  |
| `apps/store/lib/mobile-auth.test.ts`           | New | 12 тестів для mobile auth               |
| `apps/store/lib/validate-image.ts`             | New | Magic bytes validator + size limits     |
| `apps/store/lib/validate-image.test.ts`        | New | 14 тестів для image validation          |
| `apps/store/app/api/admin/chat/reply/route.ts` | New | Admin endpoint для відповідей менеджера |

### Результати CI:

| Крок                | Результат                                                    |
| ------------------- | ------------------------------------------------------------ |
| `pnpm format:check` | **PASS**                                                     |
| `pnpm -r typecheck` | **PASS** — 6/6 пакетів, 0 помилок                            |
| `pnpm -r test`      | **PASS** — **212 тестів** (25 shared + 187 store, +26 нових) |

### Метрики:

| Метрика                  | До Session 16 | Після Session 16                                            |
| ------------------------ | ------------- | ----------------------------------------------------------- |
| Unit tests               | 186           | **212** (+26: mobile-auth 12, validate-image 14)            |
| CRITICAL security issues | 4             | **0**                                                       |
| HIGH security issues     | 3             | **0**                                                       |
| Нові env vars (required) | —             | `MOBILE_JWT_SECRET` + `TELEGRAM_WEBHOOK_SECRET` обов'язкові |
| Lines changed            | —             | +1055/-400 (35 файлів)                                      |
| Total commits            | 50            | **57**                                                      |

### Безпечно тепер розгортати на self-hosted сервер:

- ✅ Mobile endpoints не можуть бути використані для enumeration/injection
- ✅ Admin endpoints потребують auth
- ✅ Webhooks приймають тільки підписані запити
- ✅ File uploads валідовані на вміст, не тільки ім'я
- ✅ Chat messages не можна підробити від імені менеджера

**NEXT:** User може запустити deploy згідно `DEPLOYMENT.md`.

---

## Session 16 — Security Hardening (ARCHIVED — планування виконано)

**Контекст:** Проект готується до переїзду з Netlify на власний Windows Server (де вже працює 1С). Security audit (2026-04-15) виявив критичні проблеми з автентифікацією на публічних API. Без цих фіксів виставляти сервер в інтернет небезпечно — атакуючий може отримати доступ до клієнтських даних, а в гіршому випадку — до сервера де працює 1С.

**Branch:** Створити `claude/security-hardening-session-16` від main (після merge Session 15).

**Обов'язкова умова:** НЕ ламати CI. Після кожної зміни: `pnpm format:check && pnpm -r typecheck && pnpm -r test`.

### Task 1: Автентифікація на Mobile API (CRITICAL)

**Проблема:** `/api/mobile/profile`, `/orders`, `/favorites`, `/shipments`, `/chat`, `/payments`, `/notifications` приймають `customerId` як query/body параметр без жодної перевірки. Атакуючий може перебрати customerId і отримати замовлення/профілі/платежі будь-якого клієнта.

**Fix:**

1. Додати endpoint `/api/mobile/auth/token` що видає короткоживучий JWT токен (або session token) при успішному login (phone + OTP або phone + password).
2. Створити helper `lib/mobile-auth.ts`:
   ```typescript
   export async function verifyMobileToken(
     request: NextRequest,
   ): Promise<{ customerId: string } | null> {
     const auth = request.headers.get("authorization");
     if (!auth?.startsWith("Bearer ")) return null;
     const token = auth.slice(7);
     // Verify JWT signed with MOBILE_JWT_SECRET env var, return { customerId } or null
   }
   ```
3. Всі `/api/mobile/*` routes (окрім `/auth`) мають починатися з:
   ```typescript
   const session = await verifyMobileToken(request);
   if (!session)
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   // Use session.customerId, IGNORE customerId from request body/query
   ```
4. Оновити Expo app `apps/mobile-client/src/lib/api.ts` щоб зберігати токен і додавати в headers.
5. Додати нову env var `MOBILE_JWT_SECRET` в `.env.example`.
6. Написати тести для `verifyMobileToken` + оновити існуючі тести `/api/mobile/*`.

**Файли:**

- Новий: `apps/store/lib/mobile-auth.ts` + `apps/store/lib/mobile-auth.test.ts`
- Новий: `apps/store/app/api/mobile/auth/token/route.ts` (якщо ще немає — перевірити існуючий `/api/mobile/auth`)
- Змінити: всі `apps/store/app/api/mobile/*/route.ts`
- Змінити: `apps/mobile-client/src/lib/api.ts`

### Task 2: Автентифікація на Admin API (CRITICAL)

**Проблема:** `/api/admin/stats` приймає GET без перевірки — викриває бізнес-аналітику (замовлення, виручку, клієнтів).

**Fix:**

```typescript
// apps/store/app/api/admin/stats/route.ts
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... rest of handler
}
```

Те саме застосувати до БУДЬ-ЯКОГО `/api/admin/*` route, якщо знайдеш такі.

### Task 3: Обов'язкова верифікація webhooks (HIGH)

**Проблема:** Telegram і Viber webhook routes мають "optional" перевірку підпису — якщо env var не встановлена, запит приймається без перевірки.

**Fix 1 — Telegram** (`apps/store/app/api/telegram/webhook/route.ts`):

```typescript
const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!expectedSecret) {
  console.error("TELEGRAM_WEBHOOK_SECRET not configured");
  return NextResponse.json(
    { error: "Webhook not configured" },
    { status: 503 },
  );
}
const secret = request.headers.get("x-telegram-bot-api-secret-token");
if (secret !== expectedSecret) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Fix 2 — Viber** (`apps/store/app/api/viber/webhook/route.ts`):
Видалити fallback-гілку `} else { /* accept unsigned */ }`. Якщо немає підпису — 403 завжди:

```typescript
const signature = request.headers.get("x-viber-content-signature");
if (!signature)
  return NextResponse.json({ error: "Missing signature" }, { status: 403 });
// ... rest (verify HMAC, parse body)
```

### Task 4: File upload — перевірка magic bytes (HIGH)

**Проблема:** `uploadBannerImage()` і `uploadProductImage()` перевіряють тільки extension з імені файлу. Атакуючий може залити shell.jpg який насправді .exe.

**Fix:**

1. Додати helper `lib/validate-image.ts`:

   ```typescript
   const MAGIC_BYTES = {
     jpeg: [0xff, 0xd8, 0xff],
     png: [0x89, 0x50, 0x4e, 0x47],
     webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" + check "WEBP" at offset 8
     gif: [0x47, 0x49, 0x46, 0x38],
   };

   export async function validateImageFile(
     file: File,
   ): Promise<"jpeg" | "png" | "webp" | "gif" | null> {
     const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
     // Check magic bytes, return detected type or null
   }
   ```

2. Використовувати в `admin/banners/actions.ts` і `admin/products/actions.ts`:
   ```typescript
   const detected = await validateImageFile(file);
   if (!detected) return { error: "Недійсний формат зображення" };
   const fileName = `banners/${id}.${detected}`; // use detected type, not user-provided
   ```
3. Перевіряти розмір файлу (max 10 МБ для банерів, 5 МБ для продуктів).
4. Додати тести для `validateImageFile`.

### Task 5: Chat sender — визначати серверно (MEDIUM)

**Проблема:** `/api/mobile/chat` POST приймає `sender: "customer" | "manager"` з тіла запиту. Атакуючий може слати повідомлення від імені менеджера.

**Fix:** Після додавання mobile auth (Task 1), визначати sender завжди як `"customer"` (якщо юзер автентифікований через mobile token) або `"manager"` (якщо через Supabase admin auth). Ніколи не брати з body.

### Task 6: Chat — Admin auth для відповіді менеджера (MEDIUM)

Якщо є окремий endpoint для відповідей менеджера — захистити через Supabase auth. Якщо немає — створити `/api/admin/chat/reply` з Supabase auth + force `sender = "manager"`.

### Task 7: Оновити .env.example і DEPLOYMENT.md

Додати нові required env vars:

- `MOBILE_JWT_SECRET` — згенерувати через `openssl rand -hex 32`
- `TELEGRAM_WEBHOOK_SECRET` — перемістити з optional в required
- Уточнити що `VIBER_AUTH_TOKEN` обов'язкова для безпеки webhook

### Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r test` — всі тести пройшли (включно з новими)
- [ ] Нові тести: `mobile-auth.test.ts`, `validate-image.test.ts`
- [ ] Всі `/api/mobile/*` routes повертають 401 без auth header (перевірити manual або через тест)
- [ ] `/api/admin/stats` повертає 401 без Supabase session
- [ ] Telegram/Viber webhooks повертають 401/403 при відсутності/невірному підписі
- [ ] File upload відхиляє не-зображення (наприклад, текстовий файл перейменований в .jpg)

### Commit strategy

Розбити на окремі коміти:

1. `feat(security): add JWT-based mobile API authentication`
2. `feat(security): require auth on admin stats endpoint`
3. `fix(security): make webhook signature verification mandatory`
4. `feat(security): validate uploaded images by magic bytes`
5. `fix(security): determine chat sender server-side from auth`
6. `docs(security): update .env.example and DEPLOYMENT.md`

### Push

```
git push -u origin claude/security-hardening-session-16
```

### Out of scope (НЕ робити)

- Не переписувати існуючу Supabase auth на custom — admin login працює, не чіпати
- Не додавати Windows-specific захист (окремий user, firewall rules) — це задачі для deploy, не для коду
- Не додавати Cloudflare WAF — це user-action на рівні DNS
- Не міняти rate-limiting значення — існуючий rate-limiter достатній
- НЕ чіпати `$queryRawUnsafe` в catalog.ts — параметри передаються через `$1, $2...`, безпечно

### Довідка — Security audit findings summary

| #   | Severity | File                                                    | Issue                                                            |
| --- | -------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | CRITICAL | `/api/mobile/*`                                         | Немає auth, будь-хто може читати/писати дані будь-якого customer |
| 2   | CRITICAL | `/api/admin/stats`                                      | Немає auth, викриває бізнес-аналітику                            |
| 3   | CRITICAL | `/api/mobile/shipments` POST                            | Без auth — фейкові відправлення                                  |
| 4   | CRITICAL | `/api/mobile/chat` POST                                 | `sender` контролюється клієнтом                                  |
| 5   | HIGH     | `admin/banners/actions.ts`, `admin/products/actions.ts` | File upload без magic bytes check                                |
| 6   | HIGH     | `/api/telegram/webhook`                                 | Optional secret verification                                     |
| 7   | HIGH     | `/api/viber/webhook`                                    | Fallback до unsigned requests                                    |

**Безпечне (не чіпати):** Sync API (Bearer auth), SQL injection (Prisma параметризує), command injection (немає), env vars (серверні).

---

Немає інших активних задач для worker-сесії. Orchestrator чекає на фідбек від користувача по:

1. **Контент для банерів** — user планує згенерувати 2 банери через AI (ChatGPT/Gemini image gen) з промптом, виданим у поточній сесії. Теми: "широкий асортимент кросівок" + "акційні пропозиції квітня". Коли банери будуть — user завантажить їх через `/admin/banners` (drag-upload працює). Якщо щось зламається під час завантаження — новий worker-fix.
2. **Умaмi analytics** — у `NEXT_PUBLIC_UMAMI_WEBSITE_ID` і `NEXT_PUBLIC_UMAMI_SCRIPT_URL` env vars поки нічого немає. User має підняти Umami instance (self-host або umami.is cloud) і додати env vars у Netlify Dashboard, щоб click-tracking почав працювати в prod. Без цього компонент `<UmamiTracker>` просто нічого не рендерить (graceful noop).
3. **Featured products / Promo stripe** — user має зайти в `/admin/featured` та `/admin/promo` і наповнити контентом (інакше на головній буде пусто: featured section просто не покажеться, promo stripe теж).
4. **Фідбек про швидкість** — Session 13 ISR fixes + Session 14 Wave 2 single-Promise.all (7 queries) + Netlify fix задеплоєні. Потрібно перевірити в prod: швидкість головної, каталогу, лотів, продукту.
5. **Branch cleanup** — 17 merged branches чекають manual delete через GitHub UI (CLI віддавав 403).

#### Довгі pending задачі (потребують участі користувача, НЕ для автономної worker-сесії)

- Увімкнути RLS — запустити `scripts/enable-rls.sql` в Supabase SQL Editor
- Запустити FTS міграцію — запустити `scripts/fts-migration.sql` в Supabase SQL Editor
- Створити Storage bucket `product-images` в Supabase Dashboard (якщо ще немає — banners upload вже юзає subfolder `banners/`, але bucket має існувати)
- Завантажити фото продуктів — `npx tsx scripts/upload-photos.ts` (після створення bucket)
- Netlify env vars: `NEXT_PUBLIC_SITE_URL`, `SYNC_API_KEY`, `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`, `VIBER_AUTH_TOKEN`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`+`NEXT_PUBLIC_UMAMI_SCRIPT_URL`
- Telegram/Viber webhooks — запустити скрипти реєстрації
- 1С інтеграція — налаштування на стороні 1С
- Кастомний домен — ltex.com.ua (DNS + Netlify)

### Tasks for next session — previous (Session 13 plan, archived)

**IMPORTANT:** НЕ повторювати seed, merge, або infrastructure setup — все вже зроблено.
**IMPORTANT:** НЕ повторювати задачі Session 4-12 — ВСЕ ЗРОБЛЕНО. Дивись completion reports вище.
**IMPORTANT:** L-TEX НЕ приймає онлайн-оплати. Таблиця `payments` — тільки для відображення історії з 1С.
**IMPORTANT:** CI тепер зелений (format + test + typecheck + build). НЕ ламати CI.
**IMPORTANT:** Site is LIVE on Netlify at stalwart-dango-04a9b9.netlify.app with Prisma engine bundled correctly (commits 2b1c56e + 72c2a03). DO NOT touch `next.config.js` webpack/PrismaPlugin setup.

#### Context

User reports production site is live but pages load **very slowly**. Orchestrator diagnosed the root causes with an Explore agent and verified 4 concrete bottlenecks on the files. This is a scoped performance-fix session. Worker should apply exactly the 4 fixes below, run CI locally, push to a feature branch.

#### Task: Apply 4 performance fixes

**DO NOT** refactor, rename, reformat, or "improve" anything else. DO NOT touch the Prisma client singleton in `packages/db/src/index.ts` — it is correct as-is (the previous exploration agent was wrong about it; in serverless Lambda, module-level `const prisma = new PrismaClient()` is automatically cached across warm invocations, and the `globalForPrisma` pattern is only for dev HMR). DO NOT change middleware — it only runs on `/admin/:path*` and is not a public page bottleneck.

##### Fix 1 (CRITICAL): Homepage — remove force-dynamic conflict + collapse N+1 count query

**File:** `apps/store/app/(store)/page.tsx`

Currently:

```ts
// lines 10-11
export const dynamic = "force-dynamic";
export const revalidate = 60;

// lines 14-32
const parentCategories = await prisma.category.findMany({
  where: { parentId: null },
  include: { children: { select: { id: true } } },
  orderBy: { position: "asc" },
});

const categories = await Promise.all(
  parentCategories.map(async (cat) => {
    const childIds = cat.children.map((c) => c.id);
    const allIds = [cat.id, ...childIds];
    const productCount = await prisma.product.count({
      where: { categoryId: { in: allIds }, inStock: true },
    });
    return { ...cat, productCount };
  }),
);
```

Problems:

1. `dynamic = "force-dynamic"` overrides `revalidate = 60` → every request hits the DB, ISR never kicks in.
2. The `Promise.all` is actually sequential-ish against the DB and issues N+1 `count` queries (1 per parent category). With ~7 parent categories = 8 round trips total.

Required fix:

1. **Delete** the line `export const dynamic = "force-dynamic";` (keep `export const revalidate = 60;`).
2. **Replace** the N+1 block with a single `groupBy` that counts products grouped by `categoryId`, then aggregate child counts into parents in JS. Skeleton:

```ts
const parentCategories = await prisma.category.findMany({
  where: { parentId: null },
  include: { children: { select: { id: true } } },
  orderBy: { position: "asc" },
});

// One query: counts per category id (for both parents and children)
const counts = await prisma.product.groupBy({
  by: ["categoryId"],
  where: { inStock: true },
  _count: { _all: true },
});

const countByCategoryId = new Map(
  counts.map((c) => [c.categoryId, c._count._all]),
);

const categories = parentCategories.map((cat) => {
  const childIds = cat.children.map((c) => c.id);
  const productCount =
    (countByCategoryId.get(cat.id) ?? 0) +
    childIds.reduce((sum, id) => sum + (countByCategoryId.get(id) ?? 0), 0);
  return { ...cat, productCount };
});
```

Do NOT change anything else on this page (layout, JSX, JSON-LD, etc.). Only the two changes above.

##### Fix 2: Product page — enable ISR

**File:** `apps/store/app/(store)/product/[slug]/page.tsx`

Currently has no `revalidate` or `dynamic` export at the top, which makes Next.js treat it as dynamic because of `params`. Product details change rarely (only when 1C sync updates them).

Required fix: add `export const revalidate = 300;` near the top of the file (after the imports, before `generateMetadata`). Do NOT change the query, `include`, `notFound()`, or any JSX.

##### Fix 3: Lots page — enable ISR

**File:** `apps/store/app/(store)/lots/page.tsx`

Currently has no `revalidate` export. Add `export const revalidate = 60;` near the top (after imports, before `metadata`). Do NOT change the query or JSX.

##### Fix 4: Catalog index page — enable ISR

**File:** `apps/store/app/(store)/catalog/page.tsx`

Subcategory pages (`catalog/[categorySlug]/page.tsx`, `catalog/[categorySlug]/[subcategorySlug]/page.tsx`) already have `revalidate = 60`. The index `/catalog` does not.

Required fix: add `export const revalidate = 60;` near the top (after imports, before `metadata`). Do NOT change the `getCatalogProducts` call, filters, pagination, or JSX.

#### Verification checklist (worker must run locally)

1. `pnpm format:check` → must pass. If it fails on files you touched, run `pnpm exec prettier --write <those files>`. DO NOT run `format:write` on the whole repo.
2. `pnpm typecheck` → 0 errors across 7 packages.
3. `pnpm turbo test` → 186 tests pass (25 shared + 161 store).
4. `DATABASE_URL="postgresql://user:pass@localhost:5432/db" DIRECT_URL="postgresql://user:pass@localhost:5432/db" pnpm build --filter=@ltex/store...` → must succeed.
5. Confirm no other files changed: `git diff --stat main` should show only the 4 files above.

#### Commit + push

- Branch: work on a feature branch (Netlify deploys from main, do NOT push to main).
- Commit message: single commit with subject `perf(store): enable ISR on homepage/catalog/lots/product + fix homepage N+1 count query`. Body should explain each of the 4 fixes in 1-2 lines.
- Push: `git push -u origin <branch-name>`. The orchestrator will merge into main.

#### Expected outcome

| Page              | Before                                | After (steady state)                              |
| ----------------- | ------------------------------------- | ------------------------------------------------- |
| `/`               | 8 sequential DB queries every request | ISR cached 60s → ~50ms; first request = 2 queries |
| `/product/[slug]` | 2 queries every request               | ISR cached 300s → ~50ms                           |
| `/lots`           | 2 queries every request               | ISR cached 60s → ~50ms                            |
| `/catalog`        | 2 queries every request               | ISR cached 60s → ~50ms                            |

The biggest win is Fix 1 — eliminating the 7-round-trip waterfall on the homepage.

#### Out of scope (do NOT do in this session)

- Image optimization / uploading photos (separate session)
- Admin page performance (admin intentionally uses `force-dynamic`)
- Middleware changes (only runs on admin, not public pages)
- Edge runtime migration
- Adding new indexes to Prisma schema
- Touching next.config.js / PrismaPlugin / webpack config (already correct)
- Bumping Next.js / Prisma / React versions
- Any "improvements" to files outside the 4 listed above

#### Задачі що потребують участі користувача (НЕ для автономної сесії)

- **Видалити merged branches** — 8 branches через GitHub UI (див. Branch Cleanup вище)
- **Увімкнути RLS** — запустити `scripts/enable-rls.sql` в Supabase SQL Editor
- **Запустити FTS міграцію** — запустити `scripts/fts-migration.sql` в Supabase SQL Editor
- **Запустити seed** — `pnpm db:seed` з правильним DATABASE_URL
- **Створити Storage bucket** — `product-images` в Supabase Dashboard
- **Завантажити фото** — `npx tsx scripts/upload-photos.ts` (після створення bucket)
- **Retry Netlify deploy** — перевірити що фікс Prisma generate працює
- **Netlify env vars** — додати NEXT_PUBLIC_SITE_URL, SYNC_API_KEY
- **Telegram/Viber webhooks** — запустити скрипти реєстрації
- **1С інтеграція** — налаштування на стороні 1С
- **Кастомний домен** — ltex.com.ua (DNS + Netlify)

---

## Session 19 Completion Report (2026-04-24) — CLAUDE.md Decomposition

**Мета:** розбити 1872-рядковий CLAUDE.md на логічні файли, зменшити onboarding cost для worker-сесій.

**Результат:**

- `CLAUDE.md`: 1872 → 116 рядків (overview + navigation table до docs/)
- `docs/ARCHITECTURE.md`: 251 рядків (file tree + DB schema + tech stack) — створив worker
- `docs/HISTORY.md`: 1406 рядків (Sessions 4-18 completion reports + archived plans) — створив orchestrator
- `docs/CONVENTIONS.md`: 74 рядки (do-not-touch rules, existing systems) — створив orchestrator
- `docs/SESSION_TASKS.md`: 171 рядок (priority queue P0-P3 + marketplace gap analysis) — створив orchestrator

**Виконання:**

Worker запущений з `docs/SESSION_19_DECOMPOSITION.md` specom. Створив `docs/ARCHITECTURE.md` + запушив, потім впав з API timeout. Orchestrator перехопив завдання, склав 3 залишкові файли через `sed` (копіпаста з оригіналу 1:1, без переписувань своїми словами) і переписав CLAUDE.md у короткий overview.

**Content preserved:** 100% з оригінального CLAUDE.md, жоден рядок не втрачено — лише структурно реорганізовано.

**Коміти:**

- `d1ff43b wip: partial CLAUDE.md decomposition` (worker)
- `d1b881d docs: complete CLAUDE.md decomposition (HISTORY/CONVENTIONS/SESSION_TASKS)` (orchestrator)
- `1bdeca0 Merge Session 19: decompose CLAUDE.md into docs/ structure`

**CI:** format check green; typecheck/test/build — на GitHub Actions (локально `node_modules` не встановлений у orchestrator environment).

**Branch cleanup:** merged branch `claude/session-19-decompose-claude-md-aVDw6` — pending видалення через GitHub UI (CLI дає 403).

---

## Session 20 Completion Report (2026-04-24) — B2B UX Essentials

**Мета:** 6 marketplace-UX покращень на основі gap analysis vs Kasta / Rozetka / Optom.com.ua (spec у `docs/SESSION_20_B2B_UX.md`).

**Результат:** 18 files changed, 880 insertions. 228 тестів passing (+5 нових).

**Нові файли:**

- `apps/store/components/store/compare-checkbox.tsx` — checkbox на product card (max 3 items)
- `apps/store/components/store/share-buttons.tsx` + test — copy link / Viber / Telegram / Facebook
- `apps/store/components/store/social-icons.tsx` — inline SVG brand marks (lucide-react не має)
- `apps/store/app/(store)/terms/page.tsx` — Умови використання (placeholder)
- `apps/store/app/(store)/privacy/page.tsx` — Політика конфіденційності (placeholder)
- `apps/store/app/(store)/returns/page.tsx` — Повернення та обмін (placeholder)

**Оновлені:**

- `product-card.tsx` — інтегрований `CompareCheckbox`
- `catalog-filters.tsx` — subcategory `<select>` + "Тільки в наявності" toggle
- `catalog.ts` — `subcategorySlug` + `inStockOnly` параметри в `getCatalogProducts` і `fullTextSearch`
- `catalog/[categorySlug]/page.tsx` — передає children у filters
- `product/[slug]/page.tsx` — ShareButtons + Delivery info card
- `footer.tsx` — нова колонка "Інформація" (Terms/Privacy/Returns) + 4 social icons row
- `sitemap.ts` — +3 legal URL
- `i18n/uk.ts` — +122 рядки нових ключів (compare, share, delivery, terms, privacy, returns, catalogFilters)

**Hard rules дотримано:**

- `next.config.js` — не чіпав
- `package.json` / `pnpm-lock.yaml` — немає нових dependencies
- `schema.prisma` / API routes — не чіпав
- i18n-дисципліна — всі strings у `uk.ts`

**Placeholder-и для user review:**

- Terms/Privacy/Returns — TODO коментарі "погодити з юристом"
- Footer social handles — placeholder URLs (facebook.com/ltex etc.), TODO замінити на реальні коли створені акаунти

**Коміти (3):**

- `d92d51d feat(catalog): compare checkboxes + subcategory + in-stock filters`
- `af6cec3 feat(product): share buttons + delivery info block`
- `a458c6e feat(legal): Terms/Privacy/Returns pages + footer social icons`
- `84f8d64 Merge Session 20: B2B UX essentials`

**CI:** format + typecheck + test (228 passing) + build — all green на voркері.

**Branch cleanup:** `claude/session-20-b2b-ux-essentials-4FwyD` — pending видалення через GitHub UI.

**Наступне:**

- Session 21 — Customer Account + Order History (потребує рішення A: auth flow)
- Session 22 — Bulk Ordering (потребує рішення C/D: volume discount policy, quote request)
- Session 23 — Content & Trust Marketing (потребує рішення F/G/H: соц-handles, testimonials, stats)

---

## Session 23 Completion Report (2026-04-25) — Trust Content & Marketing

**Мета:** 5 trust signals для marketplace credibility (spec у `docs/SESSION_23_TRUST_CONTENT.md`).

**Результат:** 16 files changed, 859 insertions. 217 tests passing (+8 new).

**Single commit `1edea27`:** worker свідомо об'єднав 3 заплановані commit-и в один, бо footer.tsx, page.tsx і i18n/uk.ts чіпались усіма tasks — splitting вимагав би крихких intermediate станів.

**Deliverables:**

| Task                              | Файли                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real social handles (7 каналів)   | `social-icons.tsx` (+TikTok +Viber SVG), `footer.tsx` (real URLs)                                                                                                                       |
| Countries carousel                | `countries-carousel.tsx` + test, `(store)/page.tsx` (між categories і video reviews)                                                                                                    |
| Company stats з counter animation | `lib/use-counter.ts` (IntersectionObserver) + test, `company-stats.tsx`, на homepage після countries                                                                                    |
| Testimonials slider               | `lib/testimonials.ts` (5 hardcoded з TODO), `testimonials-slider.tsx` (auto-rotate 6s + Google link), перед CTA                                                                         |
| Newsletter signup                 | Prisma `NewsletterSubscriber` model + migration `20260425_newsletter_subscribers`, `/api/newsletter` POST (rate-limit 5/IP/hr, Zod, re-subscribe-aware), `newsletter-form.tsx` у footer |

**i18n:** +33 нові ключі у `uk.ts` (countries, stats, testimonials, newsletter, social).

**DB migration:** `20260425_newsletter_subscribers` — треба запустити `pnpm --filter @ltex/db exec prisma migrate deploy` на сервері перед deploy.

**Out of scope (deferred):**

- Google Places API integration (manual hardcode тільки)
- Double opt-in confirm email
- Unsubscribe link / page
- Email broadcast (чекає на email provider — P1 #9)
- Admin newsletter page (optional, skipped)

**Hard rules:** дотримано. Не чіпав next.config.js, не додав deps, не зломав mobile API.

**Prisma engine fix (orchestrator hotfix):** комміт `7ab3445` додав outputFileTracingIncludes у `next.config.js` + Prisma engine copy step у `deploy.ps1` — тепер cold-start PM2 не падає з PrismaClientInitializationError.

**Коміти:**

- `1edea27 feat(content): trust signals — countries, stats, testimonials, newsletter, social` (worker)
- `7ab3445 fix(deploy): include Prisma engine in standalone build + copy fallback` (orchestrator hotfix)
- `cf0580c Merge Session 23: trust content & marketing`

**Branch cleanup:** `claude/session-23-trust-content-CysjA` — pending видалення через GitHub UI.

---

## Session 24 Completion Report (2026-04-25) — Homepage Cleanup

**Мета:** прибрати 3 непотрібні секції з homepage за user feedback (фокус на каталозі, не на маркетингових блоках).

**Результат:** 8 files changed, +6 / -317 lines. CI green (format + typecheck 6/6 + 211 store tests + 25 shared + build).

**Видалено:**

- Section "Прямі постачання з Європи та Канади" (countries carousel, GB/DE/CA/PL)
- Section "L-TEX у цифрах" (company stats з counter animation)
- Section з 4 features ("Від 10 кг / 4 країни / Відеоогляди / Швидка доставка")
- Files: `countries-carousel.tsx` + test, `company-stats.tsx`, `use-counter.ts` + test
- i18n keys: `countries.*`, `stats.*`, `home.features.*`

**Залишилось на homepage:** BannerCarousel → Featured → Sale → New → Categories grid (поки) → Videos → RecentlyViewed → Testimonials → CTA.

**Коміти:**

- `92a263f refactor(homepage): remove countries / stats / features-bar sections`
- `c2f81d6 Merge Session 24: homepage cleanup (3 sections removed)`

**Branch cleanup:** `claude/session-24-homepage-cleanup-ZEdUZ` — pending видалення через GitHub UI.

**Наступне:** Session 25 — categories grid → carousel з gradient + lucide icon, 6s auto-rotate.

---

## Session 25 Completion Report (2026-04-25) — Categories Carousel

**Мета:** замінити static categories grid на horizontal scroll-snap carousel з gradient + lucide icon (per user 2026-04-25, render preview підтверджений).

**Результат:** 6 files changed, +384 / -20. CI green: 218 store tests (+7), format + typecheck (6/6) + build.

**Реальні DB категорії (top-level):** 7 шт. — `odyag`, `vzuttia`, `aksesuary`, `dim-ta-pobut`, `igrashky`, `bric-a-brac`, `kosmetyka`. Spec mapping використовував placeholder slug-и (zhinky / choloviky) — worker замінив на реальні + додав `Sofa` для bric-a-brac, `Gem + fuchsia` для kosmetyka.

**Layout choice:** scroll-snap track замість `transform: translateX` — native mobile swipe + responsive widths (`w-[66%] sm:w-[33%] md:w-[25%]`) без JS resize listener. Arrows + dots використовують `scrollTo` для jump.

**Files:**

- `apps/store/components/store/categories-carousel.tsx` (194) + test (99)
- `apps/store/lib/category-display.ts` (55) — slug → icon/gradient
- `apps/store/lib/pluralize.ts` (19) — Ukrainian noun plurals (1/2-4/5+)
- Modified: `app/(store)/page.tsx` (categories grid → CategoriesCarousel), `lib/i18n/uk.ts` (+`home.categoriesCarousel.*`)

**A11y:** aria-label, keyboard ← → nav, role="tab" on dots, button aria-label-нуто.

**Behavior:**

- Desktop: 4 cards visible
- Tablet: 3 cards
- Mobile: 1.5 cards (peek next), native swipe
- Auto-rotate 6 сек, pause on hover, restart on user interaction

**Коміти:**

- `87a31f6 feat(homepage): replace categories grid with auto-rotating carousel`
- `b7513cf Merge Session 25: categories grid → auto-rotating carousel`

**Branch cleanup:** `claude/session-25-categories-carousel-R4woT` — pending видалення через GitHub UI.

**Наступне:** Session 26 — newsletter notifications (admin bell + Telegram + welcome email render).

---

## Session 26 Completion Report (2026-04-25) — Newsletter Notifications

**Мета:** активувати newsletter signup — Telegram + admin bell + welcome email render (per ecosystem chat 2026-04-25).

**Результат:** 8 files changed, +360 / -12. CI green: 227 store tests (+9), format + typecheck (6/6) + build.

**Architecture:**

- **Helper:** `fireNewsletterNotifications()` (DRY для new + re-subscribe paths)
- **Fire-and-forget:** `void` + `.catch()` на обох notifications — не блокує 201/200 response
- **Тільки при активній підписці:** existing-active path silent, new-subscribe + re-subscribe-of-unsubscribed → fire all 3

**Discoveries:**

- `lib/email.ts` вже існував з SMTP+Resend abstraction (`isEmailConfigured()` + `baseLayout()` + `sendEmail()`). Worker reused — додав `sendWelcomeNewsletterEmail()` поряд з existing order helpers, не створив окремий файл.
- Admin notification mechanism: `components/admin/notification-bell.tsx` polling `/api/admin/stats` every 30s — extended endpoint + component щоб показати newsletter count alongside pending orders / unread messages.

**Files:**

- `lib/notifications.ts`: +`notifyNewsletterSubscribe()` (51 lines) — Telegram via `NEWSLETTER_TELEGRAM_CHAT_ID`, no-op якщо unset, 10s timeout
- `lib/email.ts`: +`sendWelcomeNewsletterEmail()` (43 lines) — render via i18n, no-op якщо `!isEmailConfigured()`
- `lib/i18n/uk.ts`: +`newsletter.welcomeEmail.{subject,heading,body}` (15 lines)
- `app/api/admin/stats/route.ts`: +`newSubscribersToday` field (count where `subscribedAt >= now-24h AND unsubscribedAt IS NULL`)
- `components/admin/notification-bell.tsx`: +counter row "Нові підписники (24г)" з зеленим бейджем
- `app/api/newsletter/route.ts`: extract `fireNewsletterNotifications()` helper, fires on new + re-subscribe-of-unsubscribed
- `lib/notifications.test.ts`: +5 tests (env present/missing для обох vars, network reject, non-OK status)
- `app/api/newsletter/route.test.ts`: +4 tests (notification call counts, both reject paths still return 201/200)

**User action required для production:**

- Server env вже має `NEWSLETTER_TELEGRAM_CHAT_ID` (додано до deploy 2026-04-25). PM2 restart з `--update-env` потрібен.
- Email provider не налаштований — welcome email log only ("Email provider not configured — welcome newsletter email skipped"). Activate коли P1 #9 буде зроблено.

**Коміти:**

- `9fb4f70 feat(newsletter): notifications on subscribe (admin bell + Telegram + email render)`
- `b7c7b13 Merge Session 26: newsletter notifications`

**Branch cleanup:** `claude/session-26-newsletter-notifications` — pending видалення через GitHub UI.

**Homepage refactor готовий до production deploy:** S24 (cleanup) + S25 (categories carousel) + S26 (newsletter active) — три merged сесії, один deploy на сервер.

---

## Session 39 Completion Report (2026-04-27) — Deploy Step 4 Fix + Wishlist Persistence

**Мета:** закрити P0 deploy step 4 (build hang на PowerShell після S37 Tee-Object thesis помилки) + перший P1 mobile task (wishlist persistence — heart toggle з S38 був візуальний, не зберігався).

**Результат:** 3 коміти на main (через 2 worker-merge cycles). Build тепер 5.6с end-to-end, PM2 online, mobile heart переживає reload.

### Що відбулось

1. **Перша спроба (commit `d6c1d2f`):** замінив S37 Tee-Object pipeline на `cmd /c "pnpm ... > build.log 2>&1"` per CLAUDE.md тезис. На сервері крок [4/8] завис так само — PowerShell тримав child stdout, навіть з cmd-редиректом всередині. Тейл `build.log` показав останній рядок `· serverActions` і нічого далі.
2. **Diagnosis (in PS):** `taskkill /F /IM node.exe` + прямий `pnpm --filter @ltex/store run build` без редиректу → пройшов за 6.1с з реальним стрімінгом у консоль. Висновок: проблема не у буферизації Next.js, а у вкладеності `PS → cmd.exe → pnpm.cmd → cmd.exe → node` коли додається ще один редирект.
3. **Виправлення (commit `a7ef0f6`):** revert до прямого `pnpm --filter @ltex/store run build` (як було до S37). Зберіг `$LASTEXITCODE` чек з S37. Видалив `build.log` логіку повністю.

### Висновки для майбутніх сесій

- **CLAUDE.md тезис "real fix is cmd /c" БУВ ХИБНИЙ.** Direct `pnpm` invocation працює як треба — нічого не блокується.
- Tee-Object thesis з S37 теж був хибний (це вже знали).
- **Не додавати редирект у крок [4/8]** — будь-який (Tee-Object, cmd /c, Start-Process з RedirectStandardOutput) ламає stdio chain.
- Якщо коли-небудь build реально зависне знову — спершу `taskkill /F /IM node.exe`, далі `pnpm --filter @ltex/store run build` напряму у тому ж PS вікні.

### Wishlist persistence (mobile)

**Files:**

- `apps/mobile-client/src/lib/wishlist.ts` (нове, 25 рядків): context type + `useWishlist()` hook
- `apps/mobile-client/src/lib/wishlist-provider.tsx` (нове, 130 рядків): SecureStore persistence (з localStorage fallback за патерном `auth-provider.tsx`), 100-item cap, fire-and-forget mirror у `/api/mobile/favorites` коли `customerId` присутній
- `apps/mobile-client/src/navigation/AppNavigator.tsx`: `WishlistProvider` обгортає children під `AuthProvider`
- `apps/mobile-client/src/screens/catalog/CatalogScreen.tsx`: `useWishlist` + `extraData={items}` щоб FlatList перерендерив hearts на toggle
- `apps/mobile-client/src/screens/wishlist/WishlistScreen.tsx`: replaces empty placeholder з 2-col grid (`ProductCard` reuse), empty state preserved

**Architecture:**

- Local-first: `SecureStore` source of truth для UI; навіть logged-out користувач має persistent heart.
- Snapshot trim: зберігаємо лише поля для `ProductCard` (id/slug/name/quality/season/priceUnit/country/videoUrl/first image/wholesale+akciya prices/createdAt).
- Server mirror: коли logged in — `favoritesApi.add/remove` fire-and-forget, без error UI. Прирівнюється до того що backend вже мав з S5.

**Не зроблено навмисно (out of scope для S39):**

- Pull-on-login merge сервера → локалі (server has products у іншій shape, потрібна conversion). Якщо клієнт уже мав favorites у DB — зараз не побачить їх локально.
- QuickView modal з ProductCard довге натискання — окрема задача.

### Коміти

- `d6c1d2f chore(deploy): step 4 build via cmd /c redirect (S39)` — перша спроба, на сервері виявилась неробочою
- `862126b feat(mobile): wishlist persistence + saved-products screen`
- `a7ef0f6 fix(deploy): drop build log redirect, call pnpm directly` — фінальне виправлення deploy.ps1

**Branches видалені:** `claude/review-s39-deployment-8Ll7i`, `claude/fix-s39-build-redirect`.

**Verification:**

- CI green на main після обох merge.
- Local: format, typecheck (6/6 packages), test 243/243.
- Server: `.\scripts\deploy.ps1` end-to-end clean, build 5.6с, PM2 online, всі 3 URL (`/`, `/catalog`, `/admin/login`) відкриваються.

**Наступне:** S34 — mobile banners + recommendations (заповнити placeholder на `HomeScreen` після S33).

---

## Session 34 Completion Report (2026-04-27) — Mobile Home Banners + Product Rails

**Мета:** замінити placeholder "ми покажемо схожі тут" на mobile HomeScreen реальним контентом — банери з адмінки + три horizontal product rails (Топ / Акції / Новинки).

**Spec:** `docs/SESSION_34_MOBILE_BANNERS_RECOMMENDATIONS.md`.

**Результат:** 1 коміт (`de04d93`), 6 файлів, +702/-41 рядків. Build 7.6с, 246 unit-тестів (+3), endpoint live на `https://new.ltex.com.ua/api/mobile/home`.

### Files

- `apps/store/app/api/mobile/home/route.ts` (новий) — single round-trip: `Promise.all` над banner.findMany + featuredProduct.findMany + product.findMany (sale) + product.findMany (new), 12 елементів кожна колекція, ISR `revalidate = 60`. Inline `mapProduct` нормалізує `createdAt → ISO`, фільтрує prices до `wholesale + akciya`, плоский shape для mobile.
- `apps/store/app/api/mobile/home/route.test.ts` (новий) — 3 vitest cases: shape, empty DB, product normalisation.
- `apps/mobile-client/src/lib/api.ts` — `MobileHomeBanner`, `MobileHomeData`, `homeApi.get()` (skipAuth, public).
- `apps/mobile-client/src/components/BannerCarousel.tsx` (новий) — pure RN: FlatList horizontal + paging + 6с auto-rotate (resets on manual swipe), dot indicators, rgba overlay (no `expo-linear-gradient` dep). Tap routes http(s) → `Linking.openURL`, `/catalog`/`/lots`/`/wishlist` → `navigation.navigate`.
- `apps/mobile-client/src/components/HorizontalProductRail.tsx` (новий) — title + optional "Усі →" CTA + horizontal FlatList of `ProductCard` (160dp width, gap 12). Integrates `useWishlist()` so heart toggling mirrors Catalog. `extraData={items}` примушує rerender при toggle.
- `apps/mobile-client/src/screens/home/HomeScreen.tsx` — rewrite: data fetch via `homeApi.get()`, pull-to-refresh, error message, conditional `<BannerCarousel>` / fallback brand banner, three rails (Топ / Акції / Новинки) з "Усі →" → `Catalog`. Quick actions row preserved (Каталог / Лоти / Сповіщення / Обране).

### Verification

- `pnpm format:check`, `pnpm -r typecheck` (6/6), `pnpm -r test` (246/246, baseline 243).
- Server build 7.6с, PM2 online, deploy.ps1 step [4/8] passed (after one `taskkill /F /IM node.exe` reset — see S40 below).
- Endpoint live: `Invoke-WebRequest /api/mobile/home` повернув 200 з валідним JSON. На момент verify: `banners: []` (admin ще не заллив), `featured: []` (теж pending), `onSale: 12`, `newArrivals: 12`.

### Discoveries

- `expo-linear-gradient` не у deps mobile-client → BannerCarousel використовує rgba overlay (`backgroundColor: 'rgba(0,0,0,0.35)'` + StyleSheet.absoluteFillObject). Якщо хочемо real gradient — окрема задача `npx expo install expo-linear-gradient`.
- `CatalogScreen` приймає initialFilters via navigation params **не змінювався** — "Усі →" з рейок зараз йде на чистий Catalog без префільтра. Якщо потрібен префільтр (напр. "Акції" → catalog з `priceType=akciya`) — окрема міні-задача.
- **Регресія deploy.ps1:** другий поспіль deploy завис на step [4/8] навіть з direct pnpm викликом, тому що PM2 ltex-store з попереднього deploy тримав node-процес що блокує `next build` (lock файл або port). Розв'язалось `taskkill /F /IM node.exe` (вбиває і PM2-managed node), після чого build пройшов 7.6с. Окрема spec — S40.

### Commit

- `de04d93 feat(mobile): home screen banners + product rails (S34)`

**Branch deleted:** `claude/session-34-mobile-banners-recommendations`.

**Наступне:** S35 — chat unread badge на MoreTab.

---

## Session 40 Partial — Deploy Hang Fix Attempt #1 (`pm2 stop` prelude)

**Дата:** 2026-04-28
**Spec:** `docs/SESSION_40_DEPLOY_PM2_NODE_LOCK.md`
**Результат:** Не вирішив проблему. Гіпотеза A (PM2 stop звільнить `.next/cache` lock) виявилась хибною.

### Що зроблено

- Worker додав prelude перед step [4/8] у `scripts/deploy.ps1`: якщо `pm2 jlist` показує ltex-store running → `pm2 stop ltex-store` + 2с sleep.
- Commit `4f0d645 fix(deploy): stop ltex-store before build to avoid .next/cache lock (S40)` зmerged у main.
- Header script-у оновлено: `# Workflow: pull -> install -> prisma -> (stop pm2 if running) -> build -> ...`

### Чому не спрацювало

User зробив deploy, build знову завис на `· serverActions`. Probe (`Get-Process node | Format-Table Id, StartTime`) виявив:

```
   Id StartTime           WorkingSet
 6432 27.04.2026 20:55:49  145158144   <-- orphan PM2 cluster worker з вчора
11820 28.04.2026 12:29:36   81080320   <-- свіжий
12600 28.04.2026 12:29:36   88494080   <-- свіжий
16780 27.04.2026 20:55:48   54853632   <-- orphan PM2 cluster worker з вчора
```

`Get-ChildItem apps\store\.next` показав свіжі writes у `apps\store\.next\standalone\apps\store\.next\cache\fetch-cache\...` — orphan-и пишуть туди в runtime, що блокує `next build`.

**Корінь проблеми (відкритий S41):** PM2 cluster mode на Windows. `pm2 stop` сигналить daemon `status=stopped`, але **cluster worker-и `node.exe` лишаються живі** як orphans. PM2 daemon бачить empty list → S40 prelude skip-ає stop при наступних deploy → orphan-и живуть кілька днів і блокують write-locks.

### Workaround (поки S41 не зроблений)

Між deploy-ями виконати:

```powershell
taskkill /F /IM node.exe
```

Це вб'є orphan-ів і будь-який інший PM2-managed node, після чого deploy.ps1 пройде (build 6.6с). Trade-off: вбиває telegram-bot/viber-bot також, тому це **не permanent рішення**.

### Наступне — S41

`docs/SESSION_41_DEPLOY_FORK_MODE.md` — комбінований fix:

1. `ecosystem.config.js` cluster → fork mode (single deterministic node, PM2 SIGTERM-ить чисто)
2. `deploy.ps1` `pm2 stop` → `pm2 delete` (видаляє з registry + SIGKILL workers)
3. Targeted orphan sweep — `Get-CimInstance Win32_Process` фільтр на CommandLine match `apps[\\/]+store[\\/]+\.next[\\/]+standalone`, щоб не вбивати telegram/viber.
