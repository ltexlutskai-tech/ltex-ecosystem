# Session 40 — Worker Task: Fix deploy.ps1 step [4/8] hang when PM2 holds node

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (deploy reliability — другий поспіль deploy висне без `taskkill`)
**Очікуваний ефорт:** 30-60 хвилин
**Тип:** worker session (atomic, тільки `scripts/deploy.ps1`)

---

## Контекст

S37 → S39 закрили decade попередніх теорій про PowerShell stdout buffering. Зараз `scripts/deploy.ps1` step [4/8] виглядає так (S39 final):

```powershell
if (-not $SkipBuild) {
    Write-Host "`n[4/$TotalSteps] Building store..." -ForegroundColor Cyan
    pnpm --filter @ltex/store run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: build failed (exit $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}
```

Це працює коли node не запущений. Ламається у такому сценарії (відтворено двічі — у S39 фінальному deploy + у S34 deploy 2026-04-27):

1. Користувач робить успішний deploy → PM2 запускає `apps/store/.next/standalone/...server.js` як cluster.
2. Користувач трохи пізніше робить ще один deploy.
3. Step [4/8] `next build` друкує до рядка `· serverActions` і висне на невизначений час.
4. Workaround: Ctrl+C → `taskkill /F /IM node.exe` (вбиває і PM2-managed cluster) → знову `.\scripts\deploy.ps1` → проходить за 5-8с.

Гіпотеза: `next build` (Next 15.5.14, output: 'standalone') захоплює якийсь shared resource — найімовірніше lock на `apps/store/.next/cache` АБО Webpack PnP daemon — який тримає попередній PM2 cluster (або swc дочірній процес).

S40 фіксить це автоматично — або ставимо `pm2 stop ltex-store` перед build і `pm2 restart` після, або інший детермінований спосіб уникнути зависання.

---

## Branch

`claude/session-40-deploy-pm2-node-lock` від main.

---

## Hard rules

1. **НЕ** додавати редирект stdout у `cmd /c`, `Tee-Object`, `Start-Process -RedirectStandardOutput`. **Direct pnpm call залишається**, доведено працює.
2. **НЕ** ламати existing happy-path: cold boot deploy (PM2 не запущений) має проходити без зайвих повідомлень.
3. **НЕ** робити `taskkill /F /IM node.exe` — це вбиває ВСЕ node на сервері включно з telegram/viber bot процесами якщо вони запущені окремо. Точкова операція через PM2 only.
4. **НЕ** чіпати `ecosystem.config.js`, cloudflared service, backup script.
5. ASCII-only у `.ps1`. Idempotent.
6. CI лишається green (build тести не зачіпає, але worker запускає `pnpm format:check`).

---

## Перед стартом — research

Worker МАЄ перш ніж писати:

1. Знайти що саме блокує `next build`. Запустити двічі `.\scripts\deploy.ps1` локально (НЕ можеш — Windows-only, але user це зробить за командою) і:
   - Під час hang дивитись `Get-Process node | Format-Table Id, ProcessName, MainWindowTitle, StartTime`.
   - `Get-ChildItem apps/store/.next -Recurse | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-5) }` — чи є lock файли.
   - `pm2 list` — стан cluster.
2. Worker не запускає це сам. **У першому коміті** додай у spec файл коротке `## Repro & probe` з командами, які user виконає на сервері і пришле виводи. На основі них — фінальне рішення.

Альтернативно — workaround based на гіпотезі (швидше, але менш точно):

### Гіпотеза A: PM2 cluster тримає `.next/cache`

Рішення: stop → build → start.

```powershell
# Перед step [4/8]:
$pm2HasLtex = $false
try {
    $list = pm2 jlist 2>$null
    if ($list -and $list -match '^\s*\[') {
        $parsed = $list | ConvertFrom-Json -ErrorAction Stop
        $pm2HasLtex = [bool]($parsed | Where-Object { $_.name -eq "ltex-store" })
    }
} catch { $pm2HasLtex = $false }

if ($pm2HasLtex) {
    Write-Host "  Stopping PM2 ltex-store before build..." -ForegroundColor Yellow
    pm2 stop ltex-store > $null 2>&1
    # Wait briefly for the OS to release file locks.
    Start-Sleep -Seconds 2
}

# ... existing build step ...

# Step [8/8] стартує з нуля бо ltex-store зупинений → existing logic
# (`pm2 start ecosystem.config.js --update-env`) спрацює.
```

### Гіпотеза B: SWC native binary daemon

Рішення: примусове `Remove-Item apps/store/.next/cache/swc -Recurse -ErrorAction SilentlyContinue` перед build.

### Гіпотеза C: `next` daemon (deprecated, але існує)

Рішення: `pnpm --filter @ltex/store exec next -- --turbo=false` АБО `--no-daemon`.

### Що робити worker-у

**Не комбінувати все одразу.** Спершу гіпотеза A (найбільш реалістична). Якщо user повідомить що зависання повторюється — наступна сесія S41 з гіпотезами B/C.

---

## Tasks

### Task 1: Add PM2 stop before build in step [4/8]

`scripts/deploy.ps1`. Перед існуючим блоком `if (-not $SkipBuild)`:

```powershell
# 4-prep. Stop ltex-store cluster if it's running so the cluster's
# node.exe processes release any locks they hold on apps/store/.next/cache
# or the SWC binary cache. Without this the second consecutive deploy
# hangs in `next build` after printing the "serverActions" experiment line.
# Verified twice in S39 + S34 deploys.
if (-not $SkipBuild) {
    $pm2HasLtex = $false
    try {
        $list = pm2 jlist 2>$null
        if ($list -and $list -match '^\s*\[') {
            $parsed = $list | ConvertFrom-Json -ErrorAction Stop
            $pm2HasLtex = [bool]($parsed | Where-Object { $_.name -eq "ltex-store" })
        }
    } catch { $pm2HasLtex = $false }

    if ($pm2HasLtex) {
        Write-Host "  Stopping ltex-store before build (avoids .next/cache lock)..." -ForegroundColor Yellow
        pm2 stop ltex-store > $null 2>&1
        Start-Sleep -Seconds 2
    }
}
```

Існуючий step [8/8] PM2 logic from S37 уже handle-ить "process is stopped" → fresh `pm2 start`. Перевір `scripts/deploy.ps1` lines ~108-135 щоб переконатися що логіка не зламається коли `pm2 jlist` знаходить process у status `stopped`.

### Task 2: Verification by user

Worker НЕ може запустити .ps1. У commit message чітко проси user:

```
User repro to verify (на Windows Server):
1. .\scripts\deploy.ps1 (cold або hot — будь-який стан)
2. Зачекати завершення deploy (PM2 online).
3. Знову .\scripts\deploy.ps1 — це той сценарій що раніше висів.
4. Очікуваний результат: step [4/8] виводить "Stopping ltex-store before build...", потім build пройде за 5-8с, потім step [8/8] стартує заново через pm2 start ecosystem.config.js --update-env.
```

### Task 3: ASCII check + format

```bash
LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1
pnpm format:check
pnpm -r typecheck
pnpm -r test
```

Має все бути green. Worker не зачіпає тести / TS — лише `.ps1`.

### Task 4: Документація

Додай у `scripts/deploy.ps1` верхній коментар (header) one-liner про новий етап:

```
# Workflow: pull → install → prisma → (stop pm2 if running) → build →
#           copy static → copy prisma engine → sync .env → restart pm2
```

---

## Out of scope

- Healthcheck після PM2 start — окрема задача (ping `/api/health` після `pm2 start`)
- PM2 log rotation (P1 #12 у SESSION_TASKS.md) — окрема сесія
- Перехід на `pm2-installer` (PM2 як Windows Service) — окрема велика задача
- Migration на pnpm 10 / Prisma 7 — окрема сесія, breaking change
- ANALYZE=true bundle snapshot — окрема задача (P3 #43)

---

## Commit strategy

```
fix(deploy): stop ltex-store before build to avoid .next/cache lock (S40)

Second-consecutive deploy hung in step [4/8] after printing the
"serverActions" experiment line. The hang reproduced twice (S39
final deploy + S34 deploy on 2026-04-27) and resolved each time
by `taskkill /F /IM node.exe`, indicating that the running PM2
ltex-store cluster held a lock on apps/store/.next/cache or the
SWC binary cache.

Add a small prelude to step [4/8] that runs `pm2 stop ltex-store`
when the cluster is currently running, then sleeps 2s for the OS
to release file handles. Step [8/8] already handles the "process
stopped" path via fresh `pm2 start ecosystem.config.js` so no
further changes are needed.

Cold boot path (PM2 not running) is unaffected: the stop branch
is gated on `pm2 jlist` matching name=ltex-store.
```

---

## Push

```bash
git push -u origin claude/session-40-deploy-pm2-node-lock
```
