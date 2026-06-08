# Extract and decompress the 1C "DBNames" map from the Params table.
# DBNames is the authoritative decoder:  metadata-UUID  <->  physical table/field name
#   e.g. it tells us that _Reference113 / _Fld6547 belong to which metadata object.
# Joined with the config export (docs/1c-export-2026-06-02, UUID <-> human name)
# this gives the full "_Document179 = Document.ZakazPokupatelya" mapping.
#
# ASCII-only (Windows PowerShell 5.1 friendly). Run on the 1C server:
#   cd E:\ltex-ecosystem
#   .\scripts\dump-1c-dbnames.ps1
#
# Reads connection string from apps\store\.env :: LEGACY_1C_DB_URL

$ErrorActionPreference = "Stop"

# --- 1. Parse LEGACY_1C_DB_URL (same logic as dump-1c-mssql-schema.ps1) ---
$envPath = "apps\store\.env"
if (-not (Test-Path $envPath)) { Write-Error "Not found: $envPath"; exit 1 }

$envLine = Get-Content $envPath |
    Where-Object { $_ -match '^\s*LEGACY_1C_DB_URL\s*=' } |
    Select-Object -First 1
if (-not $envLine) { Write-Error "LEGACY_1C_DB_URL not found in $envPath"; exit 1 }

$raw = $envLine.Substring($envLine.IndexOf('=') + 1).Trim().Trim('"').Trim("'")
if (-not $raw.StartsWith("mssql://")) { Write-Error "must start with mssql://"; exit 1 }
$body = $raw.Substring("mssql://".Length)

$lastAt = $body.LastIndexOf('@')
$userpass = $body.Substring(0, $lastAt)
$hostpart = $body.Substring($lastAt + 1)
$firstColon = $userpass.IndexOf(':')
$SqlUser = $userpass.Substring(0, $firstColon)
$SqlPass = $userpass.Substring($firstColon + 1)
$slash = $hostpart.IndexOf('/')
$hostPort = $hostpart.Substring(0, $slash)
$SqlDb = $hostpart.Substring($slash + 1).Trim()
$hpColon = $hostPort.IndexOf(':')
if ($hpColon -ge 0) {
    $h = $hostPort.Substring(0, $hpColon)
    $p = $hostPort.Substring($hpColon + 1)
    $SqlServer = "$h,$p"
} else {
    $SqlServer = $hostPort
}

# --- 2. Read the DBNames blob via System.Data.SqlClient ---
Add-Type -AssemblyName System.Data | Out-Null
Add-Type -AssemblyName System.IO.Compression | Out-Null

$connStr = "Server=$SqlServer;Database=$SqlDb;User Id=$SqlUser;Password=$SqlPass;TrustServerCertificate=True;Connect Timeout=30"
$conn = New-Object System.Data.SqlClient.SqlConnection $connStr
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT BinaryData FROM Params WHERE FileName = 'DBNames'"
$blob = $cmd.ExecuteScalar()
$conn.Close()

if ($null -eq $blob -or $blob -eq [System.DBNull]::Value) {
    Write-Error "DBNames row not found in Params (or no SELECT permission)."
    exit 1
}

[byte[]]$bytes = $blob
$OutDir = "docs\1c-mssql-schema"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# keep raw blob locally for safety (NOT committed - see .gitignore note)
[System.IO.File]::WriteAllBytes((Join-Path $OutDir "dbnames.bin"), $bytes)

$hexHead = ($bytes[0..([Math]::Min(15, $bytes.Length - 1))] | ForEach-Object { $_.ToString("X2") }) -join " "
Write-Host ("Blob size: {0} bytes. First bytes: {1}" -f $bytes.Length, $hexHead) -ForegroundColor Cyan

# --- 3. Inflate (1C uses raw DEFLATE; try a few leading offsets) ---
function Try-Inflate {
    param([byte[]]$data, [int]$offset)
    try {
        $ms = New-Object System.IO.MemoryStream
        $ms.Write($data, $offset, $data.Length - $offset)
        $ms.Position = 0
        $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
        $out = New-Object System.IO.MemoryStream
        $ds.CopyTo($out)
        $ds.Dispose()
        return $out.ToArray()
    } catch {
        return $null
    }
}

$result = $null
foreach ($off in 0, 8, 4, 2, 1) {
    $r = Try-Inflate -data $bytes -offset $off
    if ($r -and $r.Length -gt 100) {
        $result = $r
        Write-Host ("Inflated at offset {0}: {1} bytes" -f $off, $r.Length) -ForegroundColor Green
        break
    }
}

if (-not $result) {
    Write-Warning "Could not inflate. Raw blob saved to $OutDir\dbnames.bin for manual handling."
    exit 1
}

# --- 4. Write decompressed text (1C DBNames is UTF-8 text) ---
$txtPath = Join-Path $OutDir "dbnames.txt"
[System.IO.File]::WriteAllBytes($txtPath, $result)
Write-Host "Wrote $txtPath" -ForegroundColor Green

Write-Host "`n--- First 1500 chars (preview) ---`n"
$preview = [System.Text.Encoding]::UTF8.GetString($result)
Write-Host $preview.Substring(0, [Math]::Min(1500, $preview.Length))

Write-Host "`n`nNext (only the text file, NOT the .bin):"
Write-Host "  git add docs/1c-mssql-schema/dbnames.txt"
Write-Host "  git commit -m 'docs: 1C DBNames decoder for session 5.2'"
Write-Host "  git push origin main"
