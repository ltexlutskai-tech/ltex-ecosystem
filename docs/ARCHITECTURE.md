# L-TEX Ecosystem — Architecture

Довідкова інформація по структурі проекту: file tree, DB schema, ключові технічні рішення, environment variables, тести, URL структура. Цей файл — витяг із початкового `CLAUDE.md`, нічого не переписано своїми словами.

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

> **Note:** Session 14 додала 3 нові моделі (`Banner`, `FeaturedProduct`, `PromoStripe`) — тепер всього 22 Prisma моделі. Деталі див. [HISTORY.md](HISTORY.md) → Session 14.

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

> **Note (Session 16):** `MOBILE_JWT_SECRET` тепер обов'язковий для mobile API. `TELEGRAM_WEBHOOK_SECRET` тепер required (а не optional) коли Telegram bot використовується. Див. [HISTORY.md](HISTORY.md) → Session 16.

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

> **Note:** Після Session 16-17 загальна кількість unit-тестів зросла до 220 (+26 у Session 16: mobile-auth 12, validate-image 14; +8 у Session 17: instrumentation 8). Див. [HISTORY.md](HISTORY.md).

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

> **Note:** Session 14 Wave 1 додала публічні маршрути `/new`, `/sale`, `/top` + admin `/admin/banners`, `/admin/featured`, `/admin/promo`. Див. [HISTORY.md](HISTORY.md) → Session 14.
