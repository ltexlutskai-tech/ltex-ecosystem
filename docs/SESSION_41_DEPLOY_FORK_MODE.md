# Session 41 — Worker Task: Fix deploy.ps1 hang via `pm2 delete` + fork mode

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P0 (deploy reliability — кожен другий поспіль deploy завис, S40 не закрив)
**Очікуваний ефорт:** 30-45 хвилин
**Тип:** worker session (atomic)

---

## Контекст

S40 додав prelude `pm2 stop ltex-store` перед step [4/8] під гіпотезою A (cluster тримає `.next/cache` lock). Не спрацювало — на наступному deploy build знову завис на тому самому місці. Probe на сервері (`Get-Process node | Format-Table Id, StartTime`) виявив **orphan node-процеси** від попереднього deploy:

```
   Id StartTime           WorkingSet
   -- ---------           ----------
 6432 27.04.2026 20:55:49  145158144   <-- orphan PM2 cluster worker з вчора
11820 28.04.2026 12:29:36   81080320   <-- сьогоднішній (pnpm/prisma daemon?)
12600 28.04.2026 12:29:36   88494080   <-- сьогоднішній
16780 27.04.2026 20:55:48   54853632   <-- orphan PM2 cluster worker з вчора
```

`Get-ChildItem apps\store\.next` показав свіжі writes у `apps\store\.next\standalone\apps\store\.next\cache\fetch-cache\...` — це **Next.js ISR fetch cache**, який пишеться в runtime cluster worker-ами. Поки orphan node-процеси живі і пишуть туди, новий `next build` блокується.

**Корінь:** PM2 cluster mode на Windows. `pm2 stop ltex-store` повідомляє daemon "stop", але **cluster worker-и (`node.exe`) не вбиваються чисто** — стають orphan-ами. PM2 daemon бачить `status=stopped`, тому S40 prelude `pm2 jlist` після першого stop не знаходить ltex-store і skip-ає stop при наступному deploy → orphans продовжують жити декілька днів.

`taskkill /F /IM node.exe` ламає cycle (вбиває orphans) — тому single-shot deploy після taskkill завжди проходить. Але це не рішення для script-а: вб'є telegram-bot, viber-bot та інші nodе процеси.

---

## Branch

`claude/session-41-deploy-pm2-fork-mode` від main.

---

## Hard rules

1. НЕ робити `taskkill /F /IM node.exe` — це вб'є telegram-bot/viber-bot процеси.
2. НЕ редагувати `next.config.js`, cloudflared service, backup script.
3. НЕ робити Tee-Object/cmd /c/Start-Process redirect у step [4/8] — direct pnpm працює.
4. ASCII-only у `.ps1`. Idempotent script.
5. CI green: 246 unit + format + typecheck + build.

---

## Рішення (комбіноване)

Worker реалізовує **обидва** наступні зміни — вони доповнюють одна одну.

### Fix 1: `ecosystem.config.js` — cluster → fork mode

**Файл:** `ecosystem.config.js` (root проєкту)

Поточно:

```js
exec_mode: "cluster",
instances: 1,
```

Замінити на:

```js
exec_mode: "fork",
instances: 1,
```

**Чому:** `cluster` mode на Windows використовує internal `cluster` module Node.js, який спавнить child workers через handle-passing. PM2 на Windows має відомі проблеми graceful-shutdown цих cluster workers (orphans, Stack Overflow trail про це з 2023+). `fork` mode = одинарний детермінований node-процес, PM2 його SIGTERM-ить чисто. На single-instance setup різниці у performance немає.

**Перевір:** `cat ecosystem.config.js` перед і після — переконайся що інші поля (`name`, `script`, `cwd`, `env`, etc.) НЕ зачеплені.

### Fix 2: `scripts/deploy.ps1` — `pm2 delete` замість `pm2 stop`

**Файл:** `scripts/deploy.ps1`, секція "4-prep" (додана в S40, lines 41-62).

Поточний блок виглядає так (S40):

```powershell
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

Замінити на:

```powershell
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
        Write-Host "  Removing ltex-store before build (releases .next locks)..." -ForegroundColor Yellow
        # `pm2 delete` removes the process from PM2 registry AND kills its
        # node.exe workers (in fork mode this is the single process; in
        # cluster mode this is what `pm2 stop` should have done but doesn't
        # reliably on Windows). Step [8/8] re-creates the process from
        # ecosystem.config.js so the registry is clean by the end of deploy.
        pm2 delete ltex-store > $null 2>&1
        Start-Sleep -Seconds 2
    }
}
```

**Що змінилось:**

- `pm2 stop ltex-store` → `pm2 delete ltex-store`
- Коментар оновлений
- Решта block-у (try/catch навколо jlist parsing) лишається без змін.

**Чому `delete` а не `stop`:**

- `pm2 stop` залишає process у PM2 registry зі status=stopped, але через cluster mode bug на Windows worker-и `node.exe` лишаються живі як orphans.
- `pm2 delete` видаляє з registry **і** примусово SIGKILL-ить workers через PM2 daemon (та сама поведінка для fork та cluster). Plus — registry чиста, наступний `pm2 start ecosystem.config.js` стартує детерміновано.
- Trade-off: `pm2 list` після `delete` не покаже історичну метрику (uptime з попереднього старту). Це OK — у нас `pm2 logs` для діагностики, не `pm2 list`.

### Fix 3: orphan sweep (safety net)

**Файл:** `scripts/deploy.ps1`, **після** `pm2 delete` блока, **перед** step [4/8] build.

Додай scoped orphan kill — лише node.exe з командним рядком, що вказує на L-TEX standalone, не зачіпаючи telegram/viber:

```powershell
    # Sweep orphan node.exe processes that point at the L-TEX standalone tree.
    # PM2 cluster on Windows occasionally leaves these behind after `pm2 delete`
    # if a worker was mid-write to .next/cache. Targeted match on CommandLine
    # so we do not touch telegram-bot / viber-bot processes that live elsewhere.
    $orphans = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match 'apps[\\/]+store[\\/]+\.next[\\/]+standalone'
        }
    if ($orphans) {
        Write-Host "  Found $($orphans.Count) orphan ltex-store node process(es), terminating..." -ForegroundColor Yellow
        foreach ($p in $orphans) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 1
    }
```

Розташування — всередині того ж `if (-not $SkipBuild)` блоку, після existing `if ($pm2HasLtex) { ... }`.

---

## Tasks

### Task 1: ecosystem.config.js cluster → fork

Як описано вище. Один-два рядки змін.

### Task 2: deploy.ps1 — pm2 delete + orphan sweep

Як описано вище. ~15 рядків змін.

### Task 3: ASCII / format / verification

```bash
LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1   # 0 lines
LANG=C grep -P '[^\x00-\x7f]' ecosystem.config.js  # 0 lines
pnpm format:check                                   # green
pnpm -r typecheck                                   # 6/6 green
pnpm -r test                                        # 246/246 baseline
```

### Task 4: User repro plan (у commit message)

Worker не може запустити `.ps1`. У commit message чітко:

```
User repro on Windows Server (Тарас):
1. Pull main, run `.\scripts\deploy.ps1` — has to succeed even
   if previous PM2 cluster from yesterday is still running:
   * Step [4-prep] should print:
     "Removing ltex-store before build (releases .next locks)..."
     and possibly "Found N orphan ltex-store node process(es)..."
   * Step [4/8] build should complete in 5-8s.
   * Step [8/8] starts a FRESH ltex-store from ecosystem.config.js.
   In `pm2 list` the mode column should now show "fork" not "cluster".
2. Run `.\scripts\deploy.ps1` AGAIN immediately. This is the case
   that hung in S39/S34/S40. Expected: same output as run 1, no
   hang. Done in <30s end-to-end.
3. After 24h, run a third deploy. The orphan-from-yesterday case
   that triggered S41 should now be impossible because fork-mode
   workers die cleanly on `pm2 delete`.

If any run still hangs at step [4/8] — Ctrl+C, then in a second
PowerShell run:
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Select-Object ProcessId, StartTime, CommandLine
and report orchestrator. Then `taskkill /F /IM node.exe` to unblock.
```

---

## Out of scope

- Healthcheck (`/api/health` ping) після PM2 start — окрема задача
- PM2 log rotation (P1 #12) — окрема сесія
- Migration на pnpm 10 / Prisma 7 — окрема breaking-change сесія
- ANALYZE=true bundle snapshot — P3 #43

---

## Commit strategy

```
fix(deploy): pm2 delete + fork mode + orphan sweep (S41)

S40 prelude `pm2 stop ltex-store` did not fix the consecutive-deploy
hang because PM2 cluster mode on Windows leaves orphan node.exe
workers behind: the daemon reports status=stopped but the cluster
workers keep running and writing into .next/standalone/.../.next/cache,
which blocks the next `next build`. Probe on Тарас's server showed
node.exe processes from the previous day still alive and writing
to fetch-cache when a fresh deploy was attempted.

Two changes:

1. ecosystem.config.js: switch from cluster to fork mode. On a
   single-instance Windows server cluster gives no win and PM2's
   shutdown of cluster workers is unreliable. Fork = one node.exe
   that PM2 can SIGTERM cleanly.

2. deploy.ps1 step [4-prep]: replace `pm2 stop ltex-store` with
   `pm2 delete ltex-store` so the process is removed from the
   registry and its workers are SIGKILLed. Step [8/8] already
   re-creates the process from ecosystem.config.js. As a safety
   net for any lingering orphans, scan node.exe CommandLine for
   the L-TEX standalone path and Stop-Process them targeted —
   never the global `taskkill /F /IM node.exe` which would also
   kill the telegram/viber bots.

After this, two consecutive deploys should pass without manual
node.exe intervention; the previous workaround is documented in
docs/HISTORY.md under S40 + S41 follow-up.
```

---

## Push

```bash
git push -u origin claude/session-41-deploy-pm2-fork-mode
```

Звіт orchestrator-у (чітко в фінальному message):

- Hash коміта (single commit OK)
- Що показав `cat ecosystem.config.js` ДО і ПІСЛЯ (one diff)
- Чи `pnpm -r test` пройшов 246/246
- Чи додав ти orphan sweep block (scope match на `apps[\\/]+store[\\/]+\.next[\\/]+standalone`)
- Чи знайшов щось специфічне у `ecosystem.config.js` (e.g. `instances: "max"` що треба додатково ставити в 1, env vars що chained тощо)
