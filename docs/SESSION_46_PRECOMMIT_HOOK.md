# Session 46 — Worker Task: Pre-commit Format Hook

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P2 (CI hygiene — позбутися false-red на orchestrator-only docs commits)
**Очікуваний ефорт:** 30 хвилин
**Тип:** worker session

---

## Контекст

CI падає red на commits де лише .md файли змінені (S43/S44/S45 spec, fe34670 docs Supabase, d71f4e2 docs S43 merge тощо). Причина: orchestrator пише spec файли і HISTORY.md дописи без `prettier --write`, потім push на main, CI запускає `pnpm format:check` і падає на тривіальних line-length / quote-style issues.

Runtime ОК (deploy чисті, всі endpoints живі), але історія red X у Actions виглядає погано і не дисциплінує.

S46 додає `husky` + `lint-staged` pre-commit hook що автоматично запускає `prettier --write` на staged файлах перед commit. Це гарантує що ніщо не потрапить у git зі stale формату.

---

## Branch

`claude/session-46-precommit-hook` від main.

---

## Hard rules

1. Конфіг — root package.json (workspace root). НЕ окремий пакет.
2. `husky` v9+ (нова init API через `pnpm dlx husky init`).
3. `lint-staged` config на `*.{ts,tsx,js,jsx,json,md}` → `prettier --write`.
4. Hook має пропускатись з `--no-verify` (щоб emergency commits проходили).
5. CI-side `format:check` не міняти — він залишається як safety net.
6. Verify: створити test commit з deliberately mis-formatted файлом і переконатись що hook його auto-format-ує перед commit.

---

## Файли

### 1. `package.json` (root) — додати deps + lint-staged config + prepare script

```json
{
  "scripts": {
    ...
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md}": "prettier --write"
  }
}
```

Версії точні визначає worker (latest stable від npm).

### 2. `.husky/pre-commit` (new)

```sh
pnpm exec lint-staged
```

(Husky 9+ не потребує boilerplate header — просто команда.)

### 3. `.husky/_/` — auto-generated husky internals (commit-нути).

### 4. (опціонально) Update `CONTRIBUTING.md` або CLAUDE.md note що hook існує.

---

## Команди для worker (приблизно)

```bash
cd /home/user/ltex-ecosystem
pnpm add -Dw husky lint-staged
pnpm dlx husky init
echo 'pnpm exec lint-staged' > .husky/pre-commit
chmod +x .husky/pre-commit
```

Потім додати `lint-staged` config у root `package.json` (manually edit — `pnpm` не додає його через CLI).

Test:

```bash
echo "## Test\n\nbad style    " > /tmp/test.md
git add /tmp/test.md
git commit -m "test"
# Hook має auto-format-увати файл і він піде у commit чистий.
```

(Або: створити test.md у repo root, commit, перевірити що hook викликається. Потім видалити.)

---

## Verification

- `pnpm format:check` — ✅ (не зламали format у себе)
- `pnpm -r typecheck` — ✅ (нічого не зачепили в коді)
- `pnpm -r test` — ✅ 271/271
- Hook test: deliberate misformat → commit → файл auto-fixed.

---

## Out-of-scope

- ESLint pre-commit (зараз нема eslint config у root)
- typecheck pre-commit (повільно, не варто блокувати кожен commit)
- Pre-push hook (CI на main достатньо)
- Custom commit message linter
- Git hooks для Claude Code (orchestrator пушить через його git tools, hook все одно має спрацювати — git викликає hook, не shell)

---

## Branch + commit + push

Branch: `claude/session-46-precommit-hook`
Commit: `chore(s46): husky + lint-staged pre-commit format hook`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Без deploy.ps1 — це dev-time hook, runtime не зачіпає. Worker сам виконав `pnpm install` локально, server після `git pull` сам `pnpm install --frozen-lockfile` у [2/8] кроку deploy.ps1 і husky встановиться через `prepare` script.
