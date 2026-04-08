# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `main` (all work merged)

All work from Phase 0 through Phase 5 (Session 3) is complete and merged into main.

**IMPORTANT FOR NEW SESSIONS:** Do NOT re-audit or re-merge branches. All branches have been cleaned up — only `main` exists. The project is fully functional:

- Supabase DB: 805 products, 725 lots, 49 categories seeded
- Netlify: deploying from `main` at stalwart-dango-04a9b9.netlify.app
- Site is LIVE and working (catalog, lots, cart, admin, API routes)
- Session 3 completed: Viber notifications, recommendations, PWA, push notifications, SSE chat, BotFather menu, deploy scripts
- DO NOT repeat seed, merge, or infrastructure setup — it's all done

## What Exists Now

```
ltex-ecosystem/
├── .github/workflows/ci.yml        — typecheck + test + build on PR/push
├── turbo.json                       — build, dev, lint, typecheck, test, clean
├── apps/store/
│   ├── app/
│   │   ├── layout.tsx               — Root: lang="uk", metadataBase, OpenGraph, Twitter
│   │   ├── robots.ts                — Disallow /admin/, /api/, link sitemap
│   │   ├── manifest.ts              — PWA: name, theme #16a34a, icons
│   │   ├── sitemap.ts               — Dynamic sitemap (categories + products)
│   │   ├── (store)/                 — Public store (Header + Footer + CartProvider)
│   │   │   ├── page.tsx             — Homepage: hero, categories grid, features, CTA, JSON-LD
│   │   │   ├── about/page.tsx       — About page: assortment, quality, countries, contacts
│   │   │   ├── catalog/page.tsx     — All products with full-text search, filters, pagination
│   │   │   ├── catalog/[categorySlug]/page.tsx        — Category with subcategory chips
│   │   │   ├── catalog/[..]/[subcategorySlug]/page.tsx — Subcategory
│   │   │   ├── product/[slug]/page.tsx — Product detail: images, video, lots, prices, JSON-LD
│   │   │   ├── lots/page.tsx        — Lots browser with status filters, add-to-cart
│   │   │   ├── cart/page.tsx        — Cart + checkout form, min 10kg validation
│   │   │   ├── contacts/page.tsx    — Contact cards, LocalBusiness JSON-LD
│   │   │   ├── error.tsx            — Store error boundary
│   │   │   ├── not-found.tsx        — 404 page
│   │   │   └── */loading.tsx        — Skeleton loaders (catalog, lots, product)
│   │   ├── admin/                   — Admin panel (Sidebar + Toaster)
│   │   │   ├── page.tsx             — Dashboard: stats cards + charts (orders/30d, quality, lots)
│   │   │   ├── login/page.tsx       — Supabase Auth login
│   │   │   ├── products/            — CRUD: list, create, edit, delete, image upload
│   │   │   ├── lots/                — List + bulk status change (checkboxes + bulk bar)
│   │   │   ├── orders/              — List with status filters, inline status change
│   │   │   ├── categories/          — Tree view with CRUD
│   │   │   ├── customers/           — Customer list with order totals
│   │   │   ├── rates/               — Exchange rate management
│   │   │   ├── sync-log/page.tsx    — Sync log viewer with entity filters, JSON expand
│   │   │   ├── loading.tsx          — Admin skeleton
│   │   │   └── error.tsx            — Admin error boundary
│   │   └── api/
│   │       ├── cart/route.ts        — GET/POST/DELETE: server-side cart by sessionId
│   │       ├── orders/route.ts      — POST: Zod validation, $transaction, rate limiting, notifications
│   │       ├── search/route.ts      — GET: autocomplete (tsvector + trigram), rate limit 20/min
│   │       ├── telegram/webhook/route.ts — POST: Telegram bot webhook
│   │       ├── viber/webhook/route.ts    — POST: Viber bot webhook (HMAC-SHA256)
│   │       ├── mobile/
│   │       │   ├── auth/route.ts    — POST: register/login by phone
│   │       │   ├── profile/route.ts — GET/PUT: customer profile + stats
│   │       │   ├── favorites/route.ts — GET/POST/DELETE: wishlists
│   │       │   ├── chat/route.ts    — GET/POST/PUT: messages + mark read
│   │       │   ├── shipments/route.ts — GET/POST: Nova Poshta tracking
│   │       │   ├── notifications/route.ts — POST/DELETE: push tokens + video subs
│   │       │   ├── payments/route.ts — GET/POST: payment history
│   │       │   └── orders/route.ts  — GET: order history + detail
│   │       └── sync/
│   │           ├── products/route.ts — POST: Bearer auth, upsert, revalidatePath, rate limit
│   │           ├── lots/route.ts     — POST: Bearer auth, upsert, revalidatePath, rate limit
│   │           ├── rates/route.ts    — POST: Bearer auth, upsert, rate limit
│   │           └── orders/export/route.ts — GET: export orders for 1C
│   ├── components/
│   │   ├── header.tsx               — Sticky, mobile Sheet menu, CartBadge, nav (Каталог, Лоти, Про нас, Контакти)
│   │   ├── footer.tsx               — 4-col grid, categories, contacts
│   │   ├── store/                   — ProductCard, CatalogFilters (price range, clear all), Breadcrumbs, Pagination, AddToCartButton, CartBadge, ProductJsonLd, SearchAutocomplete
│   │   └── admin/                   — Sidebar (responsive), ConfirmDelete dialog, FunnelChart, TopProductsTable, RevenueChart, NewCustomersChart
│   ├── lib/
│   │   ├── catalog.ts               — getCatalogProducts() + fullTextSearch() (tsvector + trigram fallback) + autocompleteSearch()
│   │   ├── cart.tsx                  — CartProvider + useCart hook, localStorage + API sync by sessionId
│   │   ├── validations.ts           — Zod schemas (order, syncProduct, syncLots, syncRates)
│   │   ├── notifications.ts         — Telegram order notifications (TELEGRAM_BOT_TOKEN)
│   │   ├── rate-limit.ts            — In-memory sliding window rate limiter
│   │   └── supabase/                — server.ts, client.ts, middleware.ts
│   ├── middleware.ts                — Session refresh + /admin route protection
│   ├── vitest.config.ts             — Test config with @ alias
│   └── lib/validations.test.ts      — 28 API schema validation tests
├── packages/
│   ├── shared/
│   │   ├── src/constants/           — categories, quality, currency, business, seasons
│   │   ├── src/types/               — Product, Lot, Order, Customer, Price, ExchangeRate, LotStatus, OrderStatus
│   │   ├── src/utils/               — formatPrice, convertCurrency, transliterate, generateSlug
│   │   ├── src/utils/slug.test.ts   — 14 transliteration + slug tests
│   │   └── src/utils/price.test.ts  — 11 price formatting + conversion tests
│   ├── db/
│   │   ├── prisma/schema.prisma     — 19 tables (see Database Schema below)
│   │   ├── prisma/migrations/20260406_fts_gin_trigram/ — GIN + pg_trgm indexes
│   │   ├── prisma/seed.ts           — Upsert seed from JSON
│   │   ├── prisma/parse-excel.py    — Excel→JSON parser
│   │   ├── prisma/data/products.json — 805 real products
│   │   └── prisma/data/lots.json    — 725 real lots
│   └── ui/
│       ├── components/              — Button, Input, Badge, Card, Skeleton, Separator, Dialog, Sheet, Textarea, Toast, Toaster
│       └── lib/use-toast.ts         — useToast hook + toast() with success/destructive variants
├── services/
│   ├── telegram-bot/                — Standalone Telegram bot (polling + webhook)
│   │   └── src/                     — telegram.ts (API client), handlers.ts (commands), index.ts
│   └── viber-bot/                   — Standalone Viber bot (webhook only)
│       └── src/                     — viber.ts (API client + keyboards), handlers.ts (commands), index.ts
├── apps/mobile-client/              — Expo React Native client app (excluded from pnpm workspace)
│   ├── src/screens/                 — 8 screens: auth, catalog, product, cart, orders, chat, profile, shipments
│   ├── src/navigation/              — AppNavigator: bottom tabs + stack navigators
│   ├── src/lib/                     — API client, auth context + provider
│   └── src/components/              — ProductCard
├── e2e/                             — Playwright E2E tests
│   ├── navigation.spec.ts           — 7 tests (pages, nav links, 404)
│   ├── catalog.spec.ts              — 4 tests (products, filters, search, pagination)
│   ├── product.spec.ts              — 2 tests (nav to detail, required sections)
│   └── cart-checkout.spec.ts        — 4 tests (add lot, empty cart, validation, summary)
└── playwright.config.ts             — Chromium only, webServer: dev
```

### Database Schema (Prisma, 19 tables)

| Table               | Maps to 1C              | Key fields                                                                                |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| categories          | Групи номенклатури      | slug (unique), name, parentId (self-relation tree)                                        |
| products            | Номенклатура            | code1C, articleCode, slug, quality, season, priceUnit (kg/piece), averageWeight, videoUrl |
| product_images      | Зображення              | productId, url, position, alt                                                             |
| lots                | Серії + ТовариНаСкладах | barcode (unique), weight, quantity, status (free/reserved/on_sale), priceEur              |
| prices              | ЦіниНоменклатури        | productId, priceType (wholesale/retail/akciya), currency, amount                          |
| customers           | Контрагенти             | code1C, name, phone, email, telegram, city                                                |
| orders              | ЗаказПокупателя         | code1C, customerId, status, totalEur, exchangeRate                                        |
| order_items         | Табличні секції         | orderId, lotId, productId, priceEur, weight                                               |
| exchange_rates      | КурсиВалют              | currencyFrom, currencyTo, rate, date, source ("1c"/"manual")                              |
| barcodes            | ШтрихКоди               | lotId, code, type                                                                         |
| carts               | —                       | customerId (unique), sessionId (unique), items → CartItem[]                               |
| cart_items          | —                       | cartId, lotId, productId, priceEur, weight, quantity                                      |
| chat_messages       | —                       | customerId, sender ("customer"/"manager"), text, isRead                                   |
| shipments           | —                       | orderId, trackingNumber, carrier, status, statusText, estimatedDate                       |
| video_subscriptions | —                       | customerId, productId (unique pair)                                                       |
| push_tokens         | —                       | customerId, token (unique), platform ("ios"/"android"/"web")                              |
| payments            | —                       | orderId, method, amount, currency, status, externalId, paidAt                             |
| favorites           | —                       | customerId, productId (unique pair)                                                       |
| sync_log            | —                       | entity, entityId, action, payload (JSON), syncedAt                                        |

### Seed Data Stats (from real Excel files)

- **805 products**: 574 clothing, 147 footwear, 33 home, 26 accessories, 21 toys, 3 bric-a-brac, 1 cosmetics
- **725 lots**: 430 free, 265 on_sale, 30 reserved
- **Quality distribution**: first(201), mix(259), stock(151), extra(123), second(52), cream(19)
- **Price units**: 714 per kg, 91 per piece/pair
- **Seasons**: demiseason(217), summer(93), winter(112), none(383)
- **767/805 products** have YouTube video URLs

### Key Technical Decisions

1. **Exchange rate** — NOT hardcoded. Comes from 1C → exchange_rates table → API
2. **Product photos** — Will be stored in Supabase Storage, `imageUrls: string[]` field (empty for now)
3. **Price unit** — `priceUnit: "kg" | "piece"` field on Product (footwear = piece/pair)
4. **Categories** — Self-relation tree (parentId), not separate tables
5. **Next.js 15** (not 14) — Required for React 19 compatibility
6. **Font** — System font stack (Inter fallback), no Google Fonts at build time
7. **Slug generation** — Ukrainian transliteration (власна таблиця, не бібліотека)
8. **Full-text search** — PostgreSQL to_tsvector/to_tsquery via $queryRawUnsafe, 'simple' config for Ukrainian
9. **ISR caching** — `revalidate=60` on category pages, `revalidatePath` in sync routes
10. **Rate limiting** — In-memory sliding window (orders: 5/min, sync: 10/min per IP)
11. **Notifications** — Telegram bot via TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID env vars
12. **Zod schemas** — Extracted to `lib/validations.ts` for shared use between routes and tests
13. **Cart** — React Context + localStorage, no DB persistence yet

### Environment Variables Required

```env
DATABASE_URL=              # Supabase PostgreSQL connection string
NEXT_PUBLIC_SUPABASE_URL=  # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase anon key
NEXT_PUBLIC_SITE_URL=      # e.g. https://ltex.com.ua
SYNC_API_KEY=              # Bearer token for 1C sync API routes
TELEGRAM_BOT_TOKEN=        # (optional) Telegram bot for order notifications
TELEGRAM_CHAT_ID=          # (optional) Telegram chat for notifications
TELEGRAM_WEBHOOK_SECRET=   # (optional) Secret token for Telegram webhook verification
VIBER_AUTH_TOKEN=           # (optional) Viber bot auth token from partners.viber.com
VIBER_WEBHOOK_URL=          # (optional) URL for Viber webhook registration
NOVA_POSHTA_API_KEY=       # (optional) Nova Poshta API for shipment tracking
EXPO_PUBLIC_API_URL=       # (mobile) API base URL for Expo app
```

### Tests (53 unit + 17 E2E, all passing)

- `packages/shared/src/utils/slug.test.ts` — 14 tests (transliterate, generateSlug)
- `packages/shared/src/utils/price.test.ts` — 11 tests (formatPrice, convertCurrency)
- `apps/store/lib/validations.test.ts` — 28 tests (order, syncProduct, syncLots, syncRates schemas)

### URL Structure

- `/` — home
- `/catalog` — all products (full-text search, filters, pagination)
- `/catalog/[categorySlug]` — category
- `/catalog/[categorySlug]/[subcategorySlug]` — subcategory
- `/product/[slug]` — product detail
- `/lots` — lots browser
- `/cart` — cart + checkout
- `/about` — about page
- `/contacts` — contacts
- `/admin` — dashboard (protected)
- `/admin/products`, `/admin/lots`, `/admin/orders`, `/admin/categories`, `/admin/rates`, `/admin/customers`, `/admin/sync-log`

## Existing Systems (for reference)

### Existing Website (catalog-full repo)

- 4 static HTML files with hardcoded JS arrays
- ltexlutskai-tech/catalog-full — keep running until new store is ready

### Existing 1C System (Центральна 1С)

- Custom config based on "Управління Торгівлею"
- HTTP Service "Боти": POST /bots/ping, /bots/send, /bots/sendsecond, /bots/exchange
- Exchange Plans: ОбмінССайтомТоварами, ОбмінССайтомЗамовленнями
- 16 scheduled jobs including website sync, Viber integration

### 1C Integration Strategy

- 1C exports JSON files (products.json, lots.json, rates.json) every 15 min
- API Hub imports JSON via cron job, upserts into PostgreSQL
- Orders flow back: website → API → JSON/webhook → 1C HTTP service
- Existing exchange plans can be extended

### Existing Mobile App (MobileAgentLTEX v1.15.3)

- By Intrata, for field sales agents
- Syncs with central 1C via native protocol

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
- Phase 5: Optimization (recommendations, PWA icons, online payments via LiqPay/Monobank)

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

### Session 4 Analysis Report (2026-04-07)

#### Project Completion Status: ~85% MVP

| Component           | Completion | Details                                          |
| ------------------- | ---------- | ------------------------------------------------ |
| Монорепо структура  | 100%       | Turborepo + pnpm, 3 packages, 2 apps, 2 services |
| База даних          | 100%       | 19 таблиць, 805 products, 725 lots seeded        |
| Web Store           | 100%       | Каталог, пошук, кошик, checkout, SEO, PWA        |
| Admin Panel         | 100%       | Dashboard, CRUD, analytics, auth                 |
| API Layer           | 100%       | 18 ендпоінтів, rate limiting, validation         |
| Telegram Bot        | 100%       | Повний функціонал + webhook + BotFather          |
| Viber Bot           | 100%       | Повний функціонал + нотифікації                  |
| Mobile Client App   | 80%        | Екрани готові, потрібне тестування               |
| Тестування          | 70%        | 70 тестів (53 unit + 17 E2E), E2E вимкнені в CI  |
| 1С Інтеграція       | 60%        | API готовий, потрібна конфігурація 1С            |
| Deploy / Production | 60%        | Netlify працює, webhooks + фото не налаштовані   |
| Mobile Agent App    | 0%         | Окрема сесія, потрібні скріншоти                 |
| Warehouse App       | 0%         | Окрема сесія                                     |

#### Stats: 161 файлів TS/TSX, 18,082 рядків коду, 28 комітів, 19 Prisma моделей, 18 API routes

### Tasks for next session (Session 4)

**IMPORTANT:** Працювати на гілці `main`. НЕ створювати нову гілку.
**IMPORTANT:** НЕ повторювати seed, merge, або infrastructure setup — все вже зроблено.
**IMPORTANT:** L-TEX НЕ приймає онлайн-оплати. Таблиця `payments` — тільки для відображення історії з 1С.

#### Автономні задачі (не потребують участі користувача)

##### Задача 1: Збільшити тестове покриття (зараз 70% → ціль 90%)

Зараз: 53 unit тести (slug, price, validations). Немає тестів для ключової бізнес-логіки.

- Додати unit тести для `lib/recommendations.ts` — getRecommendations(), getFrequentlyBoughtTogether()
  - Mock Prisma client, перевірити: фільтрація по категорії/якості, сортування по лотах, ліміт
- Додати unit тести для `lib/notifications.ts` — sendTelegramNotification(), sendViberNotification(), notifyNewOrder()
  - Mock fetch, перевірити: формат повідомлення, обробка відсутніх env vars, Promise.allSettled
- Додати unit тести для `lib/push.ts` — sendPushNotification()
  - Mock fetch до Expo Push API, перевірити: batch sending, token deactivation на DeviceNotRegistered
- Додати unit тести для `lib/rate-limit.ts` — sliding window logic
  - Перевірити: ліміт спрацьовує, window sliding, різні IP
- Додати unit тести для `lib/cart.tsx` — CartProvider logic
  - Mock localStorage + API, перевірити: add/remove/clear, merge strategy, sessionId
- Додати unit тести для `lib/catalog.ts` — fullTextSearch(), autocompleteSearch()
  - Mock Prisma $queryRawUnsafe, перевірити: tsvector query, trigram fallback, sanitization
- **Файли:** створити `lib/recommendations.test.ts`, `lib/notifications.test.ts`, `lib/push.test.ts`, `lib/rate-limit.test.ts`, `lib/catalog.test.ts` в `apps/store/`
- **Ціль:** додати ~40-50 нових unit тестів

##### Задача 2: Покращити TypeScript strict mode і типізацію

- Перевірити всі файли на `any` типи і замінити на правильні типи
- Перевірити що `strict: true` в tsconfig.json для всіх packages
- Виправити всі TypeScript warnings/errors якщо є
- Переконатися що `pnpm typecheck` проходить без помилок

##### Задача 3: Покращити обробку помилок в API routes

- Перевірити всі 18 API routes на консистентну обробку помилок
- Додати proper HTTP status codes де відсутні (400, 401, 404, 429, 500)
- Переконатися що всі routes повертають JSON з полем `error` при помилці
- Перевірити rate limiting на всіх публічних routes (orders, search, cart)
- Додати request body size validation де відсутній

##### Задача 4: Покращити Mobile Client App

- Додати proper error handling на всіх екранах (try/catch + user-friendly повідомлення)
- Додати pull-to-refresh на CatalogScreen, OrdersScreen, ShipmentsScreen
- Додати empty states (коли немає товарів, замовлень, повідомлень)
- Додати skeleton loaders замість простих "Завантаження..." текстів
- Перевірити навігацію між екранами на консистентність
- Додати expo-notifications реєстрацію push token при першому запуску

##### Задача 5: Accessibility (a11y) покращення

- Додати `aria-label` на всі інтерактивні елементи без тексту (іконки, кнопки)
- Перевірити keyboard navigation на всіх сторінках store
- Додати `role` атрибути де потрібно (navigation, main, complementary)
- Перевірити color contrast для тексту на зеленому фоні (#16a34a)
- Додати skip-to-content link в header
- Додати focus-visible стилі де відсутні

##### Задача 6: SEO та Performance оптимізація

- Перевірити всі сторінки на наявність proper `<title>` та `<meta description>`
- Додати `<meta>` для Open Graph зображень на category та product сторінках
- Оптимізувати SQL запити в catalog.ts — перевірити N+1 проблеми, додати includes де потрібно
- Перевірити що ISR revalidation працює правильно на всіх сторінках
- Додати `rel="canonical"` на сторінках з пагінацією
- Перевірити sitemap.ts — чи всі продукти та категорії включені

##### Задача 7: CI/CD покращення

- Увімкнути E2E тести в GitHub Actions (з mock DATABASE_URL або test DB)
- Додати lint step в CI pipeline (зараз тільки typecheck + test + build)
- Додати cache для pnpm store в CI для швидших builds
- Додати перевірку розміру bundle (next build --analyze або similar)

##### Задача 8: Code quality та рефакторинг

- Видалити невикористаний код (dead imports, unused variables)
- Перевірити консистентність error messages (українською для UI, англійською для API)
- Перевірити що всі Zod schemas в validations.ts покривають всі API routes
- Додати Zod validation для mobile API routes де відсутній
- Перевірити що всі admin actions мають proper auth checks

#### Порядок виконання: 1 → 2 → 8 → 3 → 4 → 5 → 6 → 7

(Тести першими — вони виявлять баги; потім типізація; потім якість коду і API; mobile; a11y; SEO; CI останнім)

#### Задачі що потребують участі користувача (НЕ для автономної сесії)

- **Mobile Agent App** — потрібні скріншоти MobileAgentLTEX v1.15.3
- **Warehouse App** — потрібні вимоги та скріншоти
- **Інфраструктура** — запуск міграцій, реєстрація webhooks, завантаження фото (потрібен доступ до Supabase/Netlify)
- **1С інтеграція** — налаштування на стороні 1С (HTTP Service, Exchange Plans, cron)
- **Кастомний домен** — ltex.com.ua (потрібен доступ до DNS)

## Tech Stack

- Monorepo: Turborepo + pnpm 9.x
- Language: TypeScript 5.x (strict)
- Web: Next.js 15 (App Router) + React 19
- Styles: Tailwind CSS 3.4 + shadcn/ui + Radix
- Database: PostgreSQL (Supabase)
- ORM: Prisma 6.x
- Auth: Supabase Auth
- Files: Supabase Storage
- Testing: Vitest
- CI/CD: GitHub Actions (test + typecheck + build)
- Hosting: Netlify (stalwart-dango-04a9b9.netlify.app)

## Important Notes

- Language: Ukrainian (primary), site lang="uk"
- Currency: EUR for wholesale prices, UAH for display (rate from 1C)
- Minimum order: від 10 кг
- Products have YouTube video reviews (767/805)
- Quality levels: Екстра, Крем, 1й сорт, 2й сорт, Сток, Мікс
- Lots (мішки/bags) have individual barcodes, weight, quantity, YouTube videos
- Price per kg (most products) OR per piece/pair (footwear, 91 items)
- Assortment: секонд хенд, СТОК, іграшки, Bric-a-Brac, косметика
