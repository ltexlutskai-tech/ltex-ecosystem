# Session 27 — Worker Task: Deploy Script Hardening

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P1 (deploy reliability — щоразу руками копіюємо .env)
**Очікуваний ефорт:** 30-45 хвилин
**Тип:** worker session (small / атомарний)

---

## Контекст

Після деплоїв S24+S25+S26 (homepage refactor) виявилось 2 повторювані проблеми у `scripts/deploy.ps1`:

1. **Turbo build hang** — `pnpm build --filter=@ltex/store...` через корінь часом «залипає» у Windows PowerShell на кроці компіляції (turbo daemon + buffer issue). Доводилось вбивати node, чистити `.next`, і запускати **прямий** build:
   ```powershell
   pnpm --filter @ltex/store run build 2>&1 | Tee-Object -FilePath build.log
   ```
   А потім `.\scripts\deploy.ps1 -SkipBuild -SkipInstall`.

2. **`.env` не синхронізується у standalone** — Next.js `output: 'standalone'` створює окреме дерево у `apps/store/.next/standalone/apps/store/`, і там потрібен **свій** `.env` (інакше `process.env.TELEGRAM_BOT_TOKEN` etc. порожні). Ми це виявили коли newsletter Telegram не приходив, поки руками не зробили:
   ```powershell
   Copy-Item E:\ltex-ecosystem\apps\store\.env E:\ltex-ecosystem\apps\store\.next\standalone\apps\store\.env -Force
   pm2 restart ltex-store --update-env
   ```

Ціль S27 — щоб **наступний `.\scripts\deploy.ps1`** виконався чистим прогоном без ручних танців.

---

## Branch

`claude/session-27-deploy-hardening` від main.

---

## Hard rules

1. **НЕ ламати** existing deploy contract: skрипт залишається у тому ж шляху (`scripts/deploy.ps1`), приймає ті ж флаги (`-SkipBuild`, `-SkipInstall`), і безпечний для повторного запуску (idempotent).
2. **НЕ чіпати** PM2 ecosystem config, cloudflared service, backup scripts.
3. **НЕ редагувати** `next.config.js` — `outputFileTracingIncludes` для Prisma вже є і працює.
4. **НЕ комітити** жодних `.env` файлів — тільки логіка copy у скрипті.
5. **НЕ робити Git push з server** — деплой тільки git pull + build + restart, push робиться з dev машини.
6. **PowerShell encoding:** уникати `—` (em-dash), `«»`, інших non-cp1251 символів у скрипті — тільки ASCII у Write-Host та коментарях. Юзер вже стикнувся з parser error через em-dash.

---

## Tasks

### Task 1: Замінити turbo build на direct pnpm filter

**Файл:** `scripts/deploy.ps1`, крок `[4/5]` / `[4/7]`.

**Поточний код:**

```powershell
pnpm build --filter=@ltex/store...
```

**Замінити на:**

```powershell
pnpm --filter @ltex/store run build
```

Це bypass-ить turbo daemon (який інколи висить на Windows) і запускає Next.js build напряму. Прямий filter все одно використає кешовані `@ltex/db`, `@ltex/ui` build artifacts якщо вони вже згенеровані (Prisma generate робиться у попередньому кроці).

**Optional:** якщо хочеш бути обережніше — додай прапорець `-DirectBuild` (default `$true`) щоб можна було перемикатися назад на turbo якщо знадобиться:

```powershell
param(
    [switch]$SkipBuild,
    [switch]$SkipInstall,
    [switch]$UseTurbo  # default $false — direct build
)
# ...
if (-not $SkipBuild) {
    if ($UseTurbo) {
        pnpm build --filter=@ltex/store...
    } else {
        pnpm --filter @ltex/store run build
    }
}
```

Краще без додаткового прапорця — просто замінити, менше API surface.

### Task 2: Auto-sync `.env` у standalone

**Файл:** `scripts/deploy.ps1`, **новий крок** після Prisma engine copy (крок 6) і **перед** PM2 restart (крок 7).

**Логіка:**

```powershell
# 7. Sync .env to standalone (Next.js standalone needs its own .env at runtime).
Write-Host "`n[7/8] Syncing .env to standalone..." -ForegroundColor Cyan
$EnvSrc = "apps\store\.env"
$EnvDst = "apps\store\.next\standalone\apps\store\.env"
if (Test-Path $EnvSrc) {
    $StandaloneAppDir = Split-Path $EnvDst -Parent
    if (-not (Test-Path $StandaloneAppDir)) {
        Write-Host "  WARN: standalone dir $StandaloneAppDir does not exist - did build fail?" -ForegroundColor Yellow
    } else {
        Copy-Item -Force $EnvSrc $EnvDst
        Write-Host "  Copied .env to $EnvDst" -ForegroundColor Gray
    }
} else {
    Write-Host "  WARN: $EnvSrc not found - skipping (server is running with stale env)" -ForegroundColor Yellow
}
```

**Important nuance:** `.env` у `apps/store/.env` — це **server-side production env**. Воно має бути gitignored і існувати тільки на сервері. Скрипт тільки **копіює існуючий файл**, не створює його.

### Task 3: PM2 restart з `--update-env`

**Файл:** `scripts/deploy.ps1`, фінальний крок PM2.

**Поточний код:**

```powershell
if ($isRunning) {
    pm2 restart ltex-store
} else {
    pm2 start ecosystem.config.js
}
```

**Замінити на:**

```powershell
if ($isRunning) {
    pm2 restart ltex-store --update-env
} else {
    pm2 start ecosystem.config.js
}
pm2 save
```

`--update-env` змушує PM2 перечитати env з нового `.env` (інакше воно кешує old env між рестартами). `pm2 save` зберігає state щоб Scheduled Task "PM2 Resurrect" підняв процес після reboot.

### Task 4: Оновити лічильник кроків у Write-Host

Бо тепер 8 кроків замість 7. Знайти всі `[N/7]` і замінити на `[N/8]`. Або краще — використати змінну:

```powershell
$TotalSteps = 8
# ...
Write-Host "`n[1/$TotalSteps] Pulling latest code..." -ForegroundColor Cyan
```

Optional improvement — менше acceptance criteria.

### Task 5: Add a smoke check after PM2 restart

Після `pm2 restart`, перевіряти чи процес дійсно живий через 5 секунд (PM2 може показати online коли Next.js ще не готовий, або вже впав на cold-start crash).

**Optional, тільки якщо worker встигне:**

```powershell
Write-Host "`n[8/$TotalSteps] Waiting for Next.js to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
$health = $null
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 5
} catch {
    Write-Host "  WARN: Health check failed - check pm2 logs ltex-store" -ForegroundColor Yellow
}
if ($health -and $health.StatusCode -eq 200) {
    Write-Host "  OK: site responds 200" -ForegroundColor Green
} else {
    Write-Host "  WARN: site did not respond 200 in 5s - check pm2 logs ltex-store" -ForegroundColor Yellow
}
```

Це nice-to-have але не critical — якщо ускладнює без потреби, **пропустити Task 5**.

---

## Verification (на CI / у Linux dev)

Worker НЕ може запустити сам `deploy.ps1` (воно тільки на Windows server). Тому verification — це:

- [ ] PowerShell syntax valid (worker запустить `pwsh -NoProfile -Command "Get-Content scripts\deploy.ps1 | Out-Null"` якщо є pwsh, інакше `bash -c "cat scripts/deploy.ps1 | grep -c '^'"` тільки smoke що файл existing)
- [ ] **Жоден** non-ASCII символ у `.ps1` (worker grep-не: `LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1` має повернути 0 рядків)
- [ ] `pnpm format:check` — passes (skрипт не TS/JS, тільки .ps1, prettier має його ignore-ити; якщо ні — додати у `.prettierignore`)
- [ ] `pnpm -r typecheck` — passes
- [ ] `pnpm -r test` — passes (нічого не зачепили з тестами)
- [ ] `pnpm build` — passes (бо ми не міняли config, тільки deploy script)
- [ ] git diff чистий: тільки `scripts/deploy.ps1` модифіковано, нічого більше

---

## Out of scope (НЕ робити)

- Перенесення `.env` у secrets manager (1Password / Vault) — окрема сесія, не зараз
- Додавання `pm2 deploy` tooling — pm2 ecosystem.config.js достатньо
- Auto-rollback при failed health check — overhead не виправдано для невеликого проєкту
- Modifying `next.config.js` `outputFileTracingIncludes` — вже працює
- CI integration (GitHub Action для self-hosted runner) — окрема сесія, потребує SSH access якого юзер не має
- `.env` schema validation у скрипті — `apps/store/lib/env.ts` (Zod) вже це робить на runtime

---

## Commit strategy

**Один atomic commit:**

```
chore(deploy): harden deploy.ps1 (direct build, .env sync, --update-env)

Three deploy issues hit during S24+S25+S26 homepage refactor required
manual workarounds:
1. Turbo daemon hung on PowerShell during store build
2. .env was not copied into standalone tree -> runtime env vars empty
3. PM2 restart cached old env between deploys

Changes:
- Replace `pnpm build --filter=@ltex/store...` with direct
  `pnpm --filter @ltex/store run build` (bypass turbo daemon)
- Add step to copy apps/store/.env into
  apps/store/.next/standalone/apps/store/.env after build
- Use `pm2 restart ltex-store --update-env` + `pm2 save` so env
  changes are picked up and survive reboots

Result: `.\scripts\deploy.ps1` now runs cleanly end-to-end without
manual Copy-Item or kill-node-processes workarounds.
```

---

## Push

```bash
git push -u origin claude/session-27-deploy-hardening
```

Завершити повідомленням orchestrator-у:
- Branch name
- Чи Task 5 (health check) було додано чи пропущено
- Чи non-ASCII grep чистий
