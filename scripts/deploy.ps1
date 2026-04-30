# L-TEX deployment script for Windows Server.
# Run from the repository root: .\scripts\deploy.ps1
#
# Workflow: pull -> install -> prisma -> (stop pm2 if running) -> build ->
#           copy static -> copy prisma engine -> sync .env -> restart pm2
#
# Prerequisites:
#   - Node.js 22 LTS installed
#   - pnpm installed globally: npm install -g pnpm
#   - PM2 installed globally: npm install -g pm2
#   - Caddy binary at E:\caddy\caddy.exe

param(
    [switch]$SkipBuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$TotalSteps = 8

Write-Host "=== L-TEX Deploy ===" -ForegroundColor Green
Set-Location $RepoRoot

# 1. Pull latest code
Write-Host "`n[1/$TotalSteps] Pulling latest code..." -ForegroundColor Cyan
git pull origin main

# 2. Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/$TotalSteps] Installing dependencies..." -ForegroundColor Cyan
    pnpm install --frozen-lockfile
} else {
    Write-Host "`n[2/$TotalSteps] Skipping install (--SkipInstall)" -ForegroundColor Yellow
}

# 3. Generate Prisma client
Write-Host "`n[3/$TotalSteps] Generating Prisma client..." -ForegroundColor Cyan
pnpm --filter @ltex/db exec prisma generate

# 4-prep. Kill the PM2 daemon (and therefore every child it manages --
# the ltex-store ProcessContainerFork.js worker that holds a file handle
# on apps/store/.next/standalone/...) before next build. Without this
# the second consecutive deploy hangs in `next build` after the
# "serverActions" experiment line because Windows NTFS will not let
# next.js rewrite files that the running PM2 worker still has open.
#
# History of this prelude:
# - S40 tried `pm2 stop ltex-store` -> daemon flagged stopped but cluster
#   workers stayed alive as orphans. Build still hung.
# - S41 tried `pm2 delete ltex-store` + a CommandLine regex sweep for
#   "apps/store/.next/standalone" -> sweep never matched because PM2
#   wraps workers in ProcessContainerFork.js whose CommandLine does not
#   contain the app path; the worker path lives in env vars instead.
# - S42 (here): just `pm2 kill`. Daemon-level signal, no guards needed,
#   no parsing of `pm2 jlist` (which can race with daemon startup and
#   silently fall through). Step [8/8] revives the daemon via
#   `pm2 ping` and starts ltex-store fresh from ecosystem.config.js.
if (-not $SkipBuild) {
    Write-Host "  Killing PM2 daemon before build (releases ltex-store file locks)..." -ForegroundColor Yellow
    try { pm2 kill 2>&1 | Out-Null } catch { }
    Start-Sleep -Seconds 2
}

# 4. Build (direct pnpm filter bypasses turbo daemon which hangs on Windows).
if (-not $SkipBuild) {
    Write-Host "`n[4/$TotalSteps] Building store..." -ForegroundColor Cyan
    # Call pnpm directly. Earlier attempts (S37 Tee-Object, S39 cmd /c
    # redirect) tried to capture the build log to disk, but both wedged
    # the pipeline: pnpm.cmd already shells out through cmd.exe to spawn
    # node, and stacking another redirect or PS pipeline on top kept
    # next.js's stdout buffered until process exit. The plain invocation
    # streams to the live console and finishes in seconds.
    pnpm --filter @ltex/store run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: build failed (exit $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[4/$TotalSteps] Skipping build (--SkipBuild)" -ForegroundColor Yellow
}

# 5. Copy standalone static + public files
Write-Host "`n[5/$TotalSteps] Copying static assets to standalone..." -ForegroundColor Cyan
$StandalonePath = "apps\store\.next\standalone\apps\store"
if (Test-Path "apps\store\.next\static") {
    Copy-Item -Recurse -Force "apps\store\.next\static" "$StandalonePath\.next\static"
}
if (Test-Path "apps\store\public") {
    Copy-Item -Recurse -Force "apps\store\public" "$StandalonePath\public"
}

# 6. Copy Prisma engine to standalone (fallback if Next.js trace misses it).
# Without this, cold-start PM2 fails with PrismaClientInitializationError
# ("Query Engine for runtime windows" not found). next.config.js already has
# outputFileTracingIncludes for Prisma, but we copy here too as belt-and-braces.
Write-Host "`n[6/$TotalSteps] Copying Prisma engine to standalone..." -ForegroundColor Cyan
$PrismaSrc = Get-ChildItem -Path "node_modules\.pnpm" -Recurse -Filter "query_engine-windows.dll.node" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($PrismaSrc) {
    $PrismaSrcDir = Split-Path $PrismaSrc.FullName -Parent
    $PrismaDests = @(
        "apps\store\.next\standalone\node_modules\.pnpm\@prisma+client@6.2.1_prisma@6.2.1\node_modules\.prisma\client",
        "apps\store\.next\standalone\apps\store\.prisma\client",
        "apps\store\.next\standalone\node_modules\.prisma\client",
        "apps\store\.next\standalone\apps\store\node_modules\.prisma\client"
    )
    foreach ($dst in $PrismaDests) {
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
        Copy-Item -Recurse -Force "$PrismaSrcDir\*" $dst -ErrorAction SilentlyContinue
    }
    Write-Host "  Engine copied to $($PrismaDests.Length) standalone locations" -ForegroundColor Gray
} else {
    Write-Host "  WARN: Prisma engine not found in node_modules - skipping" -ForegroundColor Yellow
}

# 7. Sync .env into standalone tree (Next.js standalone has its own apps/store/
# at runtime and needs its own .env there). The source .env is gitignored and
# managed manually on the server; this step only copies an existing file.
Write-Host "`n[7/$TotalSteps] Syncing .env to standalone..." -ForegroundColor Cyan
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
    Write-Host "  WARN: $EnvSrc not found - skipping (server will run with stale env)" -ForegroundColor Yellow
}

# 8. Restart PM2 (--update-env forces re-read of .env; pm2 save persists state
# so the Scheduled Task "PM2 Resurrect" can restore it after reboot).
Write-Host "`n[8/$TotalSteps] Restarting PM2..." -ForegroundColor Cyan

# Wake the PM2 daemon if it's not running. `pm2 ping` is cheap and idempotent;
# if the daemon is dead it spawns a new one. This avoids the "first jlist
# returns startup banner instead of JSON" race that breaks ConvertFrom-Json.
pm2 ping > $null 2>&1

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

Write-Host "`n=== Deploy complete! ===" -ForegroundColor Green
Write-Host "Check status: pm2 status"
Write-Host "View logs: pm2 logs ltex-store"
