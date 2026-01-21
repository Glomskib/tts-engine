# dev_web.ps1 - Start Next.js dev server from repo root
# PowerShell 5.1 compatible

$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"

if (-not (Test-Path $webDir)) {
    Write-Error "ERROR: web directory not found at $webDir"
    exit 1
}

Write-Host "Stopping any running node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$nextDir = Join-Path $webDir ".next"
if (Test-Path $nextDir) {
    Write-Host "Removing .next cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
}

Write-Host "Starting dev server in $webDir" -ForegroundColor Cyan
Set-Location $webDir
npm run dev
