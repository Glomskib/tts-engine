# verify_all.ps1 - Run all phase verification scripts
# PowerShell 5.1 compatible

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot

Write-Host "Running all verification scripts..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Phase 7
Write-Host "`n[Phase 7]" -ForegroundColor Yellow
& "$scriptDir\verify_phase7.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nPhase 7: FAIL" -ForegroundColor Red
    exit 1
}
Write-Host "`nPhase 7: PASS" -ForegroundColor Green

# Phase 8
Write-Host "`n[Phase 8]" -ForegroundColor Yellow
& "$scriptDir\verify_phase8.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nPhase 8: FAIL" -ForegroundColor Red
    exit 1
}
Write-Host "`nPhase 8: PASS" -ForegroundColor Green

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "All phases: PASS" -ForegroundColor Green
exit 0
