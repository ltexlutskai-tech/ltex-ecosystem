# Session 19 — Worker Task: Decompose CLAUDE.md

**Створено orchestrator-ом:** 2026-04-22
**Пріоритет:** P3 (process / docs improvement)
**Очікуваний ефорт:** 2 години
**Тип:** worker session (пише код, пушить feature branch, orchestrator мерджить)

---

## Контекст

`CLAUDE.md` на сьогодні = **1783 рядки**, ~140 KB. Кожна worker-сесія мусить прочитати цей файл цілком перед роботою. Файл змішує:

1. Business overview (стабільне)
2. Current status (змінюється щосесії)
3. Full architecture (стабільне, рідко оновлюється)
4. File tree (оновлюється при великих змінах)
5. Database schema (оновлюється при нових моделях)
6. Completion reports Sessions 4-17 (історичні, змінюються тільки додаванням нових)
7. Tasks for next session (змінюється щосесії)
8. Orchestration workflow (стабільне)
9. Infrastructure status (змінюється при міграціях)
10. Tech stack (стабільне)

Проблеми:
- Новий worker може пропустити щось критичне серед 1783 рядків
- Git-diff на оновлення статусу псується через великий файл
- Історія сесій 4-17 займає ~60% файлу, але потрібна рідко
- Оркестратор має переписувати секції "Tasks" всередині великого файлу, плутаючи з історією

**Мета:** розбити на логічні файли, зберегти CLAUDE.md як короткий overview з посиланнями.

---

## Branch

Створити `claude/session-19-decompose-claude-md` від main.

**ВАЖЛИВО:** перед створенням — спочатку мерджити `claude/audit-ltex-project-bdZol` у main (orchestrator зробить це перед запуском цієї сесії). Новий worker-branch має містити файл `PROJECT_AUDIT_2026-04-18.md`.

---

## Hard rules

1. **НЕ ламати CI** — після розбиття `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` мають бути green
2. **НЕ втратити жоден рядок контенту** — вся інформація має залишитись, просто переміститись у правильний файл
3. **НЕ редагувати код** — це документаційна задача, ніяких змін у `apps/`, `packages/`, `services/`
4. **НЕ видаляти PROJECT_AUDIT_2026-04-18.md** — він залишається у корені або переноситься у `docs/`
5. **НЕ чіпати** CONTRIBUTING.md, DEPLOYMENT.md, README.md — вони вже структуровані окремо

---

## Цільова структура

```
ltex-ecosystem/
├── CLAUDE.md                          ← короткий overview + посилання (~200 рядків max)
├── README.md                          ← без змін
├── CONTRIBUTING.md                    ← без змін
├── DEPLOYMENT.md                      ← без змін
├── PROJECT_AUDIT_2026-04-18.md        ← залишити у корені (історичний snapshot)
└── docs/
    ├── ARCHITECTURE.md                ← стек, file tree, DB schema, integrations
    ├── HISTORY.md                     ← completion reports Sessions 4-17
    ├── CONVENTIONS.md                 ← "do not touch" list, technical decisions, env vars
    ├── SESSION_TASKS.md               ← ТІЛЬКИ поточні + найближчі задачі
    └── SESSION_19_DECOMPOSITION.md    ← цей файл (залишити як артефакт спеки)
```

---

## Детальний розподіл секцій

### `CLAUDE.md` (новий, короткий)

Залишити тільки:

```markdown
# L-TEX Ecosystem — Project Context

## Business Overview
<повний блок 1:1 як зараз, рядки 1-9>

## Current Status (2026-04-22)
- Branch: main
- Site LIVE: https://new.ltex.com.ua (Cloudflare Tunnel + Windows Server)
- Netlify deprecated: stalwart-dango-04a9b9.netlify.app (fallback)
- Session 18 complete: cloudflared deploy, PM2 autostart, PostgreSQL backups, UptimeRobot
- Database: 805 products, 725 lots, 49 categories, 22 Prisma моделі
- CI green: 220 unit + 36 E2E tests, TypeScript strict, 0 `any`

## Quick Navigation

| Документ | Коли читати |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, file tree, integrations, DB schema |
| [docs/HISTORY.md](docs/HISTORY.md) | Що робилось у Sessions 4-18 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Do-not-touch list, technical decisions |
| [docs/SESSION_TASKS.md](docs/SESSION_TASKS.md) | Що треба зробити далі |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Як деплоїти на Windows Server |
| [PROJECT_AUDIT_2026-04-18.md](PROJECT_AUDIT_2026-04-18.md) | Повний audit snapshot |

## Critical Rules for All Sessions

1. DO NOT repeat Sessions 4-18 — ALL DONE. Див. docs/HISTORY.md.
2. DO NOT touch `output: 'standalone'` у next.config.js — critical для self-hosted build.
3. DO NOT touch server infrastructure (PM2 Task, cloudflared service, backup script) без конкретної потреби.
4. DO NOT break CI — запускай `pnpm format:check && pnpm -r typecheck && pnpm -r test` перед push.
5. L-TEX НЕ приймає онлайн-оплати — таблиця `payments` тільки для відображення з 1С.

## Orchestrator / Worker Workflow
<повний блок Orchestration Workflow з поточного CLAUDE.md, рядки 1588-1622>

## Tech Stack
<повний блок Tech Stack з поточного CLAUDE.md, рядки 1761-1773>

## Important Notes
<повний блок Important Notes з поточного CLAUDE.md, рядки 1775-1783>
```

**Target line count: 150-200 рядків**

### `docs/ARCHITECTURE.md`

Перенести з CLAUDE.md:

- Секція "What Exists Now" (file tree з коментарями)
- "Database Schema (Prisma, 22 tables)" — таблиця + Seed Data Stats
- "Key Technical Decisions" (пронумерований список 1-13)
- "Environment Variables Required"
- "URL Structure"
- Блок "Tests" (unit test files breakdown + E2E files)

Оригінальні рядки у поточному CLAUDE.md: ~37-305.

### `docs/HISTORY.md`

Перенести з CLAUDE.md:

- Session 4 Completion Report
- Session 5 Completion Report
- Session 6 Completion Report
- Session 7 Completion Report
- Orchestrator Review (Session 8 Planning)
- Session 8 Completion Report
- Session 9 Completion Report
- Session 10 Completion Report
- Session 13 Completion Report
- Session 14 Completion Report
- Session 15 Completion Report
- Session 16 Completion Report
- Session 17 Completion Report
- (Session 18 додати — cloudflared tunnel + backups + monitoring)

**ВАЖЛИВО для Session 18:** orchestrator ще не задокументував Session 18 у CLAUDE.md. Воркер не вигадує деталі. Додати лише заголовок-placeholder:

```markdown
## Session 18 Completion Report (2026-04-18+) — Cloudflare Tunnel Deploy

**Status:** Complete (детальний звіт ще не задокументовано orchestrator-ом)

**Ключові зміни:**
- Cloudflare Tunnel для https://new.ltex.com.ua
- PM2 Scheduled Task з 60s delay для автостарту
- Daily PostgreSQL backup до E:\ltex-backups\ з 14-day retention
- UptimeRobot моніторинг (3 monitors, email alerts)
- Windows Server 2022 деплой через deploy.ps1

**Детальний звіт:** TODO — orchestrator додасть при наступній сесії.
```

Секція "Branch Cleanup" з кожної сесії — вирізати (зараз застаріла).

Оригінальні рядки: розкидано по всьому CLAUDE.md.

### `docs/CONVENTIONS.md`

Перенести з CLAUDE.md:

- "IMPORTANT" блок з Current Status (рядки 17-35):
  - DO NOT repeat seed/merge/infrastructure setup
  - DO NOT re-run Sessions 4-14
  - DO NOT touch outputFileTracingIncludes / PrismaPlugin / serverExternalPackages
  - L-TEX НЕ приймає онлайн-оплати
  - Session 15 output: 'standalone' constraint
  - Session 16 Security Hardening constraints
  - Session 17 Pre-Deploy Security Fixes constraints
- "Existing Systems (for reference)" — catalog-full, existing 1С, MobileAgentLTEX
- "1C Integration Strategy"
- "Infrastructure" блок (Supabase, Netlify details)
- "Prerequisites / remaining setup" checklist

### `docs/SESSION_TASKS.md`

Поточні + найближчі задачі. Базуватися на аудиті `PROJECT_AUDIT_2026-04-18.md` §6 та §11.

Секції:
- **P0 Blockers** (контент, 1С verify, smoke test) — з таблицею (з CLAUDE.md current state)
- **P1 Important** (Umami, Email, RLS, FTS, log rotation)
- **P2 Post-deploy security** (CSP, Mobile SSE, X-Forwarded-For, Telegram webhook validation, console audit)
- **P3 Tech debt** (E2E gate, protected branches, retry/DLQ, revalidatePath cleanup, Dependabot)
- **Strategic** (Mobile Agent, Warehouse App, Mobile EAS, Multi-language)
- **Open business questions** (20 пунктів з §12 аудиту)

Структура кожного пункту: Задача | Тип (user-action / worker / orchestrator) | Ефорт | Статус.

Видалити з CLAUDE.md всі "Tasks for next session — previous (Session 13 plan, archived)" blocks — вони історичні, не потрібні.

### `docs/SESSION_19_DECOMPOSITION.md`

Залишити цей файл (саму специфікацію) як артефакт, нагадування про декомпозицію.

---

## Покрокова інструкція для воркера

### Крок 1: Pull + create branch

```bash
git checkout main
git pull origin main
git checkout -b claude/session-19-decompose-claude-md
```

Перевір що `PROJECT_AUDIT_2026-04-18.md` і `docs/SESSION_19_DECOMPOSITION.md` у робочій копії (з main).

### Крок 2: Створити нові файли

Послідовно створи:
1. `docs/ARCHITECTURE.md` — копіювати відповідні блоки з CLAUDE.md
2. `docs/HISTORY.md` — все що "Session X Completion Report" + Orchestrator Review
3. `docs/CONVENTIONS.md` — IMPORTANT rules, existing systems, 1C strategy, infrastructure
4. `docs/SESSION_TASKS.md` — поточні задачі, витягнуті з PROJECT_AUDIT_2026-04-18.md та CLAUDE.md

**Правило:** копіюй ідентично, не переписуй своїми словами. Форматування Markdown зберегти 1:1 (таблиці, code blocks, списки).

### Крок 3: Переписати CLAUDE.md

Замінити на коротку версію (див. "Цільова структура" → "CLAUDE.md" вище). Target: ~150-200 рядків.

### Крок 4: Верифікація

```bash
# Впевнись що жодне посилання у Markdown не зламане
grep -r "CLAUDE.md" --include="*.md" apps/ packages/ services/ scripts/ 2>/dev/null
# Якщо знайдеш — можна залишити, бо CLAUDE.md існує, просто скоротився

# Перевір що обсяг контенту не зменшився (сума рядків у нових файлах > original CLAUDE.md - deleted cruft)
wc -l CLAUDE.md docs/ARCHITECTURE.md docs/HISTORY.md docs/CONVENTIONS.md docs/SESSION_TASKS.md

# Типовий очікуваний розподіл:
# CLAUDE.md             ~ 200 рядків
# docs/ARCHITECTURE.md  ~ 300 рядків
# docs/HISTORY.md       ~ 900 рядків (completion reports)
# docs/CONVENTIONS.md   ~ 200 рядків
# docs/SESSION_TASKS.md ~ 200 рядків
# Разом: ~1800 рядків (близько до оригінального 1783 + декілька navigation headers)
```

### Крок 5: CI перевірка

```bash
pnpm format:check
pnpm -r typecheck
pnpm -r test
pnpm build
```

Всі 4 кроки — PASS. Якщо format:check падає на нових `.md` — `pnpm exec prettier --write docs/*.md CLAUDE.md`.

### Крок 6: Commits

Розбити на 2 коміти:

1. `docs: split CLAUDE.md into ARCHITECTURE / HISTORY / CONVENTIONS / SESSION_TASKS` — всі нові файли + short CLAUDE.md
2. (опційно) `docs: cross-reference links between CLAUDE.md and docs/*` — якщо потрібні додаткові виправлення посилань

Краще — один commit, атомарно.

### Крок 7: Push

```bash
git push -u origin claude/session-19-decompose-claude-md
```

Orchestrator мерджить у main після review.

---

## Verification checklist

- [ ] `CLAUDE.md` ≤ 250 рядків
- [ ] `docs/ARCHITECTURE.md`, `docs/HISTORY.md`, `docs/CONVENTIONS.md`, `docs/SESSION_TASKS.md` створено
- [ ] Сума рядків нових файлів + короткий CLAUDE.md ≈ оригінальний CLAUDE.md (±5%)
- [ ] У `CLAUDE.md` є посилання `[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)` тощо — всі працюють
- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS (6/6 packages)
- [ ] `pnpm -r test` — PASS (220+ unit)
- [ ] `pnpm build` — PASS
- [ ] Жоден файл у `apps/`, `packages/`, `services/` не змінено (перевір `git diff --stat main -- apps packages services`)
- [ ] Branch pushed до origin

---

## Out of scope (НЕ робити)

- Не переписувати зміст своїми словами — копіювати ідентично з оригіналу
- Не об'єднувати completion reports — кожен Session N Completion Report залишається окремим розділом
- Не додавати нові "recommendations" або "analysis" — файл це тільки структурна реорганізація
- Не змінювати README / CONTRIBUTING / DEPLOYMENT
- Не чіпати `PROJECT_AUDIT_2026-04-18.md` (залишити у корені як snapshot)
- Не створювати нові тести
- Не оновлювати dependency versions
- Не рефакторити код

---

## Очікуваний результат після merge

1. Нові воркер-сесії читають коротший `CLAUDE.md` (~200 рядків замість 1783)
2. Якщо потрібні деталі — переходять у відповідний `docs/*.md`
3. Орkestrator при плануванні редагує тільки `docs/SESSION_TASKS.md`, не весь CLAUDE.md
4. При додаванні нового completion report — редагується тільки `docs/HISTORY.md`
5. Git diff стає читабельнішим (зміна статусу ≠ великий diff через великий файл)
