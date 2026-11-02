<#
.SYNOPSIS
    Brings the production database up to date: backup, migrations, card catalog and recipes.

.DESCRIPTION
    Run it from your PC after Render (server) and Netlify (web) have deployed. Steps:
      1. backup   pg_dump to backups\prod-<time>.sql (skip with -SkipBackup)
      2. migrate  go run ./cmd/migrate up
      3. reset    only with -ResetCatalog (pre-launch only, see below)
      4. seed     go run ./cmd/seed (inserts new seasons/cards/recipes; never changes existing cards)
      5. check    migration status and cards per spirit

    The database URL is the Render Postgres *External* URL. It is taken from -DatabaseUrl,
    else $env:PROD_DATABASE_URL, else PROD_DATABASE_URL in the repo's .env, else asked for.
    Needs Docker Desktop running (psql and pg_dump come from the cardgame-postgres container).

    -ResetCatalog deletes every player's cards, claims, showcases and leaderboard points
    (accounts stay), then reloads the catalog. Use it only before real players: after launch,
    new spirits go into a new card season instead.

.EXAMPLE
    .\scripts\update-prod-db.ps1
.EXAMPLE
    .\scripts\update-prod-db.ps1 -ResetCatalog
#>
param(
    [string]$DatabaseUrl,
    [switch]$SkipBackup,
    [switch]$ResetCatalog,
    # Lets the script run against a local database (for testing the script itself).
    [switch]$AllowLocal
)

# Not 'Stop': Windows PowerShell treats any stderr line from docker/go (their normal logs) as a
# fatal error then. Failures are caught by exit code instead (Check).
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$container = 'cardgame-postgres'

function Step ([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# Native commands don't stop the script on failure by themselves.
function Check ([string]$what)
{
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

function Get-DotEnvValue ([string]$name)
{
    $file = Join-Path $repo '.env'
    if (-not (Test-Path $file)) { return $null }
    foreach ($line in Get-Content $file)
    {
        if ($line -match "^\s*$name\s*=\s*(.*)$") { return $Matches[1].Trim().Trim('"').Trim("'") }
    }
    return $null
}

# ---- Which database ----
if (-not $DatabaseUrl) { $DatabaseUrl = $env:PROD_DATABASE_URL }
if (-not $DatabaseUrl) { $DatabaseUrl = Get-DotEnvValue 'PROD_DATABASE_URL' }
if (-not $DatabaseUrl)
{
    $secure = Read-Host 'Render Postgres External Database URL' -AsSecureString
    $DatabaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ($DatabaseUrl -notmatch '^postgres(ql)?://') { throw 'That is not a postgres:// URL.' }

$dbHost = ([Uri]$DatabaseUrl).Host
$local = $dbHost -in @('localhost', '127.0.0.1', '::1', 'host.docker.internal')
if ($local -and -not $AllowLocal) { throw "$dbHost is a local database; this script is for production (use -AllowLocal to test it)." }
if (-not $local -and $DatabaseUrl -notmatch 'sslmode=')
{
    $DatabaseUrl += $(if ($DatabaseUrl.Contains('?')) { '&' } else { '?' }) + 'sslmode=require'
}
# Inside the container "localhost" is the container itself, so local tests reach the host this way.
$dockerUrl = $DatabaseUrl -replace '@(localhost|127\.0\.0\.1)(:\d+)?/', '@host.docker.internal$2/'

function Psql ([string]$sql)
{
    $sql | docker exec -i $container psql $dockerUrl -v ON_ERROR_STOP=1 -X -q
    Check 'psql'
}

docker inspect -f '{{.State.Running}}' $container 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Container $container is not running: start Docker Desktop and run 'docker compose up -d'." }

Write-Host "Database: $dbHost" -ForegroundColor Yellow
'select current_database() as database, version() as server' | docker exec -i $container psql $dockerUrl -X
Check 'Connecting to the database'

if ($ResetCatalog)
{
    Write-Host "`n-ResetCatalog DELETES every player's cards, claims, showcases and leaderboard points on $dbHost." -ForegroundColor Red
    $answer = Read-Host "Type the host name ($dbHost) to continue"
    if ($answer -ne $dbHost) { throw 'Not confirmed; nothing was changed.' }
}

$savedUrl = $env:DATABASE_URL
try
{
    # ---- 1. Backup ----
    if (-not $SkipBackup)
    {
        Step 'Backup'
        $dir = Join-Path $repo 'backups'
        New-Item -ItemType Directory -Force $dir | Out-Null
        $name = 'prod-{0}.sql' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
        # Dump inside the container and copy the file out, so the bytes (Sinhala text) stay exact.
        docker exec $container pg_dump $dockerUrl --no-owner --no-privileges -f "/tmp/$name"
        Check 'pg_dump'
        docker cp "${container}:/tmp/$name" (Join-Path $dir $name) | Out-Null
        Check 'Copying the backup'
        docker exec $container rm "/tmp/$name" | Out-Null
        Write-Host "Saved backups\$name (player data: keep it private)"
    }

    # The Go commands read DATABASE_URL (it wins over .env).
    $env:DATABASE_URL = $DatabaseUrl
    Push-Location (Join-Path $repo 'server')
    try
    {
        # ---- 2. Migrations ----
        Step 'Migrations'
        go run ./cmd/migrate up
        Check 'migrate up'

        # ---- 3. Reset (pre-launch only) ----
        if ($ResetCatalog)
        {
            Step 'Reset card catalog'
            Psql @'
BEGIN;
DELETE FROM showcase_cards;
DELETE FROM cards;
DELETE FROM daily_claims;
DELETE FROM season_results;
DELETE FROM season_points;
UPDATE seasons SET finalized_at = NULL;
DELETE FROM season_cards;
DELETE FROM card_seasons;
COMMIT;
'@
            Write-Host 'Player cards, claims, showcases and points deleted.'
        }

        # ---- 4. Catalog and recipes ----
        Step 'Seed'
        go run ./cmd/seed
        Check 'seed'

        # ---- 5. Check ----
        Step 'Check'
        go run ./cmd/migrate status
        Check 'migrate status'
        Psql 'select card_season_id as season, template_id as spirit, count(*) as cards from season_cards group by 1, 2 order by 1, 2;'
    }
    finally
    {
        Pop-Location
    }
}
finally
{
    # Never leave this window pointing at production.
    if ($null -eq $savedUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $savedUrl }
}

Write-Host "`nDone: $dbHost is up to date." -ForegroundColor Green
