# Session 37 — Worker Task: Deploy Script Hardening v2 (PowerShell flush + PM2 resilience)

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (deploy reliability — щоразу падає на build hang та PM2 daemon)
**Очікуваний ефорт:** 30-40 хвилин
**Тип:** worker session (small / атомарний)

---

## Контекст

S27 уже зробив 3 фікси (direct build, .env sync, --update-env), але два issues лишилися:

1. **Next.js build hang**: `pnpm --filter @ltex/store run build` всередині PowerShell висить після рядка `· serverActions` (Next.js compiler не флашить stdout у PowerShell без TTY). Workaround що працює: `pnpm ... 2>&1 | Tee-Object -FilePath build.log` — Tee форсить line-buffered I/O. Без нього кожен deploy = ручний танок.

2. **PM2 step падає коли daemon не запущений**:

   ```powershell
   $pm2List = pm2 jlist 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
   ```

   Якщо PM2 daemon мертвий (бо user робив `Stop-Process node` для recovery), `pm2 jlist` друкує friendly text "PM2 ..." при підняті daemon, що **не валідний JSON** → `ConvertFrom-Json` падає з `Недопустимый примитив JSON: PM2`. Скрипт виходить з помилкою, user далі вручну робить `pm2 start ecosystem.config.js`.

S37 — закрити обидва issues постійно, щоб `.\scripts\deploy.ps1` запускався чистим прогоном після будь-якого стану (cold boot, blackout recovery, kill node, fresh checkout).

---

## Branch

`claude/session-37-deploy-hardening-v2` від main.

---

## Hard rules

1. **НЕ ламати** existing deploy contract: ті ж шлях / флаги / poведiнка
2. **НЕ чіпати** PM2 ecosystem.config.js, cloudflared service, backup scripts
3. **НЕ редагувати** next.config.js
4. ASCII only у `.ps1` (без em-dash, кутових лапок) — PowerShell parser у cp1251 console
5. Idempotent — повторний запуск після падіння не ламає state
6. **НЕ комітити** жодних `.env` / `.log` файлів. `build.log` додати у `.gitignore` якщо ще немає

---

## Tasks

### Task 1: Tee-Object pipe для крок [4/8] build

**Файл:** `scripts/deploy.ps1`, крок `[4/$TotalSteps] Building store...`

**Поточний код:**

```powershell
if (-not $SkipBuild) {
    Write-Host "`n[4/$TotalSteps] Building store..." -ForegroundColor Cyan
    pnpm --filter @ltex/store run build
} else {
    Write-Host "`n[4/$TotalSteps] Skipping build (--SkipBuild)" -ForegroundColor Yellow
}
```

**Замінити на:**

```powershell
if (-not $SkipBuild) {
    Write-Host "`n[4/$TotalSteps] Building store..." -ForegroundColor Cyan
    # Tee-Object forces line-buffered stdout so Next.js compiler output
    # appears in real time. Without the pipe, PowerShell block-buffers the
    # output and the build appears to hang indefinitely after printing the
    # "serverActions" experiment line.
    $BuildLog = Join-Path $RepoRoot "build.log"
    pnpm --filter @ltex/store run build 2>&1 | Tee-Object -FilePath $BuildLog
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: build failed - see $BuildLog" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[4/$TotalSteps] Skipping build (--SkipBuild)" -ForegroundColor Yellow
}
```

**Note:** `$LASTEXITCODE` ловить exit code попередньої команди у pipeline. Tee-Object не змінює exit code. Якщо Next.js падає (TypeScript error, etc.) — скрипт зупиняється з error message замість того щоб мовчки продовжити.

### Task 2: Robust PM2 step

**Файл:** `scripts/deploy.ps1`, крок `[8/$TotalSteps] Restarting PM2...`

**Поточний код:**

```powershell
Write-Host "`n[8/$TotalSteps] Restarting PM2..." -ForegroundColor Cyan
$pm2List = pm2 jlist 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
$isRunning = $pm2List | Where-Object { $_.name -eq "ltex-store" }
if ($isRunning) {
    pm2 restart ltex-store --update-env
} else {
    pm2 start ecosystem.config.js
}
pm2 save
```

**Замінити на:**

```powershell
Write-Host "`n[8/$TotalSteps] Restarting PM2..." -ForegroundColor Cyan

# pm2 jlist can return non-JSON friendly text when the daemon is starting
# (e.g. after Stop-Process node, fresh checkout, or cold boot). Guard the
# JSON parse so we degrade to a fresh start rather than crashing the script.
$isRunning = $false
try {
    $rawList = pm2 jlist 2>$null
    if ($rawList -and $rawList -match '^\s*\[') {
        $pm2List = $rawList | ConvertFrom-Json -ErrorAction Stop
        $isRunning = [bool]($pm2List | Where-Object { $_.name -eq "ltex-store" })
    }
} catch {
    Write-Host "  PM2 daemon state unclear, will start fresh" -ForegroundColor Yellow
    $isRunning = $false
}

if ($isRunning) {
    pm2 restart ltex-store --update-env
} else {
    pm2 start ecosystem.config.js --update-env
}
pm2 save
```

**Що змінилось:**

- `pm2 jlist` обгорнуто у try/catch. Якщо output не починається з `[` (тобто не масив JSON) → не пробуємо парсити, одразу `$isRunning = $false`.
- `ConvertFrom-Json -ErrorAction Stop` — щоб catch гарантовано перехопив error. Friendly текст "PM2 ..." → catch → fresh start.
- `pm2 start ecosystem.config.js --update-env` (не просто `pm2 start ...`) — щоб process одразу мав свіжий env, не доводилось ще раз restartити.
- `pm2 save` — як і було.

### Task 3: Auto-recover якщо PM2 daemon dead

**Файл:** `scripts/deploy.ps1`, **перед** `pm2 jlist` (крок 8).

Додати ping-перевірку щоб впевнитись що daemon живий:

```powershell
# Wake the PM2 daemon if it's not running. `pm2 ping` is cheap and idempotent;
# if the daemon is dead it spawns a new one. This avoids the "first jlist
# returns startup banner instead of JSON" race that breaks ConvertFrom-Json.
pm2 ping > $null 2>&1
```

Розташування — **відразу після** `Write-Host "[8/$TotalSteps] Restarting PM2..."` і **перед** try/catch блоком.

### Task 4: .gitignore for build.log

**Файл:** `.gitignore` (root). Якщо ще немає — додати:

```
# Deploy build logs (generated by scripts/deploy.ps1)
build.log
```

Якщо `.gitignore` уже містить `*.log` загальним патерном — нічого не додавати.

### Task 5: Verify ASCII-only constraint

ASCII grep має лишатися чистим:

```bash
LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1
```

Має повернути 0 рядків. Worker не використовує em-dash, кутові лапки, тощо у нових коментарях/повідомленнях.

---

## Verification

Worker НЕ може запустити `.ps1` (Windows-only). Verification — статичні чеки:

- [ ] `LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1` → 0 рядків
- [ ] `pnpm format:check` — pass
- [ ] `pnpm -r typecheck` — pass
- [ ] `pnpm -r test` — pass (243 baseline)
- [ ] `pnpm build` — pass (web build не зачеплено)
- [ ] git diff: тільки `scripts/deploy.ps1` + `.gitignore` (якщо змінено)
- [ ] PowerShell syntax sanity: відкрити файл і переконатися що дужки/blocks збалансовані (можна через `bash -c "cat scripts/deploy.ps1 | head -20"`)

---

## Out of scope (НЕ робити)

- Health check у скрипті (Task 5 з S27 — досі optional, пропускаємо)
- PM2 daemon як Windows Service (через `pm2-installer`) — окрема S38, потребує admin install
- Cold-boot після blackout (auto-resurrect with Postgres dependency) — окрема S38
- Migration на pnpm 10 (warning у логах) — окрема сесія, breaking change
- Migration на Prisma 7 (warning у логах) — окрема сесія, breaking change
- GitHub Actions self-hosted runner — окрема сесія

---

## Commit strategy

```
chore(deploy): hardening v2 (Tee-Object flush + PM2 daemon resilience)

After S27 deploy script still required two manual workarounds:

1. Build hang on PowerShell. Next.js compiler block-buffers stdout
   when not running under a TTY, so the build appears frozen after
   printing the "serverActions" experiment line. Solution: pipe
   stdout through Tee-Object which forces line-buffered I/O. Output
   now streams in real time and is also captured to build.log for
   post-mortem.

2. PM2 step crashed when daemon was not running (typical after
   Stop-Process node or fresh checkout). pm2 jlist returns a
   non-JSON banner during daemon startup, breaking ConvertFrom-Json.
   Solution: pm2 ping wakes the daemon first; jlist parse is then
   wrapped in try/catch with regex sanity check; fallback to a clean
   pm2 start ecosystem.config.js --update-env on any failure.

Also: $LASTEXITCODE check after build so the script exits early on
TypeScript errors instead of attempting to copy a missing standalone
tree. build.log added to .gitignore.

Result: deploy.ps1 now runs cleanly end-to-end after blackout
recovery / cold boot / kill-all-node, with no manual fallback needed.
```

---

## Push

```bash
git push -u origin claude/session-37-deploy-hardening-v2
```

Звіт мені:

- branch (із суфіксом)
- Чи non-ASCII grep чистий
- Чи `.gitignore` мав `*.log` уже (так/ні, як вирішив)
