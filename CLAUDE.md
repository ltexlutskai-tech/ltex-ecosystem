# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `main` (all work merged through Session 7)

All work from Phase 0 through Session 7 is complete and merged into main (44 commits).

**IMPORTANT FOR NEW SESSIONS:** Do NOT re-audit or re-merge branches. The project is fully functional:

- Supabase DB: 805 products, 725 lots, 49 categories seeded
- Netlify: deploying from `main` at stalwart-dango-04a9b9.netlify.app
- Site is LIVE and working (catalog, lots, cart, admin, API routes)
- Session 4 completed: 114 unit tests, TypeScript strict (0 any), Zod validation, a11y, SEO, CI Prettier
- Session 5 completed: mobile polish, 36 E2E tests, admin UX (sort/CSV/breadcrumbs), security headers, bot commands, docs
- Session 6 completed: admin pagination/filters, image gallery, order flow, i18n, real-time admin, store UX (quick view/wishlist/comparison/recently viewed), integration tests
- Session 7 completed: i18n all pages, email notifications, analytics dashboard, SEO structured data, mobile auth guards + deep linking, performance (infinite scroll, bundle analyzer), context provider tests
- DO NOT repeat seed, merge, or infrastructure setup — it's all done
- DO NOT re-run Session 4, 5, 6, or 7 tasks — ALL DONE

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
│   │   ├── (store)/                 — Public store (Header + Footer + CartProvider + Wishlist + RecentlyViewed + Comparison)
│   │   │   ├── page.tsx             — Homepage: hero, categories grid, features, CTA, JSON-LD, recently viewed
│   │   │   ├── about/page.tsx       — About page: assortment, quality, countries, contacts
│   │   │   ├── catalog/page.tsx     — All products with full-text search, filters, pagination
│   │   │   ├── catalog/[categorySlug]/page.tsx        — Category with subcategory chips
│   │   │   ├── catalog/[..]/[subcategorySlug]/page.tsx — Subcategory
│   │   │   ├── product/[slug]/page.tsx — Product detail: ImageGallery, video, lots, prices, JSON-LD
│   │   │   ├── lots/page.tsx        — Lots browser with status filters, add-to-cart
│   │   │   ├── cart/page.tsx        — Cart + checkout form, min 10kg validation
│   │   │   ├── contacts/page.tsx    — Contact cards, LocalBusiness JSON-LD
│   │   │   ├── order/[id]/confirmation/page.tsx — Order confirmation after checkout
│   │   │   ├── order/[id]/status/page.tsx       — Order status tracking (timeline)
│   │   │   ├── compare/page.tsx     — Side-by-side product comparison (max 3)
│   │   │   ├── wishlist/page.tsx    — Wishlist page (localStorage)
│   │   │   ├── error.tsx            — Store error boundary
│   │   │   ├── not-found.tsx        — 404 page
│   │   │   └── */loading.tsx        — Skeleton loaders (catalog, lots, product)
│   │   ├── admin/                   — Admin panel (Sidebar + Toaster + NotificationBell + AutoRefresh)
│   │   │   ├── page.tsx             — Dashboard: stats cards + charts + auto-refresh (30s)
│   │   │   ├── login/page.tsx       — Supabase Auth login
│   │   │   ├── products/            — CRUD: list, create, edit, image upload + pagination + filters (name/category/quality)
│   │   │   ├── lots/                — List + bulk status + pagination + filters (status/quality/price range)
│   │   │   ├── orders/              — List + filters + expandable detail rows + manager notes
│   │   │   ├── categories/          — Tree view with CRUD
│   │   │   ├── customers/           — Customer list + search (name/phone/city)
│   │   │   ├── rates/               — Exchange rate management
│   │   │   ├── sync-log/page.tsx    — Sync log viewer with entity filters, JSON expand
│   │   │   ├── loading.tsx          — Admin skeleton
│   │   │   └── error.tsx            — Admin error boundary
│   │   └── api/
│   │       ├── admin/stats/route.ts  — GET: real-time dashboard stats for auto-refresh
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
│   │   ├── store/                   — ProductCard, CatalogFilters, Breadcrumbs, Pagination, AddToCartButton, CartBadge, ProductJsonLd, SearchAutocomplete, ImageGallery, QuickView, WishlistButton, WishlistBadge, ComparisonButton, ComparisonBar, RecentlyViewedSection, TrackProductView
│   │   └── admin/                   — Sidebar, ConfirmDelete, Charts, SortHeader, ExportCSV, AdminBreadcrumbs, AdminPagination, FilterSelect, NotificationBell, OrdersBadge, AutoRefresh, OrderDetailRow, PriceRangeFilter
│   ├── lib/
│   │   ├── catalog.ts               — getCatalogProducts() + fullTextSearch() (tsvector + trigram fallback) + autocompleteSearch()
│   │   ├── cart.tsx                  — CartProvider + useCart hook, localStorage + API sync by sessionId
│   │   ├── validations.ts           — Zod schemas (order, syncProduct, syncLots, syncRates + mobile)
│   │   ├── notifications.ts         — Telegram + Viber order notifications
│   │   ├── rate-limit.ts            — In-memory sliding window rate limiter
│   │   ├── admin-stats.ts           — Dashboard SQL queries (extracted from page.tsx)
│   │   ├── admin-auth.ts            — Auth guard for admin server actions
│   │   ├── i18n/                    — uk.ts dictionary (180 strings), index.ts with t() + interpolation
│   │   ├── wishlist.tsx             — WishlistProvider + useWishlist hook (localStorage)
│   │   ├── recently-viewed.tsx      — RecentlyViewedProvider + useRecentlyViewed hook (localStorage)
│   │   ├── comparison.tsx           — ComparisonProvider + useComparison hook (max 3 items)
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
│   ├── src/lib/                     — API client, auth context + provider, push notifications
│   └── src/components/              — ProductCard, SkeletonLoader, OfflineBanner
├── e2e/                             — Playwright E2E tests (36 total, enabled in CI)
│   ├── navigation.spec.ts           — 7 tests (pages, nav links, 404)
│   ├── catalog.spec.ts              — 4 tests (products, filters, search, pagination)
│   ├── product.spec.ts              — 2 tests (nav to detail, required sections)
│   ├── cart-checkout.spec.ts        — 4 tests (add lot, empty cart, validation, summary)
│   ├── admin.spec.ts                — admin login, dashboard, navigation
│   ├── lots.spec.ts                 — lots page, status filters
│   ├── search.spec.ts               — search autocomplete, results
│   ├── responsive.spec.ts           — mobile viewport, menu sheet, touch targets
│   └── about-contacts.spec.ts       — about page, contacts page
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

### Tests (139 unit + 36 E2E, all passing)

**Unit tests (12 files, 139 tests):**

- `packages/shared/src/utils/slug.test.ts` — 14 tests (transliterate, generateSlug)
- `packages/shared/src/utils/price.test.ts` — 11 tests (formatPrice, convertCurrency)
- `apps/store/lib/validations.test.ts` — 28+ tests (order, syncProduct, syncLots, syncRates + mobile schemas)
- `apps/store/lib/recommendations.test.ts` — recommendations + frequently bought together
- `apps/store/lib/notifications.test.ts` — Telegram, Viber notifications, notifyNewOrder
- `apps/store/lib/push.test.ts` — Expo Push API, batch sending, token deactivation
- `apps/store/lib/rate-limit.test.ts` — sliding window, IP tracking, window expiry
- `apps/store/lib/catalog.test.ts` — fullTextSearch, autocomplete, trigram fallback, sanitization
- `apps/store/app/api/orders/route.test.ts` — 17 tests (order creation, validation, rate limiting)
- `apps/store/app/api/cart/route.test.ts` — 6 tests (CRUD, session handling)
- `apps/store/app/api/search/route.test.ts` — 11 tests (autocomplete, rate limiting, edge cases)
- `apps/store/lib/i18n/i18n.test.ts` — 16 tests (translation lookup, interpolation, missing keys)

**E2E tests (9 files, 36 tests, enabled in CI):**

- `e2e/navigation.spec.ts` — pages, nav links, 404
- `e2e/catalog.spec.ts` — products, filters, search, pagination
- `e2e/product.spec.ts` — nav to detail, required sections
- `e2e/cart-checkout.spec.ts` — add lot, empty cart, validation, summary
- `e2e/admin.spec.ts` — login, dashboard, navigation
- `e2e/lots.spec.ts` — lots page, status filters
- `e2e/search.spec.ts` — search autocomplete, results
- `e2e/responsive.spec.ts` — mobile viewport, menu sheet, touch targets
- `e2e/about-contacts.spec.ts` — about page, contacts page

### URL Structure

- `/` — home (+ recently viewed section)
- `/catalog` — all products (full-text search, filters, pagination)
- `/catalog/[categorySlug]` — category
- `/catalog/[categorySlug]/[subcategorySlug]` — subcategory
- `/product/[slug]` — product detail (ImageGallery, recommendations)
- `/lots` — lots browser
- `/cart` — cart + checkout
- `/order/[id]/confirmation` — order confirmation after checkout
- `/order/[id]/status` — order status tracking (timeline, no auth)
- `/compare` — product comparison (max 3)
- `/wishlist` — saved products (localStorage)
- `/about` — about page
- `/contacts` — contacts
- `/admin` — dashboard (protected, auto-refresh 30s, notification bell)
- `/admin/products` — paginated + search by name/category/quality
- `/admin/lots` — paginated + filter by status/quality/price
- `/admin/orders` — expandable detail rows + manager notes
- `/admin/customers` — search by name/phone/city
- `/admin/categories`, `/admin/rates`, `/admin/sync-log`

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
- **Phase 5: Optimization** — COMPLETED (recommendations, PWA icons+offline, push notifications, SSE chat, Viber notifications)
- **Session 4: Quality & Testing** — COMPLETED (114 tests, TypeScript strict, API errors, a11y, SEO, CI Prettier, mobile error handling)
- **Session 5: Polish & Hardening** — COMPLETED (mobile skeleton/offline/push, 36 E2E, admin sort/CSV/breadcrumbs, security headers, bot /prices+/new, README)
- **Session 6: Features & UX** — COMPLETED (admin pagination/filters, image gallery, order flow, i18n prep, real-time admin, store UX, integration tests)
- **Session 7: i18n, Email, Analytics, SEO, Performance** — COMPLETED (i18n all pages, email lib, analytics dashboard, SEO JSON-LD, mobile guards+deep linking, infinite scroll, 161 tests)
- **Session 8: CI Fix & Production Hardening** — COMPLETED (Prettier 37 files, TypeScript 41 errors, nodemailer, Prisma schema fix, env validation, fetch timeouts, CI all green)

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

| Component           | Completion | Details                                                                                       |
| ------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| Монорепо структура  | 100%       | Turborepo + pnpm, 3 packages, 2 apps, 2 services                                              |
| База даних          | 100%       | 19 таблиць, 805 products, 725 lots seeded                                                     |
| Web Store           | 100%       | Каталог, пошук, кошик, checkout, SEO, PWA, wishlist, compare, infinite scroll                 |
| Admin Panel         | 100%       | Dashboard + analytics (8 charts, period filter), CRUD, sort/filter/paginate, CSV, real-time   |
| API Layer           | 100%       | 20 ендпоінтів, rate limiting, Zod validation, consistent errors                               |
| Telegram Bot        | 100%       | 7 commands + inline query + webhook + pagination                                              |
| Viber Bot           | 100%       | 7 commands + keyboard menus + notifications                                                   |
| Mobile Client App   | 95%        | Повний функціонал + auth guards + deep linking + splash screen                                |
| Тестування          | 95%        | 161 unit + 36 E2E = 197, all passing, E2E enabled in CI                                       |
| i18n                | 95%        | Dictionary (250 keys) + t() connected to all pages                                            |
| Email               | 90%        | Dual transport (SMTP/Resend), needs env var configuration                                     |
| Order Flow          | 95%        | Checkout → confirmation → status tracking → email → admin notes                               |
| Accessibility       | 90%        | skip-to-content, aria-labels, focus-visible, keyboard nav                                     |
| SEO                 | 98%        | canonical, OG, JSON-LD (5 types), hreflang, sitemap, meta                                     |
| Security            | 90%        | CSP headers, auth guards, rate limiting, webhook validation                                   |
| CI/CD               | 100%       | typecheck + test + build + Prettier — all green (fixed Session 8) |
| Performance         | 90%        | Infinite scroll, lazy images, bundle analyzer, ISR                                            |
| Documentation       | 90%        | README, CONTRIBUTING, .env.example, deploy checklist                                          |
| 1С Інтеграція       | 60%        | API готовий, потрібна конфігурація 1С                                                         |
| Deploy / Production | 60%        | Netlify працює, webhooks + фото не налаштовані                                                |
| Mobile Agent App    | 0%         | Окрема сесія, потрібні скріншоти                                                              |
| Warehouse App       | 0%         | Окрема сесія                                                                                  |

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

| Задача | Статус | Деталі |
|--------|--------|--------|
| 1. Prettier форматування | **ГОТОВО** | 37 файлів переформатовано |
| 2. TypeScript помилки | **ГОТОВО** | 41+ помилка виправлена в 12 файлах |
| 3. Перевірка build | **ГОТОВО** | Build проходить з placeholder DB |
| 4. Валідація env | **ГОТОВО** | `instrumentation.ts` попереджає про відсутні env vars |
| 5. Стійкість до помилок | **ГОТОВО** | 10с таймаути на fetch для Telegram/Viber/Resend API |
| 6. Аудит Prisma запитів | **ГОТОВО** | Всі 11 файлів із запитами замовлень перевірені |
| 7. Фінальна CI перевірка | **ГОТОВО** | Всі 4 кроки проходять |

#### Ключові виправлення:

| Фікс | Файли |
|------|-------|
| Встановлено `nodemailer` + `@types/nodemailer` | `package.json`, `pnpm-lock.yaml` |
| Додано зв'язок `product` до `OrderItem` в Prisma schema | `schema.prisma` |
| Виправлено scope бага `statusLabel`/`orderRef` | `admin/orders/actions.ts` |
| Виправлено пріоритет операторів `??`/`||` | `compare/page.tsx` |
| Додано null guards для `currentImage` | `image-gallery.tsx` |
| Виправлено non-null assertions в тестах | 3 тест-файли |
| Експортовано інтерфейси admin-stats (TS4058) | `admin-stats.ts` |
| Видалено `ssr: false` із Server Components | `layout.tsx`, `product-card.tsx` |
| Додано `force-dynamic` на головну сторінку | `page.tsx` |
| Додано `instrumentation.ts` для валідації env | Новий файл |
| Додано fetch таймаути (10с) | `notifications.ts`, `email.ts` |

#### Результати CI:

| Крок | Результат |
|------|-----------|
| `pnpm format:check` | **PASS** — всі файли відформатовані |
| `pnpm test` | **PASS** — 186 тестів (25 shared + 161 store) |
| `pnpm typecheck` | **PASS** — 0 помилок, 6/6 пакетів |
| `pnpm build` | **PASS** — 33 маршрути скомпільовані |

#### Метрики:

| Метрика | До Session 8 | Після Session 8 |
|---------|--------------|-----------------|
| CI статус | ЗЛАМАНИЙ (3 кроки fail) | **ВСЕ ЗЕЛЕНЕ** (4/4 pass) |
| TypeScript помилки | 41 | **0** |
| Prettier проблеми | 37 файлів | **0** |
| Build | FAIL (nodemailer) | **PASS** |
| Новий файл | — | `instrumentation.ts` (env validation) |
| Змінено файлів | — | 47 (+505/-385 рядків) |
| Total commits | 44 | **45** |

#### Статус проекту: ~99% MVP

| Компонент | Завершеність | Деталі |
|-----------|-------------|--------|
| Монорепо структура | 100% | Turborepo + pnpm, 3 packages, 2 apps, 2 services |
| База даних | 100% | 19 таблиць, 805 products, 725 lots seeded |
| Web Store | 100% | Каталог, пошук, кошик, checkout, SEO, PWA, wishlist, compare, infinite scroll |
| Admin Panel | 100% | Dashboard + analytics (8 charts), CRUD, sort/filter/paginate, CSV, real-time |
| API Layer | 100% | 20 ендпоінтів, rate limiting, Zod validation, consistent errors |
| Telegram Bot | 100% | 7 commands + inline query + webhook + pagination |
| Viber Bot | 100% | 7 commands + keyboard menus + notifications |
| Mobile Client App | 95% | Повний функціонал + auth guards + deep linking + splash screen |
| Тестування | 95% | 186 unit + 36 E2E = 222, all passing |
| i18n | 95% | Dictionary (250 keys) + t() connected to all pages |
| Email | 95% | Dual transport (SMTP/Resend), graceful fallback if not configured |
| Order Flow | 95% | Checkout → confirmation → status tracking → email → admin notes |
| Accessibility | 90% | skip-to-content, aria-labels, focus-visible, keyboard nav |
| SEO | 98% | canonical, OG, JSON-LD (5 types), hreflang, sitemap, meta |
| Security | 95% | CSP headers, auth guards, rate limiting, webhook validation, fetch timeouts |
| CI/CD | 100% | typecheck + test + build + Prettier — all green |
| Performance | 90% | Infinite scroll, lazy images, bundle analyzer, ISR |
| Production Hardening | 90% | Env validation, error resilience, fetch timeouts |
| Documentation | 90% | README, CONTRIBUTING, .env.example, deploy checklist |
| 1С Інтеграція | 60% | API готовий, потрібна конфігурація 1С |
| Deploy / Production | 60% | Netlify працює, webhooks + фото не налаштовані |
| Mobile Agent App | 0% | Окрема сесія, потрібні скріншоти |
| Warehouse App | 0% | Окрема сесія |

### Branch Cleanup (pending)

| Branch | Status |
|--------|--------|
| `claude/audit-ltex-ecosystem-cTLpW` | Merged, remote delete pending (GitHub UI) |
| `claude/session-4-tasks-EV62w` | Merged, remote delete pending |
| `claude/session-5-tasks-fcREm` | Merged, remote delete pending |
| `claude/admin-gallery-orders-WDIWr` | Merged, remote delete pending |
| `claude/add-i18n-email-analytics-Xz9Ua` | Merged, remote delete pending |
| `claude/fix-ci-pipeline-mzwgS` | Merged, remote delete pending |

**ACTION REQUIRED:** Delete 6 branches via GitHub UI.

### Tasks for next session (Session 9)

**IMPORTANT:** НЕ повторювати seed, merge, або infrastructure setup — все вже зроблено.
**IMPORTANT:** НЕ повторювати задачі Session 4-8 — ВСЕ ЗРОБЛЕНО. Дивись completion reports вище.
**IMPORTANT:** L-TEX НЕ приймає онлайн-оплати. Таблиця `payments` — тільки для відображення історії з 1С.
**IMPORTANT:** CI тепер зелений (format + test + typecheck + build). НЕ ламати CI.

Session 9 tasks will be defined by the orchestrator.

#### Задачі що потребують участі користувача (НЕ для автономної сесії)

- **Видалити merged branches** — 6 branches через GitHub UI (див. Branch Cleanup вище)
- **Mobile Agent App** — потрібні скріншоти MobileAgentLTEX v1.15.3
- **Warehouse App** — потрібні вимоги та скріншоти
- **Інфраструктура** — запуск міграцій, реєстрація webhooks, завантаження фото (потрібен доступ до Supabase/Netlify)
- **1С інтеграція** — налаштування на стороні 1С (HTTP Service, Exchange Plans, cron)
- **Кастомний домен** — ltex.com.ua (потрібен доступ до DNS)

## Orchestration Workflow

### Session Types

**Orchestrator** — управляє проектом, НЕ кодить:

- Review та merge feature branches в main
- Видалення merged branches
- Перевірка CI/deploy статусу
- Оновлення CLAUDE.md (звіти, задачі)
- Планування задач для worker-сесій

**Worker** — кодить, НЕ управляє:

- Виконує задачі з "Tasks for next session" в CLAUDE.md
- Автоматично створює feature branch (це нормально)
- Пушить результат на свою гілку
- НЕ мерджить в main — це робить orchestrator

### Процес

```
Orchestrator: план → CLAUDE.md → push main
    ↓
Worker: читає CLAUDE.md → кодить → push feature branch
    ↓
Orchestrator: review → merge → cleanup → новий план
```

### Worker Session Checklist (для orchestrator після кожної worker-сесії)

- [ ] `git fetch origin` — знайти нову гілку
- [ ] `git log origin/<branch> --oneline` — переглянути коміти
- [ ] `git diff main..origin/<branch> --stat` — переглянути зміни
- [ ] `git merge origin/<branch>` — merge в main
- [ ] `git push origin main` — push main
- [ ] `git push origin --delete <branch>` — видалити merged branch
- [ ] Перевірити CI — green?
- [ ] Оновити CLAUDE.md — звіт + нові задачі

### Infrastructure Status (потребує доступу користувача)

| Задача                                    | Статус  | Що потрібно                                   |
| ----------------------------------------- | ------- | --------------------------------------------- |
| Netlify deploy branch = main              | DONE    | —                                             |
| Netlify env: DATABASE_URL, SUPABASE       | DONE    | —                                             |
| Netlify env: NEXT_PUBLIC_SITE_URL         | PENDING | Додати в Netlify Dashboard                    |
| Netlify env: SYNC_API_KEY                 | PENDING | `openssl rand -hex 32`, додати в Netlify + 1С |
| Netlify env: TELEGRAM_BOT_TOKEN + CHAT_ID | PENDING | Від @BotFather                                |
| Netlify env: VIBER_AUTH_TOKEN             | PENDING | З partners.viber.com                          |
| FTS migration (GIN + trigram indexes)     | PENDING | Запустити SQL в Supabase SQL Editor           |
| Supabase Storage bucket (product-images)  | PENDING | Створити в Supabase Dashboard                 |
| Завантажити фото продуктів                | PENDING | `npx tsx scripts/upload-photos.ts`            |
| Зареєструвати webhooks ботів              | PENDING | `npx tsx scripts/register-webhooks.ts`        |
| Кастомний домен ltex.com.ua               | PENDING | DNS налаштування                              |

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
