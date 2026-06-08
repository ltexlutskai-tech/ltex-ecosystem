# Dump 1C MSSQL schema to TSV files for the historical-import mapping (session 5.2).
# ASCII-only on purpose (Windows PowerShell 5.1 reads non-BOM files as cp1251).
#
# Run on the Windows server that hosts 1C:
#   cd E:\ltex-ecosystem
#   .\scripts\dump-1c-mssql-schema.ps1
#
# Reads the connection string from apps\store\.env :: LEGACY_1C_DB_URL
#   expected format: mssql://user:pass@host:port/db
# Nothing secret is written into git (only schema metadata).

$ErrorActionPreference = "Stop"

# --- 1. Read LEGACY_1C_DB_URL from .env ---
$envPath = "apps\store\.env"
if (-not (Test-Path $envPath)) {
    Write-Error "Not found: $envPath  (add LEGACY_1C_DB_URL there)."
    exit 1
}

$envLine = Get-Content $envPath |
    Where-Object { $_ -match '^\s*LEGACY_1C_DB_URL\s*=' } |
    Select-Object -First 1

if (-not $envLine) {
    Write-Error "LEGACY_1C_DB_URL not found in $envPath"
    exit 1
}

# Strip 'KEY=' prefix and any wrapping quotes
$raw = $envLine.Substring($envLine.IndexOf('=') + 1).Trim().Trim('"').Trim("'")

if (-not $raw.StartsWith("mssql://")) {
    Write-Error "LEGACY_1C_DB_URL must start with mssql://"
    exit 1
}

# --- 2. Parse mssql://user:pass@host:port/db (substring-based, regex-free) ---
$body = $raw.Substring("mssql://".Length)          # user:pass@host:port/db

$lastAt = $body.LastIndexOf('@')                   # split on LAST @ (password may contain @)
if ($lastAt -lt 0) { Write-Error "No '@' in connection string"; exit 1 }
$userpass = $body.Substring(0, $lastAt)
$hostpart = $body.Substring($lastAt + 1)

$firstColon = $userpass.IndexOf(':')               # first : splits user from password
if ($firstColon -lt 0) { Write-Error "No ':' between user and password"; exit 1 }
$SqlUser = $userpass.Substring(0, $firstColon)
$SqlPass = $userpass.Substring($firstColon + 1)

$slash = $hostpart.IndexOf('/')                    # host:port / db
if ($slash -lt 0) { Write-Error "No '/db' in connection string"; exit 1 }
$hostPort = $hostpart.Substring(0, $slash)
$SqlDb = $hostpart.Substring($slash + 1).Trim()

$hpColon = $hostPort.IndexOf(':')
if ($hpColon -ge 0) {
    $h = $hostPort.Substring(0, $hpColon)
    $p = $hostPort.Substring($hpColon + 1)
    $SqlServer = "$h,$p"                            # sqlcmd uses host,port (comma)
} else {
    $SqlServer = $hostPort
}

# --- 3. Output dir ---
$OutDir = "docs\1c-mssql-schema"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Dumping schema of DB '$SqlDb' on '$SqlServer' (user: $SqlUser)..." -ForegroundColor Cyan
Write-Host "Output dir: $OutDir`n"

function Invoke-DumpQuery {
    param([string]$Name, [string]$Query)
    Write-Host "[$Name]..." -NoNewline
    $outFile = Join-Path $OutDir "$Name.tsv"
    sqlcmd -S $SqlServer -U $SqlUser -P $SqlPass -d $SqlDb -Q $Query -s "`t" -W -o $outFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAIL (exit $LASTEXITCODE)" -ForegroundColor Red
    } else {
        $lines = (Get-Content $outFile | Measure-Object -Line).Lines
        Write-Host " OK ($lines lines)" -ForegroundColor Green
    }
}

# --- 4. Queries ---

# 4.1 tables with row counts and size
Invoke-DumpQuery "tables" @"
SET NOCOUNT ON;
SELECT
  t.name AS table_name,
  SUM(p.rows) AS row_count,
  CAST(SUM(au.total_pages) * 8.0 / 1024 AS DECIMAL(18,2)) AS size_mb
FROM sys.tables t
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
JOIN sys.allocation_units au ON p.partition_id = au.container_id
GROUP BY t.name
ORDER BY t.name;
"@

# 4.2 all columns
Invoke-DumpQuery "columns" @"
SET NOCOUNT ON;
SELECT
  TABLE_NAME,
  ORDINAL_POSITION AS pos,
  COLUMN_NAME,
  DATA_TYPE,
  ISNULL(CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR(20)), '') AS max_len,
  ISNULL(CAST(NUMERIC_PRECISION AS VARCHAR(20)), '') AS num_prec,
  ISNULL(CAST(NUMERIC_SCALE AS VARCHAR(20)), '') AS num_scale,
  IS_NULLABLE AS nullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
"@

# 4.3 indexes with key columns
Invoke-DumpQuery "indexes" @"
SET NOCOUNT ON;
SELECT
  t.name AS table_name,
  i.name AS index_name,
  i.type_desc,
  CAST(i.is_unique AS INT) AS is_unique,
  CAST(i.is_primary_key AS INT) AS is_pk,
  STUFF((
    SELECT ', ' + c.name
    FROM sys.index_columns ic
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
    ORDER BY ic.key_ordinal
    FOR XML PATH('')
  ), 1, 2, '') AS key_columns
FROM sys.indexes i
JOIN sys.tables t ON i.object_id = t.object_id
WHERE i.index_id > 0
ORDER BY t.name, i.index_id;
"@

# 4.4 summary by 1C metadata prefix (ASCII labels)
Invoke-DumpQuery "prefix_summary" @"
SET NOCOUNT ON;
WITH classified AS (
  SELECT name,
    CASE
      WHEN name LIKE '[_]Reference%'      THEN 'Reference (Catalogs)'
      WHEN name LIKE '[_]Document%'       THEN 'Document'
      WHEN name LIKE '[_]DocumentJournal%' THEN 'DocumentJournal'
      WHEN name LIKE '[_]AccumRgT%'       THEN 'AccumRgT (Totals)'
      WHEN name LIKE '[_]AccumRg%'        THEN 'AccumRg (Accumulation)'
      WHEN name LIKE '[_]AccRg%'          THEN 'AccRg (Accounting)'
      WHEN name LIKE '[_]InfoRg%'         THEN 'InfoRg (Information)'
      WHEN name LIKE '[_]Const%'          THEN 'Const (Constants)'
      WHEN name LIKE '[_]Enum%'           THEN 'Enum'
      WHEN name LIKE '[_]Chrc%'           THEN 'Chrc (Characteristics)'
      WHEN name LIKE '[_]Node%'           THEN 'Node (ExchangePlans)'
      WHEN name LIKE '[_]Task%'           THEN 'Task'
      WHEN name LIKE '[_]BPr%'            THEN 'BusinessProcess'
      ELSE 'Other (System)'
    END AS metadata_type
  FROM sys.tables
)
SELECT metadata_type, COUNT(*) AS table_count
FROM classified
GROUP BY metadata_type
ORDER BY table_count DESC;
"@

# 4.5 config / system tables (name decoder lives here, packed)
Invoke-DumpQuery "config_tables" @"
SET NOCOUNT ON;
SELECT
  t.name AS table_name,
  SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
WHERE t.name LIKE '[_]Config%'
   OR t.name LIKE 'Config%'
   OR t.name LIKE '[_]Params%'
   OR t.name LIKE 'Params%'
   OR t.name LIKE '[_]IBVersion%'
   OR t.name LIKE '[_]DBSchema%'
GROUP BY t.name
ORDER BY t.name;
"@

Write-Host "`nDone." -ForegroundColor Green
Get-ChildItem $OutDir -File -Filter *.tsv | ForEach-Object {
    $kb = [math]::Round($_.Length / 1024, 1)
    Write-Host ("  {0} - {1} KB" -f $_.Name, $kb)
}
Write-Host "`nNext:"
Write-Host "  git add docs/1c-mssql-schema/"
Write-Host "  git commit -m 'docs: 1C MSSQL schema dump for session 5.2'"
Write-Host "  git push origin main"
