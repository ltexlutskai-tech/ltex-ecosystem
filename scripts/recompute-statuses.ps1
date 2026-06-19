# Обгортка для перерахунку статусів клієнтів (порт 1С ScheduledJob).
# Сама вантажить apps\store\.env (DATABASE_URL) і запускає CLI-перерахунок —
# БЕЗ HTTP/секрету. Підходить для ручного запуску і Windows Scheduled Task.
#
# Запуск (з кореня E:\ltex-ecosystem):
#   .\scripts\recompute-statuses.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root "apps\store\.env"

if (-not (Test-Path $envFile)) { Write-Error "Не знайдено $envFile"; exit 1 }

Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim().Trim('"'), 'Process')
}

if (-not $env:DATABASE_URL) { Write-Error "DATABASE_URL порожній у .env"; exit 1 }

pnpm --filter @ltex/store exec tsx scripts/recompute-client-statuses.ts
