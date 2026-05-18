# Session M1.5 Ops Fix — Report

**Branch:** `claude/m1.5-ops-fix`
**Date:** 2026-05-18
**Trigger:** post-reboot recovery (Windows Server у Луцьку) — `ltex-manager-sync` крашився у нескінченному loop з `ZodError: MANAGER_SYNC_SHARED_SECRET undefined`.

## Що зроблено у коді (commit `40c83ce`)

### Корінь проблеми

`services/manager-sync/src/index.ts` запускається через PM2 з `tsx src/index.ts`. PM2 spawn не успадковує `.env` файл — лише `env:` блок з `ecosystem.config.js` + system env. У `ecosystem.config.js` для `ltex-manager-sync` виставлено лише `NODE_ENV=production`. Тому `loadConfig()` ([services/manager-sync/src/config.ts:45](../services/manager-sync/src/config.ts:45)) бачив порожнє `process.env` і падав на Zod-валідації `MANAGER_SYNC_SHARED_SECRET ≥16 chars`.

### Fix

1. **[services/manager-sync/src/index.ts](../services/manager-sync/src/index.ts):** додано `import "dotenv/config";` як перший import (після JSDoc-блоку). Side-effect import читає `./.env` (cwd встановлено у `ecosystem.config.js` як `E:\ltex-ecosystem\services\manager-sync`).
2. **[services/manager-sync/package.json](../services/manager-sync/package.json):** додано `"dotenv": "^16.4.0"` у `dependencies` (alphabetical після `@ltex/shared`).
3. **`pnpm-lock.yaml`:** оновлено — резолвиться `dotenv@16.6.1`.

### Чому НЕ env-injection у ecosystem.config.js?

`pm2` не підтримує `env_file` нативно — лише inline `env:` object. Дублювати secrets у JS-конфіг (який трекається у git) — security smell. `dotenv/config` зчитує `.env` у cwd процесу — те саме поведінка що у `apps/store` (Next.js робить це автоматично).

### Тести (pre-merge)

- `pnpm --filter @ltex/db exec prisma generate` — потрібно один раз перед typecheck (Prisma client cache).
- `pnpm -r typecheck` ✅ зелений (7/7 workspaces).
- `pnpm -r test` ✅ зелений: shared 87 + manager-sync 37 + store 926 (+2 skipped) = **1050/1050 passing** — той самий baseline що M1.5b.
- `pnpm format:check` ❌ червоний на **781 файлі** — **pre-existing on origin/main**, не регресія цієї сесії. Перевірено: `git stash` + `prettier --check` на `services/telegram-bot/src/index.ts` все одно warn. Це окрема issue для cleanup сесії (`pnpm exec prettier --write .` на main, через CI failure буде помітна).

## Server-side runbook (виконує оператор після merge у main)

> **Стан на момент написання:** TBD на deploy. Нижче — кроки що оператор має виконати. Після виконання заповнити фактичні результати у цей розділ (через нову PR/edit, або просто залишити для historical record).

### 1. Pull + install (Windows Server, PowerShell)

```powershell
cd E:\ltex-ecosystem
git fetch origin
git checkout main
git pull
pnpm install
(Get-Content E:\ltex-ecosystem\services\manager-sync\src\index.ts -TotalCount 14)[-1]
# Очікувано: import "dotenv/config";
```

### 2. Verify `.env` файли

```powershell
Get-Content E:\ltex-ecosystem\services\manager-sync\.env
# 3 рядки: MANAGER_SYNC_PORT=3001 / MANAGER_SYNC_SHARED_SECRET=<base64-24> / SYNC_MOCK_MODE=true

Select-String "^MANAGER_SYNC_" E:\ltex-ecosystem\apps\store\.env
# MANAGER_SYNC_URL=http://localhost:3001 + те саме значення SHARED_SECRET
```

### 3. Прибрати Machine env workaround (якщо був)

```powershell
[Environment]::SetEnvironmentVariable("MANAGER_SYNC_SHARED_SECRET", $null, "Machine")
[Environment]::SetEnvironmentVariable("MANAGER_SYNC_PORT",          $null, "Machine")
[Environment]::SetEnvironmentVariable("SYNC_MOCK_MODE",             $null, "Machine")
```

### 4. Старт manager-sync + smoke

```powershell
pm2 delete ltex-manager-sync
pm2 start ecosystem.config.js --only ltex-manager-sync
pm2 save
pm2 logs ltex-manager-sync --lines 30 --nostream
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

Очікувано: `online`, `restarts=0` через 5 сек, `/health` → `{ok:true, mockMode:true}`.

### 5. Перезапуск store з оновленим env

```powershell
pm2 restart ltex-store --update-env
pm2 save
Invoke-WebRequest -Uri "https://new.ltex.com.ua/" -Method Head -UseBasicParsing | Select StatusCode
```

Має бути `200`.

### 6. Cron Scheduled Task для `/api/cron/process-sync-queue` (1-min)

```powershell
$cronSecret = '<значення-1-в-1-як-у-існуючих-LTEX-Task-ах>'
$taskName   = "LTEX Process Sync Queue"

$action = New-ScheduledTaskAction `
    -Execute "curl.exe" `
    -Argument "-s -o NUL -H `"x-cron-secret: $cronSecret`" https://new.ltex.com.ua/api/cron/process-sync-queue"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $taskName -Action $action `
    -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3
Get-ScheduledTaskInfo -TaskName $taskName | Select LastRunTime, LastTaskResult, NextRunTime
```

`LastTaskResult` має бути `0`. Pattern узгоджений з [docs/EMAIL_QUEUE.md:107-128](EMAIL_QUEUE.md).

## Документовано на follow-up

### `CRON_SECRET` "<...>" артефакт

У `apps/store/.env` значення зараз містить літеральні кутові дужки + лапки:

```
CRON_SECRET="<nDWvCcKr/vZFPid2nPvPASIjjZ1sbu/eTrVKcuIM2Ug=>"
```

Це **робочий артефакт**: існуючі Scheduled Tasks (`LTEX Email Queue Drain`, `LTEX ViewLog Cleanup`) передають той самий рядок 1-в-1 у `-H "x-cron-secret: ..."` headers. `process.env.CRON_SECRET` у Next.js приходить разом з лапками, header теж з лапками → byte-for-byte match → `crypto.timingSafeEqual` повертає `true`. Тому endpoints проходять auth.

**Не виправляти у цій сесії.** Cleanup потребує:

1. Manutenance window (zero-downtime секрет rotation).
2. Координація оновлення `.env` (видалити `<>` + лапки) + перереєстрація **всіх** Tasks (`LTEX Email Queue Drain`, `LTEX ViewLog Cleanup`, **новий** `LTEX Process Sync Queue`) з новим аргументом одночасно.

Якщо у Step 6 (вище) оператор пише новий Task — **взяти точно те значення що у існуючих Tasks**, щоб не зламати baseline:

```powershell
schtasks /query /tn "LTEX Email Queue Drain" /v /fo LIST | findstr /i "task to run"
# Сюди потрапить точний argument з curl -H "x-cron-secret: <значення>".
# Це значення вставити у $cronSecret вище.
```

### `PM2 Resurrect` Scheduled Task

Після reboot Task не підняла PM2 процеси автоматично — оператор зробив `pm2 resurrect` вручну. Це окрема issue. Можливі причини:

- `Action argument` містить шлях до PM2 (наприклад `C:\Users\<user>\AppData\Roaming\npm\pm2.cmd`) який не у `$env:Path` для SYSTEM юзера.
- `pm2 resurrect` без `--silent` буфер-локається на не-interactive TTY.
- 60s `Delay` між trigger і дією замало щоб дочекатися PostgreSQL service (PM2 ecosystem.config.js startup залежить від DB).

Діагностика (для майбутньої сесії):

```powershell
Get-ScheduledTask -TaskName "PM2 Resurrect" | Format-List
Get-ScheduledTaskInfo -TaskName "PM2 Resurrect" | Select LastRunTime, LastTaskResult, NumberOfMissedRuns, NextRunTime
```

### 1С обмін з філій (зовнішнє підтвердження)

Перевірити що 1С порти слухають на `0.0.0.0`:

```powershell
Get-NetTCPConnection -LocalPort 1540,1541,1560,1561 -State Listen | Select LocalAddress, LocalPort
```

Менеджери підтверджують через telegram-чат що обмін пройшов: **TBD**.

### Format drift на repo-level

`pnpm format:check` падає на 781 файлах. Pre-existing, не регресія цієї сесії. Окрема cleanup сесія: `pnpm exec prettier --write .` + commit.

## Constraints upheld

- ✅ `output: 'standalone'` не зачеплено.
- ✅ Infra scripts (`scripts/deploy.ps1`, `ecosystem.config.js`) не зачеплено.
- ✅ `/admin/*` Supabase code не зачеплено.
- ✅ `pm2 kill` не виконано (server-side ops для оператора).
- ✅ `CRON_SECRET` cleanup НЕ зроблено (документовано як окрема сесія).
- ✅ `docs/SESSION_TASKS.md` не зачеплено.
- ✅ Branch `claude/m1.5-ops-fix` НЕ змерджено у main, PR НЕ створено.
