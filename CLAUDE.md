# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Phase 0 — COMPLETED

Foundation fully built. Branch: `claude/ecommerce-store-setup-CnrWn`

### What exists now

```
ltex-ecosystem/
├── .github/workflows/ci.yml     — typecheck + build on PR/push
├── package.json                  — pnpm 9.x, turbo 2.x, typescript 5.x
├── pnpm-workspace.yaml           — apps/*, packages/*, services/*
├── turbo.json                    — build, dev, lint, typecheck, clean
├── tsconfig.json                 — strict, ES2022, bundler resolution
├── apps/
│   └── store/                    — Next.js 15 + React 19 + Tailwind 3.4
│       ├── app/layout.tsx        — lang="uk", SEO metadata, Inter font
│       ├── app/page.tsx          — Hero placeholder
│       ├── app/not-found.tsx     — 404 page
│       ├── components/header.tsx — Sticky header, nav, Telegram
│       ├── components/footer.tsx — 4-col grid, categories, contacts
│       ├── tailwind.config.ts    — Extends @ltex/ui config
│       └── next.config.js        — transpilePackages: @ltex/*
├── packages/
│   ├── shared/src/
│   │   ├── constants/            — categories (7+41), quality (6 levels), currency, business
│   │   ├── types/                — Product, Lot, Order, Customer, Price, ExchangeRate
│   │   └── utils/                — formatPrice(), convertCurrency(), generateSlug()
│   ├── db/
│   │   ├── prisma/schema.prisma  — 12 tables (see below)
│   │   ├── prisma/seed.ts        — Upsert seed from JSON
│   │   ├── prisma/parse-excel.py — Excel→JSON parser
│   │   ├── prisma/data/products.json — 805 real products
│   │   └── prisma/data/lots.json     — 725 real lots
│   └── ui/
│       ├── components/           — Button, Input, Badge, Card, Skeleton, Separator
│       ├── globals.css           — L-TEX green theme (primary: #16a34a, accent: amber)
│       ├── tailwind.config.ts    — Shared config with CSS variables
│       └── lib/utils.ts          — cn() helper (clsx + twMerge)
└── *.xlsx (4 files)              — Original Excel data in root
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
| product_images | Зображення | productId, url, position, alt |

### Seed Data Stats (from real Excel files)

- **805 products**: 574 clothing, 147 footwear, 33 home, 26 accessories, 21 toys, 3 bric-a-brac, 1 cosmetics
- **725 lots**: 430 free, 265 on_sale, 30 reserved
- **Quality distribution**: first(201), mix(259), stock(151), extra(123), second(52), cream(19)
- **Price units**: 714 per kg, 91 per piece/pair
- **Seasons**: demiseason(217), summer(93), winter(112), none(383)
- **767/805 products** have YouTube video URLs

### Key Technical Decisions Made

1. **Exchange rate** — NOT hardcoded. Comes from 1C → exchange_rates table → API
2. **Product photos** — Will be stored in Supabase Storage, `imageUrls: string[]` field (empty for now)
3. **Price unit** — `priceUnit: "kg" | "piece"` field on Product (footwear = piece/pair)
4. **Categories** — Self-relation tree (parentId), not separate tables
5. **Next.js 15** (not 14) — Required for React 19 compatibility
6. **Font** — System font stack (Inter fallback), no Google Fonts at build time
7. **Slug generation** — Ukrainian transliteration (власна таблиця, не бібліотека)

## Phase 1 — Store MVP (NEXT)

### Prerequisites before starting
- [ ] Create Supabase project → get DATABASE_URL
- [ ] Run `prisma db push` + `pnpm db:seed` to populate database
- [ ] Upload product photos to Supabase Storage (can be parallel)

### Phase 1 Blocks

| Block | What | Status |
|-------|------|--------|
| 8 | Home page (hero, categories, popular products) | TODO |
| 9 | Catalog + filters (category, quality, price, season, search, pagination) | TODO |
| 10 | Product page (details, photos, video, lots, prices, breadcrumbs) | TODO |
| 11 | Cart + checkout (cart, order form, min 10kg validation) | TODO |
| 12 | Lots page (lot browser, status filters, barcodes) | TODO |
| 13 | SEO + optimization (semantic URLs, JSON-LD, meta, sitemap) | TODO |

### URL Structure (SEO)
- `/` — home
- `/catalog` — all products
- `/catalog/[categorySlug]` — category (e.g., `/catalog/odyag`)
- `/catalog/[categorySlug]/[subcategorySlug]` — subcategory (e.g., `/catalog/odyag/futbolky`)
- `/product/[slug]` — product detail
- `/lots` — all lots
- `/contacts` — contacts page

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

## Development Phases Overview

- **Phase 0: Foundation** — COMPLETED
- Phase 1: Store MVP (catalog, filters, search, product page, cart, checkout, SEO)
- Phase 2: Admin panel + 1C integration (dashboard, CRUD, orders, analytics)
- Phase 3: Telegram bot (search, lots, order status, notifications)
- Phase 4: Mobile apps (agent, warehouse, client)
- Phase 5: Optimization (smart search, recommendations, PWA, online payments)

## Tech Stack
- Monorepo: Turborepo + pnpm 9.x
- Language: TypeScript 5.x (strict)
- Web: Next.js 15 (App Router) + React 19
- Styles: Tailwind CSS 3.4 + shadcn/ui + Radix
- Database: PostgreSQL (Supabase)
- ORM: Prisma 6.x
- Auth: Supabase Auth (Phase 2)
- Files: Supabase Storage
- CI/CD: GitHub Actions
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
