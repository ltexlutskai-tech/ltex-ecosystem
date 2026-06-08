# Дамп схеми 1С MSSQL у CSV для аналізу та побудови HISTORY_MIGRATION_MAP.md
#
# Запуск (на Windows-сервері з 1С):
#   cd E:\ltex-ecosystem
#   .\scripts\dump-1c-mssql-schema.ps1
#
# Потребує:
#   - sqlcmd (входить у SQL Server Command Line Utilities)
#   - SQL Login ltex_app_reader з паролем (read-only db_datareader)
#   - apps/store/.env з LEGACY_1C_DB_URL=mssql://ltex_app_reader:<pass>@localhost:1433/ltex

$ErrorActionPreference = "Stop"

# 1. Витягнути пароль з .env
$envPath = "apps\store\.env"
if (-not (Test-Path $envPath)) {
    Write-Error "Не знайдено $envPath. Додайте LEGACY_1C_DB_URL у нього."
    exit 1
}

$envLine = Get-Content $envPath | Where-Object { $_ -match '^LEGACY_1C_DB_URL\s*=' }
if (-not $envLine) {
    Write-Error "LEGACY_1C_DB_URL не знайдено у $envPath"
    exit 1
}

# Парс mssql://user:pass@host:port/db
if ($envLine -notmatch 'mssql://([^:]+):([^@]+)@([^:/]+)(:(\d+))?/(.+?)(\s*$|"$)') {
    Write-Error "LEGACY_1C_DB_URL не відповідає формату mssql://user:pass@host:port/db"
    exit 1
}

$SqlUser = $Matches[1]
$SqlPass = $Matches[2]
$SqlSrv  = $Matches[3]
$SqlDb   = $Matches[6].Trim('"').Trim()

$OutDir = "docs\1c-mssql-schema"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Дамп схеми бази $SqlDb на $SqlSrv (user: $SqlUser)..." -ForegroundColor Cyan
Write-Host "Вихід: $OutDir`n"

# Helper для запуску запиту і запису у TSV
function Run-Query {
    param([string]$Name, [string]$Query)
    Write-Host "[$Name]..." -NoNewline
    $outFile = Join-Path $OutDir "$Name.tsv"
    sqlcmd -S $SqlSrv -U $SqlUser -P $SqlPass -d $SqlDb -Q $Query -s "`t" -W -h -1 -o $outFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Error "sqlcmd завершився з кодом $LASTEXITCODE для $Name"
    } else {
        $lineCount = (Get-Content $outFile | Measure-Object -Line).Lines
        Write-Host " OK ($lineCount рядків)" -ForegroundColor Green
    }
}

# 1. Список таблиць з розмірами + кількістю рядків
Run-Query "tables" @"
SET NOCOUNT ON;
SELECT
  s.name + '.' + t.name AS qualified_name,
  SUM(p.rows) AS row_count,
  CAST(SUM(au.total_pages) * 8.0 / 1024 AS DECIMAL(18,2)) AS size_mb
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
JOIN sys.allocation_units au ON p.partition_id = au.container_id
GROUP BY s.name, t.name
ORDER BY t.name;
"@

# 2. Колонки усіх таблиць
Run-Query "columns" @"
SET NOCOUNT ON;
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION,
  DATA_TYPE,
  ISNULL(CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR(20)), '') AS max_len,
  ISNULL(CAST(NUMERIC_PRECISION AS VARCHAR(20)), '') AS num_prec,
  ISNULL(CAST(NUMERIC_SCALE AS VARCHAR(20)), '') AS num_scale,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
"@

# 3. Індекси
Run-Query "indexes" @"
SET NOCOUNT ON;
SELECT
  s.name + '.' + t.name AS qualified_name,
  i.name AS index_name,
  i.type_desc,
  CAST(i.is_unique AS INT) AS is_unique,
  CAST(i.is_primary_key AS INT) AS is_primary_key,
  STUFF((
    SELECT ', ' + c.name
    FROM sys.index_columns ic
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
    ORDER BY ic.key_ordinal
    FOR XML PATH('')
  ), 1, 2, '') AS index_columns
FROM sys.indexes i
JOIN sys.tables t ON i.object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE i.index_id > 0
ORDER BY t.name, i.index_id;
"@

# 4. Зведення за типом метаданих 1С (Reference / Document / AccumRg ...)
Run-Query "prefix_summary" @"
SET NOCOUNT ON;
WITH classified AS (
  SELECT
    name,
    CASE
      WHEN name LIKE 'Reference%' OR name LIKE '_Reference%' THEN 'Reference (Довідники)'
      WHEN name LIKE 'Document%'  OR name LIKE '_Document%'  THEN 'Document (Документи)'
      WHEN name LIKE 'DocumentJournal%' OR name LIKE '_DocumentJournal%' THEN 'DocumentJournal'
      WHEN name LIKE 'AccumRg%'   OR name LIKE '_AccumRg%'   THEN 'AccumRg (Регістри накопичення)'
      WHEN name LIKE 'AccumRgT%'  OR name LIKE '_AccumRgT%'  THEN 'AccumRgT (Підсумки)'
      WHEN name LIKE 'AccRg%'     OR name LIKE '_AccRg%'     THEN 'AccRg (Бухгалтерські регістри)'
      WHEN name LIKE 'InfoRg%'    OR name LIKE '_InfoRg%'    THEN 'InfoRg (Регістри відомостей)'
      WHEN name LIKE 'Const%'     OR name LIKE '_Const%'     THEN 'Const (Константи)'
      WHEN name LIKE 'Enum%'      OR name LIKE '_Enum%'      THEN 'Enum (Перерахунки)'
      WHEN name LIKE 'Chrc%'      OR name LIKE '_Chrc%'      THEN 'Chrc (Плани видів характеристик)'
      WHEN name LIKE 'BPr%'       OR name LIKE '_BPr%'       THEN 'BPr (Бізнес-процеси)'
      WHEN name LIKE 'Task%'      OR name LIKE '_Task%'      THEN 'Task (Завдання)'
      ELSE 'Other (Системні)'
    END AS metadata_type
  FROM sys.tables
)
SELECT metadata_type, COUNT(*) AS table_count
FROM classified
GROUP BY metadata_type
ORDER BY table_count DESC;
"@

# 5. Зразок _Config / Params — таблиці що містять декодер метаданих 1С
Run-Query "config_tables" @"
SET NOCOUNT ON;
SELECT
  s.name + '.' + t.name AS qualified_name,
  SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
WHERE t.name IN ('Config', '_Config', 'Params', '_Params', 'ConfigSave', '_ConfigSave', 'DBSchema', '_DBSchema', 'IBVersion', '_IBVersion', 'YearOffset', '_YearOffset')
   OR t.name LIKE 'Config%' OR t.name LIKE '_Config%'
GROUP BY s.name, t.name
ORDER BY t.name;
"@

Write-Host "`nГотово." -ForegroundColor Green
Write-Host "Файли у $OutDir готові до коміту:"
Get-ChildItem $OutDir -File | ForEach-Object {
    $sizeKb = [math]::Round($_.Length / 1024, 1)
    Write-Host "  $($_.Name) — $sizeKb КБ"
}
Write-Host "`nДалі: git add docs/1c-mssql-schema/ && git commit -m 'docs: дамп схеми 1С MSSQL для сесії 5.2' && git push origin main"
