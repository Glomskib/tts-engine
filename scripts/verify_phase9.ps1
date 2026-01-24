# verify_phase9.ps1 - Phase 9 observability endpoints verification
# PowerShell 5.1 compatible
# Run from repo root

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"

if (-not (Test-Path $webDir)) {
    Write-Host "ERROR: web directory not found at $webDir" -ForegroundColor Red
    exit 1
}

Set-Location $webDir

$baseUrl = "http://localhost:3000"

Write-Host "Phase 9 Observability Verification" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check 1: Queue summary endpoint
Write-Host "`n[1/3] Checking /api/observability/queue-summary..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/observability/queue-summary" -Method GET -TimeoutSec 10
    if ($resp.ok -ne $true) {
        Write-Host "  FAIL: queue-summary returned ok=false" -ForegroundColor Red
        exit 1
    }
    if ($null -eq $resp.data.counts_by_status) {
        Write-Host "  FAIL: queue-summary missing counts_by_status field" -ForegroundColor Red
        exit 1
    }
    if ($null -eq $resp.data.total_queued) {
        Write-Host "  FAIL: queue-summary missing total_queued field" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PASS: queue-summary returns 200 with expected fields" -ForegroundColor Green
    Write-Host "    total_queued: $($resp.data.total_queued)" -ForegroundColor Gray
} catch {
    Write-Host "  FAIL: queue-summary endpoint error: $_" -ForegroundColor Red
    exit 1
}

# Check 2: Claimed items endpoint
Write-Host "`n[2/3] Checking /api/observability/claimed..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/observability/claimed" -Method GET -TimeoutSec 10
    if ($resp.ok -ne $true) {
        Write-Host "  FAIL: claimed returned ok=false" -ForegroundColor Red
        exit 1
    }
    if ($null -eq $resp.data) {
        Write-Host "  FAIL: claimed missing data field" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PASS: claimed returns 200 with expected fields" -ForegroundColor Green
    Write-Host "    claimed_count: $($resp.data.Count)" -ForegroundColor Gray
} catch {
    Write-Host "  FAIL: claimed endpoint error: $_" -ForegroundColor Red
    exit 1
}

# Check 3: Recent events endpoint
Write-Host "`n[3/3] Checking /api/observability/recent-events..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/observability/recent-events" -Method GET -TimeoutSec 10
    if ($resp.ok -ne $true) {
        Write-Host "  FAIL: recent-events returned ok=false" -ForegroundColor Red
        exit 1
    }
    if ($null -eq $resp.data) {
        Write-Host "  FAIL: recent-events missing data field" -ForegroundColor Red
        exit 1
    }
    Write-Host "  PASS: recent-events returns 200 with expected fields" -ForegroundColor Green
    Write-Host "    events_count: $($resp.data.Count)" -ForegroundColor Gray
} catch {
    Write-Host "  FAIL: recent-events endpoint error: $_" -ForegroundColor Red
    exit 1
}

# Check 4: Run smoke_prod.ps1 if it exists (informational, non-blocking)
Write-Host "`n[4/4] Running smoke_prod.ps1 (informational)..." -ForegroundColor Yellow
$smokePath = Join-Path $PSScriptRoot "smoke_prod.ps1"
if (Test-Path $smokePath) {
    try {
        # Run smoke test but don't fail verification if it has issues
        $smokeOutput = & powershell -ExecutionPolicy Bypass -File $smokePath -BaseUrl $baseUrl 2>&1
        $smokeExitCode = $LASTEXITCODE

        # Show summary only
        $summaryLines = $smokeOutput | Select-String -Pattern "(PASS|FAIL|Passed|Failed|Warnings)" | Select-Object -Last 5
        foreach ($line in $summaryLines) {
            Write-Host "    $line" -ForegroundColor Gray
        }

        if ($smokeExitCode -eq 0) {
            Write-Host "  PASS: smoke_prod.ps1 completed successfully" -ForegroundColor Green
        } else {
            Write-Host "  WARN: smoke_prod.ps1 reported issues (non-blocking)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  WARN: smoke_prod.ps1 execution error (non-blocking): $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  SKIP: smoke_prod.ps1 not found at $smokePath" -ForegroundColor Yellow
}

Write-Host "`n===================================" -ForegroundColor Cyan
Write-Host "Phase 9 verification PASSED" -ForegroundColor Green
exit 0
