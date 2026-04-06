# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `claude/setup-supabase-auth-VBzJp`

All work from Phase 0, Phase 1, Phase 2, and multiple improvement rounds is complete and pushed.

### Commits (newest first)
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
│   │       ├── orders/route.ts      — POST: Zod validation, $transaction, rate limiting, notifications
│   │       └── sync/
│   │           ├── products/route.ts — POST: Bearer auth, upsert, revalidatePath, rate limit
│   │           ├── lots/route.ts     — POST: Bearer auth, upsert, revalidatePath, rate limit
│   │           ├── rates/route.ts    — POST: Bearer auth, upsert, rate limit
│   │           └── orders/export/route.ts — GET: export orders for 1C
│   ├── components/
│   │   ├── header.tsx               — Sticky, mobile Sheet menu, CartBadge, nav (Каталог, Лоти, Про нас, Контакти)
│   │   ├── footer.tsx               — 4-col grid, categories, contacts
│   │   ├── store/                   — ProductCard, CatalogFilters (price range, clear all), Breadcrumbs, Pagination, AddToCartButton, CartBadge, ProductJsonLd
│   │   └── admin/                   — Sidebar (responsive), ConfirmDelete dialog
│   ├── lib/
│   │   ├── catalog.ts               — getCatalogProducts() with full-text search (tsvector), price range, categoryIds
│   │   ├── cart.tsx                  — CartProvider + useCart hook, localStorage
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
│   │   ├── prisma/schema.prisma     — 12 tables (see Database Schema below)
│   │   ├── prisma/seed.ts           — Upsert seed from JSON
│   │   ├── prisma/parse-excel.py    — Excel→JSON parser
│   │   ├── prisma/data/products.json — 805 real products
│   │   └── prisma/data/lots.json    — 725 real lots
│   └── ui/
│       ├── components/              — Button, Input, Badge, Card, Skeleton, Separator, Dialog, Sheet, Textarea, Toast, Toaster
│       └── lib/use-toast.ts         — useToast hook + toast() with success/destructive variants
```

### Database Schema (Prisma, 12 tables)

| Table | Maps to 1C | Key fields |
|-------|-----------|------------|
| categories | Групи номенклатури | slug (unique), name, parentId (self-relation tree) |
| products | Номенклатура | code1C, articleCode, slug, quality, season, priceUnit (kg/piece), averageWeight, videoUrl |
| product_images | Зображення | productId, url, position, alt |
| lots | Серії + ТовариНаСкладах | barcode (unique), weight, quantity, status (free/reserved/on_sale), priceEur |
| prices | ЦіниНоменклатури | productId, priceType (wholesale/retail/akciya), currency, amount |
| customers | Контрагенти | code1C, name, phone, email, telegram |
| orders | ЗаказПокупателя | code1C, customerId, status, totalEur, exchangeRate |
| order_items | Табличні секції | orderId, lotId, productId, priceEur, weight |
| exchange_rates | КурсиВалют | currencyFrom, currencyTo, rate, date, source ("1c"/"manual") |
| barcodes | ШтрихКоди | lotId, code, type |
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
```

### Tests (53 total, all passing)

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
- Phase 3: Telegram bot (search, lots, order status, notifications)
- Phase 4: Mobile apps (agent, warehouse, client)
- Phase 5: Optimization (smart search, recommendations, PWA, online payments)

### Prerequisites before deploying
- [ ] Create Supabase project → get DATABASE_URL, SUPABASE_URL, ANON_KEY
- [ ] Run `prisma db push` + `pnpm db:seed` to populate database
- [ ] Upload product photos to Supabase Storage (can be parallel)
- [ ] Set SYNC_API_KEY for 1C integration
- [ ] (Optional) Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for order notifications
- [ ] (Optional) Add PWA icons: /public/icon-192.png, /public/icon-512.png

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
