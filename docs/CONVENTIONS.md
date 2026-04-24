# L-TEX Ecosystem — Conventions

Do-not-touch list, технічні рішення, існуючі системи, env vars, технологічний стек.
Цей файл — витяг із початкового `CLAUDE.md`.

---

## Do-NOT-touch list (critical constraints)

Кожна worker-сесія МУСИТЬ читати ці правила перед змінами:

- **DO NOT repeat Sessions 0-18** — дивись `docs/HISTORY.md`. Seed, merge, infrastructure setup — все зроблено.
- **DO NOT touch `output: 'standalone'` у `apps/store/next.config.js`** — critical для self-hosted standalone build (Session 15).
- **DO NOT touch PM2 Scheduled Task, cloudflared service binPath, backup script на сервері** — вони потребували налагодження (Session 18).
- **DO NOT break CI** — перед pushем: `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build`.
- **DO NOT add online payments** — L-TEX свідомо НЕ приймає онлайн-оплати. Таблиця `payments` тільки для історії з 1С.
- **DO NOT touch `next.config.js`** `outputFileTracingIncludes` / `PrismaPlugin` / `serverExternalPackages` — historical Lambda constraint (Session 14/15).
- **Language:** Ukrainian (primary), terminology може бути англійською.
- **Orchestrator планує і мерджить. Worker кодить і пушить у feature branch.** Worker НЕ мерджить у main.

---

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

---

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
