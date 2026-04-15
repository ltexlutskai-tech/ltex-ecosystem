# L-TEX deployment script for Windows Server.
# Run from the repository root: .\scripts\deploy.ps1
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

Write-Host "=== L-TEX Deploy ===" -ForegroundColor Green
Set-Location $RepoRoot

# 1. Pull latest code
Write-Host "`n[1/5] Pulling latest code..." -ForegroundColor Cyan
git pull origin main

# 2. Install dependencies
if (-not $SkipInstall) {
    Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Cyan
    pnpm install --frozen-lockfile
} else {
    Write-Host "`n[2/5] Skipping install (--SkipInstall)" -ForegroundColor Yellow
}

# 3. Generate Prisma client
Write-Host "`n[3/5] Generating Prisma client..." -ForegroundColor Cyan
pnpm --filter @ltex/db exec prisma generate

# 4. Build
if (-not $SkipBuild) {
    Write-Host "`n[4/5] Building store..." -ForegroundColor Cyan
    pnpm build --filter=@ltex/store...
} else {
    Write-Host "`n[4/5] Skipping build (--SkipBuild)" -ForegroundColor Yellow
}

# 5. Copy standalone static + public files
Write-Host "`n[5/5] Copying static assets to standalone..." -ForegroundColor Cyan
$StandalonePath = "apps\store\.next\standalone\apps\store"
if (Test-Path "apps\store\.next\static") {
    Copy-Item -Recurse -Force "apps\store\.next\static" "$StandalonePath\.next\static"
}
if (Test-Path "apps\store\public") {
    Copy-Item -Recurse -Force "apps\store\public" "$StandalonePath\public"
}

# 6. Restart PM2
Write-Host "`n[6/6] Restarting PM2..." -ForegroundColor Cyan
$pm2List = pm2 jlist 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
$isRunning = $pm2List | Where-Object { $_.name -eq "ltex-store" }
if ($isRunning) {
    pm2 restart ltex-store
} else {
    pm2 start ecosystem.config.js
}

Write-Host "`n=== Deploy complete! ===" -ForegroundColor Green
Write-Host "Check status: pm2 status"
Write-Host "View logs: pm2 logs ltex-store"
