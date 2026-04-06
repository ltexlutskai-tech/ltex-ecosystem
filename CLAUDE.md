# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `claude/setup-supabase-auth-VBzJp`

All work from Phase 0 through Phase 4 + Viber bot is complete and pushed.

### Commits (newest first)
- `25b5f97` — Viber bot: same functionality as Telegram bot (keyboard menus, search, lots, orders)
- `4eab0c9` — Linter improvements to AppNavigator and ShipmentsScreen
- `b638a3c` — Linter fixes to ProfileScreen
- `b697799` — Phase 4: Mobile client app (Expo RN) + 8 mobile API routes + 7 new DB tables
- `194e619` — Phase 3: Telegram bot (search, lots, orders, inline query, webhook)
- `0944493` — Fix: remove orphaned cart-client.tsx
- `c39e06b` — Cart persistence in DB, full-text search v2, admin analytics, E2E tests
- `7aef9ff` — CLAUDE.md update with full project status
- `cfdd338` — Full-text search, price filter, dashboard charts, about page, rate limiting, ISR
- `e902ecb` — SEO (robots.ts, manifest.ts, OpenGraph), Telegram notifications, CI tests
- `f29e0e9` — Unit tests (53 tests: shared utils + API validation schemas)
- `05c6767` — Toast notifications, sync log viewer, bulk lot operations
- `86923ee` — UX improvements: mobile, Zod validation, accessibility, error handling
- `ccc7cb9` — Phase 1: Store MVP (catalog, product, lots, cart, checkout, SEO)
- `4ca0feb` — Phase 2: Admin panel, Supabase Auth, 1C sync API

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

| Table | Maps to 1C | Key fields |
|-------|-----------|------------|
| categories | Групи номенклатури | slug (unique), name, parentId (self-relation tree) |
| products | Номенклатура | code1C, articleCode, slug, quality, season, priceUnit (kg/piece), averageWeight, videoUrl |
| product_images | Зображення | productId, url, position, alt |
| lots | Серії + ТовариНаСкладах | barcode (unique), weight, quantity, status (free/reserved/on_sale), priceEur |
| prices | ЦіниНоменклатури | productId, priceType (wholesale/retail/akciya), currency, amount |
| customers | Контрагенти | code1C, name, phone, email, telegram, city |
| orders | ЗаказПокупателя | code1C, customerId, status, totalEur, exchangeRate |
| order_items | Табличні секції | orderId, lotId, productId, priceEur, weight |
| exchange_rates | КурсиВалют | currencyFrom, currencyTo, rate, date, source ("1c"/"manual") |
| barcodes | ШтрихКоди | lotId, code, type |
| carts | — | customerId (unique), sessionId (unique), items → CartItem[] |
| cart_items | — | cartId, lotId, productId, priceEur, weight, quantity |
| chat_messages | — | customerId, sender ("customer"/"manager"), text, isRead |
| shipments | — | orderId, trackingNumber, carrier, status, statusText, estimatedDate |
| video_subscriptions | — | customerId, productId (unique pair) |
| push_tokens | — | customerId, token (unique), platform ("ios"/"android"/"web") |
| payments | — | orderId, method, amount, currency, status, externalId, paidAt |
| favorites | — | customerId, productId (unique pair) |
| sync_log | — | entity, entityId, action, payload (JSON), syncedAt |

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

### Prerequisites before deploying
- [ ] Create Supabase project → get DATABASE_URL, SUPABASE_URL, ANON_KEY
- [ ] Run `prisma db push` + `pnpm db:seed` to populate database
- [ ] Run migration: `packages/db/prisma/migrations/20260406_fts_gin_trigram/migration.sql`
- [ ] Upload product photos to Supabase Storage (can be parallel)
- [ ] Set SYNC_API_KEY for 1C integration
- [ ] (Optional) Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for order notifications
- [ ] (Optional) Set VIBER_AUTH_TOKEN + register webhook for Viber bot
- [ ] (Optional) Set NOVA_POSHTA_API_KEY for shipment tracking
- [ ] (Optional) Add PWA icons: /public/icon-192.png, /public/icon-512.png
- [ ] Install mobile app deps: `cd apps/mobile-client && npx expo install`

### What was done in this session (Session 2)

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

### Tasks for next session

#### Session 3: Phase 5 (Optimization) + Viber bot + Deploy prep

**IMPORTANT Business Context:** L-TEX НЕ приймає онлайн-оплати. Клієнти роблять замовлення → менеджер отримує нотифікацію → менеджер формує реалізацію та оплату в 1С. Тому НЕ потрібно: LiqPay, Monobank, online payment gateway. Таблиця `payments` використовується тільки для відображення історії оплат клієнту (дані з 1С).

##### Задача 1: Viber бот — нотифікації замовлень (як в Telegram)
Зараз: Telegram бот надсилає нотифікацію менеджеру при новому замовленні (`lib/notifications.ts`). Viber бот тільки відповідає на команди.
- Додати `notifyViberNewOrder()` в `lib/notifications.ts`
- Додати env var `VIBER_ADMIN_USER_ID` — ID менеджера в Viber для нотифікацій
- Викликати в `/api/orders/route.ts` поряд з Telegram нотифікацією
- Формат: такий самий як Telegram (клієнт, телефон, позицій, вага, сума)

##### Задача 2: Smart product recommendations
Зараз: на сторінці товару немає рекомендацій.
- Створити `lib/recommendations.ts` з функцією `getRecommendations(productId, limit=6)`
- Алгоритм: товари тієї ж категорії + якості, або тієї ж категорії іншої якості, ordered by lot count DESC (пріоритет: є вільні лоти)
- Додати секцію "Схожі товари" на сторінку `/product/[slug]` (після лотів, перед footer)
- Компонент: горизонтальна сітка 2-3 карток з ProductCard
- Також показувати "Часто купують разом" — товари з тих самих замовлень (order_items GROUP BY productId WHERE orderId IN orders_with_this_product)

##### Задача 3: PWA іконки + offline fallback
Зараз: `manifest.ts` є, але іконок немає (`/public/icon-192.png`, `/public/icon-512.png`).
- Створити SVG іконку L-TEX (зелений #16a34a, літери "LT") і конвертувати в PNG 192x192 та 512x512
- Або створити простий placeholder-іконки через CSS/Canvas
- Додати `<link rel="apple-touch-icon">` в layout.tsx
- Додати `public/offline.html` — проста сторінка "Немає з'єднання"
- Додати Service Worker реєстрацію для offline fallback (Next.js PWA з `next-pwa` або `@serwist/next`)

##### Задача 4: Push notifications (Expo)
Зараз: таблиця `push_tokens` є, `/api/mobile/notifications` API є, але фактичне відправлення push немає.
- Додати `lib/push.ts` з функцією `sendPushNotification(customerId, title, body, data?)`
- Використовувати Expo Push API (`https://exp.host/--/api/v2/push/send`)
- Викликати при: нове повідомлення в чаті від менеджера, зміна статусу замовлення, нове відео по підписці
- В мобільному додатку: зареєструвати push token при першому запуску (`expo-notifications`)

##### Задача 5: Real-time чат (замість polling)
Зараз: ChatScreen опитує `/api/mobile/chat` кожні 10 сек. Це неефективно.
- Варіант A: Supabase Realtime (subscribe на `chat_messages` table changes)
- Варіант B: Server-Sent Events (SSE) endpoint `/api/mobile/chat/stream`
- Варіант C: Залишити polling, але зменшити інтервал до 3 сек тільки коли чат відкритий
- Обрати найпростіший варіант який не потребує додаткової інфраструктури

##### Задача 6: BotFather меню для Telegram
- Створити скрипт `services/telegram-bot/src/setup-commands.ts`
- Який через Telegram API (`setMyCommands`) реєструє меню:
  - /search — Пошук товарів
  - /lots — Доступні лоти (мішки)
  - /order — Статус замовлення
  - /categories — Категорії товарів
  - /help — Допомога
- Запускати один раз: `tsx services/telegram-bot/src/setup-commands.ts`

##### Задача 7: Deploy preparation
- Оновити `.env.example` файли з усіма новими env vars
- Додати `scripts/deploy-checklist.md` з покроковою інструкцією
- Перевірити що `prisma db push` працює без помилок
- Додати `scripts/register-webhooks.ts` — скрипт для реєстрації Telegram + Viber webhooks
- Перевірити що build проходить на чистому Node.js 20 (без локального кешу)

##### Задача 8 (окрема сесія, потрібні скріншоти): Mobile agent + warehouse
- Потрібні скріншоти MobileAgentLTEX v1.15.3
- Кожен розділ і блок додатку розбирати окремо
- Побудувати точну копію функціоналу на Expo React Native
- Інтеграція з 1С HTTP Service "Боти"

#### Порядок виконання в Session 3: 1 → 6 → 2 → 3 → 4 → 5 → 7
(Viber нотифікації першим, бо просте; BotFather теж швидке; рекомендації незалежні; PWA та push — більш складні; real-time чат останнім)

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
- Hosting: Vercel

## Important Notes
- Language: Ukrainian (primary), site lang="uk"
- Currency: EUR for wholesale prices, UAH for display (rate from 1C)
- Minimum order: від 10 кг
- Products have YouTube video reviews (767/805)
- Quality levels: Екстра, Крем, 1й сорт, 2й сорт, Сток, Мікс
- Lots (мішки/bags) have individual barcodes, weight, quantity, YouTube videos
- Price per kg (most products) OR per piece/pair (footwear, 91 items)
- Assortment: секонд хенд, СТОК, іграшки, Bric-a-Brac, косметика
