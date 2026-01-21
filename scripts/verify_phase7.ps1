# verify_phase7.ps1 - Run Phase 7 smoke test from repo root
# PowerShell 5.1 compatible

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"
$smokeTest = Join-Path $webDir "TEST_PHASE7_SMOKE.ps1"

if (-not (Test-Path $webDir)) {
    Write-Error "ERROR: web directory not found at $webDir"
    exit 1
}

if (-not (Test-Path $smokeTest)) {
    Write-Error "ERROR: TEST_PHASE7_SMOKE.ps1 not found at $smokeTest"
    exit 1
}

Write-Host "Running Phase 7 smoke test from $webDir" -ForegroundColor Cyan
Set-Location $webDir

& $smokeTest
$exitCode = $LASTEXITCODE
exit $exitCode
