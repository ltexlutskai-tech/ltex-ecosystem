# Session 65 — CI/CD + Tooling Cleanup (Worker Spec)

**Дата:** 2026-05-04
**Тип:** worker
**Ефорт:** ~2-3 год
**Branch:** `claude/s65-ci-tooling`
**Контекст:** P3 tech-debt items, всі ізольовані у `.github/`, root-level конфіги, та docs. Жодних UI/DB/runtime змін.

## Issues

### 1. E2E `continue-on-error` cleanup

**Файл:** `.github/workflows/ci.yml:73`

Зараз `continue-on-error: true` робить E2E "decorative" — fail не показується як червоний CI. Краще: skip-если-нема-DATABASE_URL замість always-pass.

**Фікс:**

```yaml
- name: Run E2E tests
  if: ${{ env.HAS_DB == 'true' }}
  run: pnpm test:e2e
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    HAS_DB: ${{ secrets.DATABASE_URL != '' }}

- name: Skip notice
  if: ${{ env.HAS_DB != 'true' }}
  run: echo "::notice::E2E skipped — set DATABASE_URL secret to enable"
  env:
    HAS_DB: ${{ secrets.DATABASE_URL != '' }}
```

Видали `continue-on-error: true`. Видали окремий "Warn if DATABASE_URL not configured" step (рядки 74-78) — він заміщений на `if:` на самій job step.

Тепер: коли DATABASE_URL secret є → E2E запускається і fail-ить червоним. Коли немає → step skipped (не fail). Чисто.

### 2. Dependabot config

**Новий файл:** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "Europe/Kyiv"
    open-pull-requests-limit: 5
    groups:
      next-react:
        patterns:
          - "next"
          - "react"
          - "react-dom"
          - "@next/*"
      prisma:
        patterns:
          - "prisma"
          - "@prisma/*"
      dev-dependencies:
        dependency-type: "development"
    ignore:
      # Major Next/React bumps — review manually
      - dependency-name: "next"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react"
        update-types: ["version-update:semver-major"]
    labels:
      - "dependencies"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    labels:
      - "ci"
```

Це створить щотижневі PRs з updates, згруповані по логічних родинах. Major Next/React/Prisma окремо для ручного review.

### 3. `npm audit` step у CI

**Файл:** `.github/workflows/ci.yml`

Додай step ДО `Build` (щоб build не запускався при критичних vulns):

```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level high --prod
  continue-on-error: true
```

`--prod` — ігнорує devDependencies (vitest/eslint vulns не критичні runtime). `--audit-level high` — fail тільки на high+critical, не moderate (інакше CI спам). `continue-on-error: true` — поки не блокуємо merge, але видно червоним сигналом якщо є.

### 4. Bundle size baseline

**Новий файл:** `docs/BUNDLE_BASELINE.md`

Запусти `ANALYZE=true pnpm --filter @ltex/store build` локально. Скопіюй output "Route (app)" таблицю + First Load JS shared chunks. Зафіксуй у `docs/BUNDLE_BASELINE.md`:

```markdown
# Bundle Size Baseline

**Snapshot date:** 2026-05-04 (commit <SHA>)
**Build mode:** standalone, production
**Next.js:** 15.5.x

## Pages

(вставити "Route (app)" таблицю з output build-у)

## Shared chunks

(вставити "+ First Load JS shared by all" + chunks list)

## Notes

- Largest pages: `/admin/login` (~62 kB), `/` (~23 kB після S62 feed)
- `/lots` (~3.5 kB / 162 kB First Load) — нова сторінка S61
- `/product/[slug]` (~7 kB / 172 kB) — після S59 redesign
- Watch list: загальний First Load JS shared зараз 102 kB. Якщо перевищить 130 kB — investigate.
```

Це baseline для майбутніх порівнянь. Будь-яка PR що додасть >20 kB First Load JS — треба буде justify.

⚠️ Worker не зможе запустити `ANALYZE=true pnpm build` у sandbox без DB. Як замість цього — використовуй output `pnpm --filter @ltex/store build` (без ANALYZE) — він уже виводить "Route (app)" з sizes. ANALYZE=true потрібен тільки для HTML bundle-analyzer report, який зайвий для baseline doc.

### 5. Видалити `netlify.toml`

**Файл:** `/netlify.toml` (root)

Зміст починається з `# DEPRECATED: L-TEX is migrating to self-hosted Windows Server.` Файл не використовується — Netlify deployment паркований (per CLAUDE.md "Netlify deprecated але живий fallback").

**Дія:** `git rm netlify.toml`. Не потрібно видаляти Netlify Site (це user-action на Netlify dashboard).

Перевір що `next.config.js::outputFileTracingIncludes` (рядки 19-25) **НЕ видаляти** — це для Prisma engine у standalone build (не Netlify-specific). Comment у файлі підтверджує: "Prisma engine binaries are loaded via dynamic require at runtime". Оставити як є.

### 6. Supabase DB decoupling docs

**Новий файл:** `docs/SUPABASE_DB_DECOUPLING.md`

Документує поточний стан після Session 27+ переходу на local PostgreSQL:

```markdown
# Supabase DB — Cold Backup Only

**Status as of 2026-05-04:** Supabase PostgreSQL у Frankfurt **не active mirror**.

## Active services on Supabase

- **Auth** — admin login (`@supabase/ssr` через `lib/supabase/server.ts`)
- **Storage** — buckets `product-images`, `banners` (через `lib/supabase/admin.ts` з service-role key)

## Inactive

- **PostgreSQL DB** — більше не пишемо у нього з runtime. Local PostgreSQL (`E:\PostgreSQL\16` на Windows Server) — primary і єдиний source-of-truth.

## When migrations apply where

- **Local DB:** усі migrations apply через `pnpm --filter @ltex/db exec prisma migrate deploy` після кожного pull (запускається user-ом локально на Windows Server).
- **Supabase DB:** migrations застосовуються **ТІЛЬКИ якщо** ми колись активуємо Netlify fallback. Зараз — НЕ потрібно. Перелік migrations що ще не у Supabase: `20260428_notifications`, `20260429_view_log`, `20260430_banner_imageonly`, `20260502_product_attrs_lot_optional`.

## Why not delete Supabase DB entirely

- Cold backup на випадок катастрофічного збою local PostgreSQL.
- Точка fallback якщо доведеться екстрено переключитись на Netlify (DEPLOY.md).
- Auth + Storage все одно тримаються там — DB йде "прицепом".

## Re-activate procedure (якщо колись треба)

1. Запустити `pnpm --filter @ltex/db exec prisma migrate deploy` з `DATABASE_URL` що вказує на Supabase pooler.
2. Експортувати дані з local: `pg_dump -Fc ltex_ecosystem > backup.dump` → restore на Supabase через `pg_restore --no-owner`.
3. Поміняти `DATABASE_URL` у `.env` на Supabase URL.
4. Redeploy. Local стає cold backup.

## No dual-write code

Перевірено 2026-05-04: жодний runtime код не пише у обидві БД. Тільки local через `@ltex/db` Prisma client.
```

Додай посилання на цей файл у `CLAUDE.md` "Quick Navigation" секцію (НЕ редагуй CLAUDE.md — тільки через окремий orchestrator-step). Просто скажи у звіті що варто додати.

Перевір що нема `dual-write` коду: `grep -rn "supabase.*insert\|supabase.*update" apps/store/lib apps/store/app | grep -v storage | grep -v auth`. Якщо знайдеш runtime DB-writes — repor у Notes.

## Out of scope

- Видалення Netlify Site із Netlify dashboard — user-action.
- Removal of `@ltex/store` Netlify-specific dependencies (`@netlify/plugin-nextjs`) — їх вже у dependencies нема (перевір `package.json`, не видаляй якщо є).
- GitHub Protected Branches — user-action у GitHub Settings.
- Sentry/Grafana setup — окрема задача.

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `pnpm --filter @ltex/store build` standalone build success
- [ ] CI workflow YAML валідний — `actionlint` локально (якщо встановлений) АБО просто візуальний review
- [ ] `.github/dependabot.yml` парситься як YAML (`yq . .github/dependabot.yml`)
- [ ] `netlify.toml` видалений
- [ ] `docs/BUNDLE_BASELINE.md` існує з реальними числами з build output
- [ ] `docs/SUPABASE_DB_DECOUPLING.md` існує

## Commit strategy

1. `chore(s65a): ci — gate E2E (skip when DATABASE_URL secret not set, no continue-on-error)`
2. `chore(s65b): add Dependabot config (weekly npm + GitHub Actions)`
3. `chore(s65c): ci — npm audit step (--audit-level high --prod, soft-fail)`
4. `chore(s65d): docs — bundle size baseline snapshot`
5. `chore(s65e): remove deprecated netlify.toml`
6. `docs(s65f): Supabase DB decoupling — document cold backup state`

Push `claude/s65-ci-tooling`. NOT merge to main, NOT create PR.

## Hard rules

- Не чіпай `output: 'standalone'` чи `outputFileTracingIncludes` у `next.config.js` (це для Prisma, не Netlify).
- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- Не редагуй CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- НЕ запускай pm2.
- НЕ міняй DB schema, env vars, runtime код.
- НЕ створюй нові routes/components — це pure tooling/CI/docs session.
