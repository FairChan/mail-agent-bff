param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\\apps\\bff\\.env"),
  [string]$Version = "16.13-3"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }

  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()
    if ($value.Length -ge 2 -and (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    )) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Get-DatabaseInfo {
  param([hashtable]$EnvValues)

  $databaseUrl = $EnvValues["DATABASE_URL"]
  if (-not $databaseUrl) {
    throw "DATABASE_URL is missing in $EnvFile"
  }

  $uri = [Uri]$databaseUrl
  $userInfoParts = $uri.UserInfo.Split(":", 2)
  if ($userInfoParts.Count -lt 2) {
    throw "DATABASE_URL must include both username and password."
  }

  return [pscustomobject]@{
    Host     = $uri.Host
    Port     = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    Database = $uri.AbsolutePath.TrimStart("/")
    Username = [Uri]::UnescapeDataString($userInfoParts[0])
    Password = [Uri]::UnescapeDataString($userInfoParts[1])
  }
}

function Find-PostgresBin {
  param([string]$Root)

  $pgCtl = Get-ChildItem -LiteralPath $Root -Recurse -Filter "pg_ctl.exe" -ErrorAction Stop | Select-Object -First 1
  if (-not $pgCtl) {
    throw "pg_ctl.exe was not found under $Root"
  }

  return Split-Path -Parent $pgCtl.FullName
}

function Test-PortListening {
  param([int]$Port)

  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  } catch {
    return $false
  }
}

$envValues = Read-DotEnv -Path (Resolve-Path -LiteralPath $EnvFile)
$db = Get-DatabaseInfo -EnvValues $envValues

$rootDir = Join-Path $env:LOCALAPPDATA "mail-agent-bff\\postgres"
$runtimeDir = Join-Path $rootDir "runtime-$Version"
$archivePath = Join-Path $rootDir "postgresql-$Version-windows-x64-binaries.zip"
$dataDir = Join-Path $rootDir "data-$($db.Port)-$($db.Database)"
$logPath = Join-Path $rootDir "postgres-$($db.Port).log"
$downloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-$Version-windows-x64-binaries.zip"

New-Item -ItemType Directory -Path $rootDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $runtimeDir)) {
  if (-not (Test-Path -LiteralPath $archivePath)) {
    Write-Host "Downloading portable PostgreSQL $Version..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
  }

  Write-Host "Extracting portable PostgreSQL $Version..."
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir -Force
}

$binDir = Find-PostgresBin -Root $runtimeDir
$initDbExe = Join-Path $binDir "initdb.exe"
$pgCtlExe = Join-Path $binDir "pg_ctl.exe"
$psqlExe = Join-Path $binDir "psql.exe"
$createdbExe = Join-Path $binDir "createdb.exe"

if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath (Join-Path $dataDir "PG_VERSION"))) {
  Write-Host "Initializing PostgreSQL data directory..."
  $passwordFile = Join-Path $rootDir ".pgpass-init"
  Set-Content -LiteralPath $passwordFile -Value $db.Password -NoNewline
  try {
    & $initDbExe -D $dataDir -U $db.Username -A scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 | Out-Host
  } finally {
    Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-PortListening -Port $db.Port)) {
  Write-Host "Starting PostgreSQL on port $($db.Port)..."
  & $pgCtlExe -D $dataDir -l $logPath -o "-h $($db.Host) -p $($db.Port)" start | Out-Host
}

$env:PGPASSWORD = $db.Password
try {
  $deadline = (Get-Date).AddMinutes(2)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    & $psqlExe -h $db.Host -p $db.Port -U $db.Username -d postgres -Atqc "SELECT 1" *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not $ready) {
    throw "Portable PostgreSQL did not become ready within 2 minutes."
  }

  $escapedDatabaseName = $db.Database.Replace("'", "''")
  $databaseExists = & $psqlExe -h $db.Host -p $db.Port -U $db.Username -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$escapedDatabaseName'"
  if (-not $databaseExists) {
    Write-Host "Creating database $($db.Database)..."
    & $createdbExe -h $db.Host -p $db.Port -U $db.Username $db.Database | Out-Host
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Portable PostgreSQL is ready."
Write-Host "Host: $($db.Host)"
Write-Host "Port: $($db.Port)"
Write-Host "Database: $($db.Database)"
