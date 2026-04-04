# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian second-hand clothing wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

## Current State

### Existing Website (catalog-full repo)
- 4 static HTML files: index.html, browse.html, catalog.html (468KB), lots.html (592KB)
- 802 products hardcoded in JS array (PRODUCTS[]) inside catalog.html
- 399 product positions with 726 individual lots (bags) in lots.html
- 695 free lots, 30 reserved, 268 on sale (akciya)
- EUR rate hardcoded at 50.9
- Features: search, filters, wishlist, cart, manager mode (password-protected), tutorial tour
- Forms use FormSubmit.co to send emails to ltex.lutsk.ai@gmail.com
- 7 categories: Одяг(23 subcats), Взуття(7), Аксесуари(3), Дім та побут(5), Іграшки(2), Bric-a-Brac(1), Косметика(1)

### Existing 1C System (Центральна 1С)
- Configuration: Custom based on "Управління Торгівлею" (Trade Management)
- 105 catalogs, 105 documents, 54 accumulation registers, 117 information registers, 191 enumerations
- Key catalogs: Номенклатура, Контрагенти, Організації, Склади, ДоговорыКонтрагентов, ТипиЦінНоменклатури, КонтактиViber, Якість, СерііНоменклатури
- Key documents: ЗаказПокупателя, РеалізаціяТоварівУслуг, ПоступленняТоварівУслуг, ЧекККМ, ПереміщенняТоварів, МаршрутнийЛист, УстановкаЦінНоменклатури
- Key registers: ТовариНаСкладах, Продажи, Закупки, ВзаєморозрахункиЗКонтрагентами, ДенежніКошти, ЦіниНоменклатури, КурсиВалют, ШтрихКоди
- HTTP Service "Боти": POST /bots/ping, /bots/send, /bots/sendsecond, /bots/exchange
- Exchange Plans: ОбмінССайтомТоварами, ОбмінССайтомЗамовленнями, ОбмінУправлінняТоргівлеюБухгалтерія
- 16 scheduled jobs including website sync, Viber integration, reservation cleanup
- Viber bot integration already exists (contacts, message history, chat groups)
- Roles: Администратор, МенеджерПродаж, СкладніПрацівник, КассирПозичення, etc.

### Existing Mobile App (MobileAgentLTEX v1.15.3)
- Developed by Intrata
- For field sales agents/managers
- 20 catalogs, 8 documents, 3 accumulation registers, 25 information registers
- Documents: Заказ, РеалізаціяТоварівПослуг, МаршрутнийЛист, КасовийОрдер, Возврат, Презентація
- Features: orders, route sheets, cash operations, barcode scanning, GPS tracking, Viber messaging
- Syncs with central 1C via native protocol (not REST)
- Multi-currency: UAH (primary), USD, EUR

## Architecture Plan

1С Центральна (SSoT) → JSON/webhook → API Hub (Next.js + Supabase) → All apps

### Repository Structure (Turborepo monorepo)

ltex-ecosystem/
├── apps/
│   ├── store/          — Internet shop (Next.js) — PHASE 1
│   ├── admin/          — Admin panel (Next.js) — PHASE 2
│   ├── bot/            — Telegram bot (Node.js + grammY) — PHASE 3
│   ├── mobile-agent/   — Manager app (Expo/React Native) — PHASE 4
│   ├── mobile-wh/      — Warehouse app (Expo/React Native) — PHASE 4
│   └── mobile-client/  — Client app (Expo/React Native) — PHASE 4
├── packages/
│   ├── db/             — Prisma schema + migrations + seed
│   ├── api-client/     — Typed API client
│   ├── ui/             — Shared UI components (shadcn/ui)
│   ├── shared/         — Shared types, constants, utils
│   ├── 1c-sync/        — 1C synchronization module
│   └── analytics/      — PostHog analytics wrapper
├── services/
│   └── 1c-export/      — 1C code (обробки, HTTP-сервіси)
└── docs/               — Project documentation

### Tech Stack
- Monorepo: Turborepo + pnpm
- Language: TypeScript 5.x
- Web framework: Next.js 14+ (App Router)
- Styles: Tailwind CSS 3.4+
- UI components: shadcn/ui + Radix
- Database: PostgreSQL (Supabase)
- ORM: Prisma 5.x
- Auth: Supabase Auth
- Cache: Upstash Redis
- Mobile: React Native + Expo SDK 50+
- Bot: grammY (Telegram)
- Analytics: PostHog
- Email: Resend + React Email
- Search: PostgreSQL FTS → Meilisearch
- Files: Supabase Storage / Cloudflare R2
- CI/CD: GitHub Actions
- Hosting web: Vercel
- Hosting bot: Railway or Fly.io

### Database Schema (maps to 1C)
- products ← Номенклатура (802+ items)
- categories ← mapped from product categories (7 cats, 41 subcats)
- lots ← Серії/Партії + ТовариНаСкладах (726 lots)
- customers ← Контрагенти
- orders ← ЗаказПокупателя
- order_items ← Табличні секції документів
- prices ← ЦіниНоменклатури (multiple price types)
- stock ← ТовариНаСкладах
- exchange_rates ← КурсиВалют
- barcodes ← ШтрихКоди
- sync_log ← tracking sync operations

### Development Phases
- Phase 0: Foundation (Turborepo setup, Supabase, Prisma schema, data migration) — 1 week
- Phase 1: Store MVP (catalog, filters, search, product page, cart, checkout, SEO) — 4-6 weeks
- Phase 2: Admin panel + 1C integration (dashboard, CRUD, orders, analytics) — 3-4 weeks
- Phase 3: Telegram bot (search, lots, order status, notifications) — 2-3 weeks
- Phase 4: Mobile apps (agent, warehouse, client) — 6-8 weeks
- Phase 5: Optimization (smart search, recommendations, PWA, online payments) — ongoing

### SEO Strategy
Target keywords: "секонд хенд гуртом", "секонд хенд оптом Україна", category-specific keywords
Semantic URLs: /catalog/odyag/futbolky instead of catalog.html?cat=Одяг&sub=Футболки
JSON-LD structured data: Product, Organization, BreadcrumbList
Blog for organic traffic: guides about second-hand business

### 1C Integration Strategy
- 1C exports JSON files (products.json, lots.json, rates.json) every 15 min to Cloudflare R2 or FTP
- API Hub imports JSON via cron job, upserts into PostgreSQL
- Orders flow back: website → API → JSON/webhook → 1C HTTP service
- Existing exchange plans (ОбмінССайтомТоварами/Замовленнями) can be extended

## Related Repositories
- ltexlutskai-tech/catalog-full — current static website (keep running until new store is ready)
- ltexlutskai-tech/1c-export — 1C configuration export (private, contains sensitive config)
- 1C config files also copied into catalog-full/1c-export/ for analysis

## Important Notes
- Language: Ukrainian (primary), site lang="uk"
- Currency: EUR for wholesale prices, UAH for display (with exchange rate)
- Minimum order: від 10 кг
- Each product has YouTube video review
- Quality levels matter for second-hand: Екстра, Крем, 1й сорт, 2й сорт, Сток, Мікс
- Lots (мішки/bags) have individual barcodes, weight, quantity, YouTube videos
- Manager mode exists for creating product selections for specific customers
