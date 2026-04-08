# L-TEX Ecosystem

Monorepo for the L-TEX wholesale business platform — catalog, admin panel, Telegram/Viber bots, and mobile client app.

L-TEX sells wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, and accessories from England, Germany, Canada, Poland.

## Tech Stack

- **Monorepo**: Turborepo + pnpm 9.x
- **Web**: Next.js 15 (App Router) + React 19 + Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL (Supabase) + Prisma 6.x
- **Auth**: Supabase Auth
- **Mobile**: Expo (React Native)
- **Bots**: Telegram Bot API + Viber REST API
- **Testing**: Vitest (114 unit tests) + Playwright (36 E2E tests)
- **CI/CD**: GitHub Actions → Netlify

## Project Structure

```
ltex-ecosystem/
├── apps/
│   ├── store/              # Next.js 15 web app (catalog + admin panel)
│   └── mobile-client/      # Expo React Native app
├── packages/
│   ├── shared/             # Types, constants, utilities
│   ├── db/                 # Prisma schema, migrations, seed data
│   └── ui/                 # shadcn/ui components
├── services/
│   ├── telegram-bot/       # Standalone Telegram bot
│   └── viber-bot/          # Standalone Viber bot
├── e2e/                    # Playwright E2E tests
└── turbo.json              # Turborepo config
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL (or Supabase project)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example apps/store/.env.local

# Generate Prisma client
pnpm --filter @ltex/db exec prisma generate

# Push schema to database
pnpm --filter @ltex/db exec prisma db push

# Seed database (805 products, 725 lots)
pnpm db:seed

# Run FTS migration (full-text search indexes)
# Execute: packages/db/prisma/migrations/20260406_fts_gin_trigram/migration.sql

# Start development server
pnpm dev
```

The store will be available at http://localhost:3000.

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests (requires running dev server + DATABASE_URL)
pnpm test:e2e

# Type checking
pnpm typecheck

# Prettier check
pnpm format:check
```

## Apps & Services

### Web Store (`apps/store`)

Public-facing catalog with full-text search (tsvector + trigram fallback), product pages with YouTube video reviews, lots browser, shopping cart, and checkout.

**Key URLs:**

- `/catalog` — all products with filters and search
- `/lots` — lots browser with status filters
- `/product/[slug]` — product detail page
- `/cart` — cart + checkout (min 10 kg)

### Admin Panel (`apps/store/admin`)

Protected admin panel with dashboard analytics, product/lot/order/category CRUD, customer management, exchange rate management, and sync log viewer.

### Mobile Client (`apps/mobile-client`)

Expo React Native app with phone auth, catalog browsing, cart, order tracking, chat with manager (SSE), shipment tracking (Nova Poshta), push notifications.

### Telegram Bot (`services/telegram-bot`)

Commands: `/search`, `/lots`, `/prices`, `/new`, `/order`, `/categories`, `/help`. Supports inline search and quality filter keyboards.

### Viber Bot (`services/viber-bot`)

Same features as Telegram bot with rich keyboard menus. Webhook-only (Viber requirement).

## API Routes

| Endpoint                  | Method          | Description                                                 |
| ------------------------- | --------------- | ----------------------------------------------------------- |
| `/api/cart`               | GET/POST/DELETE | Server-side cart management                                 |
| `/api/orders`             | POST            | Create order (Zod validation, rate limiting)                |
| `/api/search`             | GET             | Autocomplete search (tsvector + trigram)                    |
| `/api/sync/products`      | POST            | 1C product sync (Bearer auth)                               |
| `/api/sync/lots`          | POST            | 1C lot sync (Bearer auth)                                   |
| `/api/sync/rates`         | POST            | 1C exchange rate sync (Bearer auth)                         |
| `/api/sync/orders/export` | GET             | Export orders for 1C                                        |
| `/api/mobile/*`           | Various         | Mobile app endpoints (auth, profile, favorites, chat, etc.) |
| `/api/telegram/webhook`   | POST            | Telegram bot webhook                                        |
| `/api/viber/webhook`      | POST            | Viber bot webhook (HMAC-SHA256)                             |

## Database

19 tables managed by Prisma, seeded with real data:

- 805 products (clothing, footwear, toys, accessories, bric-a-brac)
- 725 lots (430 free, 265 on sale, 30 reserved)
- 49 categories (tree structure with parent/child)

## Deployment

The web store deploys to Netlify from the `main` branch. See `.env.example` for required environment variables.

## License

Private — L-TEX internal project.
