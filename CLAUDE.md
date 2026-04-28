# L-TEX Ecosystem — Project Context

## Business Overview

L-TEX is a Ukrainian wholesale business based in Піддубці, Луцький район, Волинська область.
They sell wholesale (від 10 кг) second-hand clothing, stock (new surplus), toys, Bric-a-Brac, shoes, accessories from England, Germany, Canada, Poland.
Contacts: Telegram @L_TEX, +380 67 671 05 15, +380 99 358 49 92, ltex.lutsk.ai@gmail.com

**IMPORTANT for SEO/copy:** L-TEX sells NOT ONLY секонд хенд but also сток (new surplus), іграшки, Bric-a-Brac. Always mention full assortment.

## Current Status

**Branch:** `main` (all work through **Session 34** merged).

**L-TEX website is LIVE on self-hosted Windows Server:** https://new.ltex.com.ua (Cloudflare Tunnel)

- **Live production:** `https://new.ltex.com.ua` via Cloudflare Tunnel `ltex-prod` (UUID `1b604cd0-1beb-4b0a-897f-93d67e58357f`), Windows Server 2022 (i5-9600K, 32GB, 107 Mbit symmetric)
- **DNS:** `ltex.com.ua` на Cloudflare NS (`fiona` + `trey`). Hostiq hosting email/cPanel (non-web records як DNS-only).
- **Netlify** `stalwart-dango-04a9b9.netlify.app` deprecated але живий (fallback).
- **DB:** Supabase PostgreSQL (Frankfurt) AND local PostgreSQL 16 на `E:\PostgreSQL\16` — обидві синхронізовані (805 products, 725 lots, 49 categories). Next.js читає локально.
- **Auto-start:** cloudflared + PostgreSQL як Windows services; PM2 через Scheduled Task "PM2 Resurrect" (60s delay).
- **Monitoring:** UptimeRobot Free, 3 monitors (`/`, `/catalog`, `/admin/login`), 5-min interval.
- **Backups:** Daily `pg_dump -Fc` at 03:00 → `E:\ltex-backups\` (14-day retention).
- **CI green:** 243 unit + 36 E2E tests, TypeScript strict, 0 `any`.
- **Security:** Sessions 16-17 закрили 4 CRITICAL + 3 HIGH вразливості перед self-hosted deploy.
- **Mobile client (Expo SDK 52):** working — Home з banners + 3 product rails (S34), 4-tab nav, Catalog 2-column grid + bottom-sheet filter (S38), wishlist persistence + saved-products screen (S39), chat unread badge на MoreTab + MoreScreen (S35), notifications screen з deep links + mark-read (S36), points to `https://new.ltex.com.ua/api`. QuickView — pending. **Native APK не distributed** — користувачі поки скачують лише PWA з веб-сайту.

### Session log (recent)

- **S27** deploy.ps1 hardening v1 (direct pnpm filter, .env sync, --update-env)
- **S28-S32** web catalog UX (product card quickfixes, remove Compare, filters left sidebar + mobile bottom-sheet, grid/list toggle, wishlist always visible)
- **S33** mobile home screen Rozetka-style + 4-tab restructure (Home / Search / Cart / More + FAB messenger)
- **S37** deploy.ps1 hardening v2 (Tee-Object pipe + PM2 try/catch + pm2 ping). PM2 daemon resilience verified end-to-end. Tee-Object thesis для buffering — невірний (S39 закрив).
- **S38** mobile catalog parity with web (ProductCard 4:3 + NEW/SALE + wishlist heart UI, bottom-sheet `CatalogFilterSheet` with all web filters, FlatList numColumns=2). Done by background worker subagent in ~10 min.
- **S39** deploy step 4 fix + wishlist persistence. **Both prior buffering theses (S37 Tee-Object, "real fix is cmd /c") були хибними** — direct `pnpm --filter @ltex/store run build` працює як треба. Не додавати редирект у крок [4/8] жодного типу. Mobile wishlist: SecureStore-backed (100-item cap), fire-and-forget mirror у `/api/mobile/favorites` коли logged in, WishlistScreen — 2-col grid.
- **S34** mobile home banners + 3 product rails (Топ / Акції / Новинки). Single-shot `/api/mobile/home` endpoint (60s ISR), pure-RN BannerCarousel (rgba overlay, no expo-linear-gradient dep) + HorizontalProductRail. Endpoint live, банери на сайті — pending admin upload (P0 #4).
- **Регресія S34→S42:** другий поспіль deploy висне на [4/8] бо PM2 worker (cluster АБО fork) тримає file handle на `apps/store/.next/standalone/...`. **Закрито у S42** через `pm2 kill` prelude (daemon-level signal вбиває всіх дітей). S40/S41 спроби (`pm2 stop`, `pm2 delete`+regex) не спрацювали — application-level API на Windows нестабільне. Spec у `docs/SESSION_40_DEPLOY_PM2_NODE_LOCK.md` (S40) + `docs/SESSION_41_DEPLOY_FORK_MODE.md` (S41).
- **S35** mobile chat unread badge — light `/api/mobile/chat/unread` endpoint (count manager+unread+customerId), `<ChatUnreadProvider>` polling 30с only when logged-in + AppState foreground refresh, `tabBarBadge` на MoreTab (#dc2626, "9+" cap) + бейдж біля "Чат з менеджером" на MoreScreen, optimistic clear у ChatScreen (initial fetch + SSE manager message). 8 files, +243/-6, tests 249/249.
- **S36** mobile notifications screen + new `Notification` model. DB migration `20260428_notifications` (table + 2 indexes + FK CASCADE), GET extended additively з in-app feed (`take: 100`), new PUT для mark-single/mark-all з tenant scoping. Mobile FlatList: type icons, inline `formatRelative`, unread blue dot, optimistic mark-read, header-right mark-all, pull-to-refresh, deep links (order_status / new_video / chat_message / system). 6 files, +571/-16, tests 255/255. **⚠️ Перед deploy потрібен `prisma migrate deploy` на обох DBs.**

**IMPORTANT FOR NEW SESSIONS:** Do NOT re-audit or re-merge branches. Проект повністю функціональний. Читай `docs/HISTORY.md` для деталей попередніх сесій.

## Quick Navigation

| Документ                                                   | Коли читати                                              |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | Tech stack, file tree, DB schema, env vars, URLs, tests  |
| [docs/HISTORY.md](docs/HISTORY.md)                         | Що робилось у Sessions 4-18 (completion reports)         |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)                 | Do-not-touch list, existing systems, technical decisions |
| [docs/SESSION_TASKS.md](docs/SESSION_TASKS.md)             | Що треба зробити далі (priority queue P0-P3)             |
| [DEPLOYMENT.md](DEPLOYMENT.md)                             | Як деплоїти на Windows Server                            |
| [PROJECT_AUDIT_2026-04-18.md](PROJECT_AUDIT_2026-04-18.md) | Повний audit snapshot (695 рядків, 12 секцій)            |

## Critical Rules for All Sessions

1. **DO NOT repeat Sessions 4-18** — дивись `docs/HISTORY.md`. Seed, merge, infrastructure setup — все зроблено.
2. **DO NOT touch `output: 'standalone'`** у `apps/store/next.config.js` — critical для self-hosted standalone build.
3. **DO NOT touch server infrastructure** (PM2 Task, cloudflared service, backup script) без конкретної потреби.
4. **DO NOT break CI** — запускай `pnpm format:check && pnpm -r typecheck && pnpm -r test` перед push.
5. **L-TEX НЕ приймає онлайн-оплати** — таблиця `payments` тільки для відображення з 1С.
6. **Orchestrator планує і мерджить. Worker кодить і пушить у feature branch.**
7. **You cannot SSH to the server.** Windows + PowerShell. Для infra-fix — диктуй команди, юзер виконує локально.

Більше правил — у `docs/CONVENTIONS.md`.

## Orchestration Workflow

### Session Types

**Orchestrator** — управляє проектом, НЕ кодить:

- Review та merge feature branches в main
- Видалення merged branches
- Перевірка CI/deploy статусу
- Оновлення `docs/SESSION_TASKS.md` (планування) і `docs/HISTORY.md` (звіти)
- Планування задач для worker-сесій

**Worker** — кодить, НЕ управляє:

- Виконує задачі з `docs/SESSION_TASKS.md` або окремої worker-spec у `docs/SESSION_N_*.md`
- Автоматично створює feature branch
- Пушить результат на свою гілку
- НЕ мерджить в main — це робить orchestrator

### Процес

```
Orchestrator: план → docs/SESSION_TASKS.md → push main
    ↓
Worker: читає spec → кодить → push feature branch
    ↓
Orchestrator: review → merge → cleanup → новий план
```

### Worker Session Checklist (для orchestrator після кожної worker-сесії)

- [ ] `git fetch origin` — знайти нову гілку
- [ ] `git log origin/<branch> --oneline` — переглянути коміти
- [ ] `git diff main..origin/<branch> --stat` — переглянути зміни
- [ ] `git merge origin/<branch>` — merge в main
- [ ] `git push origin main` — push main
- [ ] `git push origin --delete <branch>` — видалити merged branch (може впасти 403, тоді GitHub UI)
- [ ] Перевірити CI — green?
- [ ] Оновити `docs/HISTORY.md` — звіт + `docs/SESSION_TASKS.md` нові задачі

## Tech Stack

- Monorepo: Turborepo + pnpm 9.x
- Language: TypeScript 5.x (strict, 0 `any`)
- Web: Next.js 15 (App Router, `output: 'standalone'`) + React 19
- Styles: Tailwind CSS 3.4 + shadcn/ui + Radix
- Database: PostgreSQL 16 (Supabase Frankfurt + local Windows) + Prisma 6.x
- Auth: Supabase Auth (admin) + custom HMAC JWT (mobile)
- Files: Supabase Storage
- Testing: Vitest + Playwright
- CI/CD: GitHub Actions (format + test + typecheck + build + E2E)
- Hosting: self-hosted Windows Server + Cloudflare Tunnel (primary), Netlify (fallback)

Детальний tech stack — у `docs/ARCHITECTURE.md`.

## Important Notes

- **Language:** Ukrainian (primary), site `lang="uk"`
- **Currency:** EUR для wholesale prices, UAH для display (rate from 1C)
- **Minimum order:** від 10 кг
- **Products have YouTube video reviews** (767/805)
- **Quality levels:** Екстра, Крем, 1й сорт, 2й сорт, Сток, Мікс
- **Lots** (мішки/bags) have individual barcodes, weight, quantity, YouTube videos
- **Price per kg** (most products) OR per piece/pair (footwear, 91 items)
- **Assortment:** секонд хенд, СТОК, іграшки, Bric-a-Brac, косметика
