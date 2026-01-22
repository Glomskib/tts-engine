# verify_all.ps1 - Run all phase verification scripts
# PowerShell 5.1 compatible

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$healthUrl = "http://localhost:3000/api/health"
$startedServer = $false
$serverProc = $null

function Test-HealthEndpoint {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $resp.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Stop-ServerIfStarted {
    if ($script:startedServer -and $script:serverProc -and -not $script:serverProc.HasExited) {
        Write-Host "`nStopping dev server (PID: $($script:serverProc.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $script:serverProc.Id -Force -ErrorAction SilentlyContinue
        # Also stop any child node processes on port 3000
        $netstatOutput = netstat -ano 2>$null | findstr ":3000" | findstr "LISTENING"
        if ($netstatOutput) {
            $pids = $netstatOutput | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
            foreach ($procId in $pids) {
                if ($procId -match '^\d+$') {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host "Running all verification scripts..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Ensure dev server is reachable
Write-Host "`n[Pre-check] Checking dev server health..." -ForegroundColor Yellow
if (-not (Test-HealthEndpoint)) {
    Write-Host "  Dev server not reachable. Starting via dev_web.ps1..." -ForegroundColor Yellow
    $devScript = Join-Path $scriptDir "dev_web.ps1"
    if (-not (Test-Path $devScript)) {
        Write-Host "  FAIL: dev_web.ps1 not found at $devScript" -ForegroundColor Red
        exit 1
    }
    $serverProc = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$devScript`"" -PassThru -WindowStyle Minimized
    $startedServer = $true

    # Poll for health up to 60 seconds
    $maxWait = 60
    $pollInterval = 2
    $waited = 0
    Write-Host "  Waiting for server (max ${maxWait}s)..." -ForegroundColor Yellow
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds $pollInterval
        $waited += $pollInterval
        if (Test-HealthEndpoint) {
            Write-Host "  Dev server is ready (took ${waited}s)" -ForegroundColor Green
            Write-Host "  Allowing routes to compile (10s)..." -ForegroundColor Gray
            Start-Sleep -Seconds 10
            break
        }
        Write-Host "    ... still waiting (${waited}s)" -ForegroundColor Gray
    }
    if (-not (Test-HealthEndpoint)) {
        Write-Host "  FAIL: Dev server did not become healthy within ${maxWait}s" -ForegroundColor Red
        Stop-ServerIfStarted
        exit 1
    }
} else {
    Write-Host "  Dev server already running" -ForegroundColor Green
}

# Preflight cleanup: release any stale claims to ensure deterministic tests
Write-Host "`n[Pre-check] Releasing stale claims..." -ForegroundColor Yellow
try {
    $releaseUrl = "http://localhost:3000/api/videos/release-stale"
    $releaseResp = Invoke-WebRequest -Uri $releaseUrl -Method POST -ContentType "application/json" -Body "{}" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $releaseData = $releaseResp.Content | ConvertFrom-Json
    if ($releaseData.ok) {
        Write-Host "  Released $($releaseData.released_count) stale claim(s)" -ForegroundColor Green
    } else {
        Write-Host "  WARN: release-stale returned ok=false" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN: Could not call release-stale endpoint (continuing anyway)" -ForegroundColor Yellow
}

$finalExit = 0
try {
    # Phase 7
    Write-Host "`n[Phase 7]" -ForegroundColor Yellow
    & "$scriptDir\verify_phase7.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nPhase 7: FAIL" -ForegroundColor Red
        $finalExit = 1
        return
    }
    Write-Host "`nPhase 7: PASS" -ForegroundColor Green

    # Phase 8
    Write-Host "`n[Phase 8]" -ForegroundColor Yellow
    & "$scriptDir\verify_phase8.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nPhase 8: FAIL" -ForegroundColor Red
        $finalExit = 1
        return
    }
    Write-Host "`nPhase 8: PASS" -ForegroundColor Green

    # Phase 9 (optional - only if script exists)
    $phase9Script = Join-Path $scriptDir "verify_phase9.ps1"
    if (Test-Path $phase9Script) {
        Write-Host "`n[Phase 9]" -ForegroundColor Yellow
        & $phase9Script
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`nPhase 9: FAIL" -ForegroundColor Red
            $finalExit = 1
            return
        }
        Write-Host "`nPhase 9: PASS" -ForegroundColor Green
    }

    Write-Host "`n====================================" -ForegroundColor Cyan
    Write-Host "All phases: PASS" -ForegroundColor Green
} finally {
    Stop-ServerIfStarted
}
exit $finalExit
