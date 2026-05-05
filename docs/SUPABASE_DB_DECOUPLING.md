# Supabase DB — Cold Backup Only

**Status as of 2026-05-04:** Supabase PostgreSQL у Frankfurt **не active mirror**. Local PostgreSQL 16 на Windows Server (`E:\PostgreSQL\16`) — primary і єдиний source-of-truth для runtime DB-операцій.

## Active services on Supabase

- **Auth** — admin login (`@supabase/ssr` через `apps/store/lib/supabase/server.ts`, `client.ts`, `middleware.ts`).
- **Storage** — buckets `product-images` та `banners` (через `apps/store/lib/supabase/admin.ts` з `SUPABASE_SERVICE_ROLE_KEY`, додано в S56).

## Inactive

- **PostgreSQL DB** — більше не пишемо у нього з runtime. Local PostgreSQL — primary. Supabase DB лишається як cold backup mirror і оновлюється тільки за explicit user action (експорт/імпорт).

## Why not delete Supabase DB entirely

- Cold backup на випадок катастрофічного збою local PostgreSQL.
- Точка fallback якщо доведеться екстрено переключитись на Netlify (див. `DEPLOYMENT.md` секцію fallback). Naturally вимагає пере-apply migrations та свіжого data dump перед активацією.
- Auth + Storage все одно тримаються там — DB йде "прицепом" у тому самому проекті.

## When migrations apply where

- **Local DB:** усі migrations apply через `pnpm --filter @ltex/db exec prisma migrate deploy` після кожного pull (запускається user-ом локально на Windows Server). Це default code path.
- **Supabase DB:** migrations застосовуються **ТІЛЬКИ якщо** ми колись активуємо Netlify fallback. Зараз — НЕ потрібно.

### Migrations що ще НЕ apply-нуті на Supabase

Список migrations які з'явились після Session 27 переходу на local DB і не реплікувались у Supabase:

- `20260428_notifications` — S36 in-app notifications table.
- `20260429_view_log` — S43 ViewLog (recommendations engine).
- `20260430_banner_imageonly` — S57 banner schema cleanup (removed title/subtitle/ctaLabel).
- `20260502_product_attrs_lot_optional` — S59 product attrs (gender/sizes/unitsPerKg/unitWeight) + nullable lotId on OrderItem/CartItem.

(Якщо додалась нова migration після цього снапшоту — додай у список або просто перевір через `git log packages/db/prisma/migrations/`.)

## Re-activate procedure (якщо колись треба)

1. Запусти `pnpm --filter @ltex/db exec prisma migrate deploy` з `DATABASE_URL` що вказує на Supabase pooler. Перевір що всі migrations з переліку вище застосовуються без помилок.
2. Експортуй дані з local: `pg_dump -Fc ltex_ecosystem > backup.dump` → restore на Supabase через `pg_restore --no-owner --no-acl --clean --if-exists -d <SUPABASE_DB_URL> backup.dump`.
3. Поміняй `DATABASE_URL` у `apps/store/.env` (та у `.env` пакету `@ltex/db`) на Supabase pooler URL.
4. Redeploy. Local DB стає cold backup. Не забудь швидко перевірити `prisma migrate status` на обох.

## No dual-write code

Перевірено 2026-05-04 grep-ом:

```bash
grep -rnE "supabase\.from|supabase\.rpc|\.from\(['\"][a-zA-Z_]+['\"]\).*\.(insert|update|upsert|delete)" apps/ packages/
```

→ нуль hits. Усі supabase виклики у runtime — це `.auth.*` (admin login, getUser) та `.storage.*` (image upload/delete для banners + product-images). Жоден runtime код не пише у Supabase Postgres напряму. Mutations ідуть виключно через `@ltex/db` Prisma client (який підключається до того, що у `DATABASE_URL` — зараз local Postgres).

## Quick-check command

```bash
# Show which Postgres the runtime is targeting:
grep -E "^DATABASE_URL" apps/store/.env

# Should be `postgresql://...localhost:5432/...` on Windows Server.
# Якщо побачиш `*.pooler.supabase.com` — значить ми вже на Supabase і local став cold backup.
```

## Related docs

- `DEPLOYMENT.md` — Windows Server self-hosted setup.
- `CLAUDE.md` — high-level project status (Status section).
- `docs/ARCHITECTURE.md` — повний tech stack + DB schema.
