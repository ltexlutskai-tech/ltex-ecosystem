# Обгортка для apps/store/scripts/import-1c-historical.ts
# Сама вантажить apps\store\.env у сесію + ставить IMPORT_TARGET_DB_URL = DATABASE_URL,
# щоб не задавати env вручну щоразу. Передає всі аргументи у скрипт.
#
# Приклади (з кореня E:\ltex-ecosystem):
#   .\scripts\import-1c.ps1 --entity dictionaries-full --dry-run --confirm-prod
#   .\scripts\import-1c.ps1 --entity dictionaries-full --confirm-prod
#   .\scripts\import-1c.ps1 --entity rates --confirm-prod
param([Parameter(ValueFromRemainingArguments = $true)] $Args)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root "apps\store\.env"

if (-not (Test-Path $envFile)) {
  Write-Error "Не знайдено $envFile"
  exit 1
}

# Підвантажити .env у поточний процес (DATABASE_URL + LEGACY_1C_DB_URL тощо)
Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim().Trim('"'), 'Process')
}

# Ціль запису = та сама прод-база (потрібен --confirm-prod у аргументах)
$env:IMPORT_TARGET_DB_URL = $env:DATABASE_URL

if (-not $env:IMPORT_TARGET_DB_URL) { Write-Error "DATABASE_URL порожній у .env"; exit 1 }
if (-not $env:LEGACY_1C_DB_URL) { Write-Error "LEGACY_1C_DB_URL порожній у .env (джерело MSSQL)"; exit 1 }

Write-Host "TARGET = $($env:IMPORT_TARGET_DB_URL)" -ForegroundColor Cyan
Write-Host "LEGACY = $($env:LEGACY_1C_DB_URL)" -ForegroundColor Cyan
Write-Host ""

pnpm --filter @ltex/store exec tsx scripts/import-1c-historical.ts @Args
