# Smoke Test Runner for Production/Staging
# Purpose: Run a short, deterministic checklist against a running server
# Does NOT require login - only verifies public endpoints and auth behavior
#
# Usage:
#   .\scripts\smoke_prod.ps1                    # Uses http://localhost:3000
#   .\scripts\smoke_prod.ps1 -BaseUrl "https://staging.example.com"

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Production Smoke Test Runner" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0
$warnings = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int]$ExpectedStatus,
        [string]$CheckContent = $null,
        [switch]$NoRedirect
    )

    try {
        # For redirect tests, we need to prevent automatic redirect following
        if ($NoRedirect) {
            # Use .NET HttpWebRequest to control redirect behavior
            $request = [System.Net.HttpWebRequest]::Create($Url)
            $request.Method = "GET"
            $request.AllowAutoRedirect = $false
            $request.Timeout = 10000

            try {
                $response = $request.GetResponse()
                $actualStatus = [int]$response.StatusCode
                $response.Close()
            } catch [System.Net.WebException] {
                if ($_.Exception.Response) {
                    $actualStatus = [int]$_.Exception.Response.StatusCode
                    $_.Exception.Response.Close()
                } else {
                    throw
                }
            }

            if ($actualStatus -eq $ExpectedStatus) {
                Write-Host "  PASS: $Name" -ForegroundColor Green
                $script:passed++
                return $true
            } else {
                Write-Host "  FAIL: $Name - Expected $ExpectedStatus, got $actualStatus" -ForegroundColor Red
                $script:failed++
                return $false
            }
        }

        $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
        $actualStatus = $response.StatusCode

        if ($actualStatus -eq $ExpectedStatus) {
            if ($CheckContent -and $response.Content -notmatch $CheckContent) {
                Write-Host "  WARN: $Name - Status OK but content check failed" -ForegroundColor Yellow
                $script:warnings++
                return $false
            }
            Write-Host "  PASS: $Name" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "  FAIL: $Name - Expected $ExpectedStatus, got $actualStatus" -ForegroundColor Red
            $script:failed++
            return $false
        }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  PASS: $Name (status $statusCode)" -ForegroundColor Green
            $script:passed++
            return $true
        } elseif ($statusCode -gt 0) {
            Write-Host "  FAIL: $Name - Expected $ExpectedStatus, got $statusCode" -ForegroundColor Red
            $script:failed++
            return $false
        } else {
            Write-Host "  FAIL: $Name - Connection error: $($_.Exception.Message)" -ForegroundColor Red
            $script:failed++
            return $false
        }
    }
}

function Test-FileExists {
    param(
        [string]$Name,
        [string]$Path
    )

    if (Test-Path $Path) {
        Write-Host "  PASS: $Name" -ForegroundColor Green
        $script:passed++
        return $true
    } else {
        Write-Host "  FAIL: $Name - File not found: $Path" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

# Determine web directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$webDir = Join-Path $repoRoot "web"

Write-Host "[1/6] Health Check" -ForegroundColor Yellow
Test-Endpoint -Name "/api/health returns 200 with ok:true" -Url "$BaseUrl/api/health" -ExpectedStatus 200 -CheckContent '"ok":true'

Write-Host ""
Write-Host "[2/6] Admin Pages (should return 307 redirect without auth)" -ForegroundColor Yellow
Test-Endpoint -Name "/admin/pipeline returns 307" -Url "$BaseUrl/admin/pipeline" -ExpectedStatus 307 -NoRedirect
Test-Endpoint -Name "/admin/settings returns 307" -Url "$BaseUrl/admin/settings" -ExpectedStatus 307 -NoRedirect
Test-Endpoint -Name "/admin/status returns 307" -Url "$BaseUrl/admin/status" -ExpectedStatus 307 -NoRedirect
Test-Endpoint -Name "/admin/analytics returns 307" -Url "$BaseUrl/admin/analytics" -ExpectedStatus 307 -NoRedirect
Test-Endpoint -Name "/admin/users returns 307" -Url "$BaseUrl/admin/users" -ExpectedStatus 307 -NoRedirect
Test-Endpoint -Name "/admin/events returns 307" -Url "$BaseUrl/admin/events" -ExpectedStatus 307 -NoRedirect

Write-Host ""
Write-Host "[3/6] Protected APIs (should return 401 without auth)" -ForegroundColor Yellow
Test-Endpoint -Name "GET /api/auth/me returns 401" -Url "$BaseUrl/api/auth/me" -ExpectedStatus 401
Test-Endpoint -Name "GET /api/auth/runtime-config returns 401" -Url "$BaseUrl/api/auth/runtime-config" -ExpectedStatus 401
Test-Endpoint -Name "GET /api/notifications returns 401" -Url "$BaseUrl/api/notifications" -ExpectedStatus 401
Test-Endpoint -Name "GET /api/admin/settings returns 401" -Url "$BaseUrl/api/admin/settings" -ExpectedStatus 401
Test-Endpoint -Name "GET /api/admin/analytics/summary returns 401" -Url "$BaseUrl/api/admin/analytics/summary" -ExpectedStatus 401

Write-Host ""
Write-Host "[4/6] Observability APIs (public)" -ForegroundColor Yellow
Test-Endpoint -Name "GET /api/observability/queue-summary returns 200" -Url "$BaseUrl/api/observability/queue-summary" -ExpectedStatus 200
Test-Endpoint -Name "GET /api/observability/claimed returns 200" -Url "$BaseUrl/api/observability/claimed" -ExpectedStatus 200
Test-Endpoint -Name "GET /api/observability/recent-events returns 200" -Url "$BaseUrl/api/observability/recent-events" -ExpectedStatus 200

Write-Host ""
Write-Host "[5/6] Health endpoint includes env_report" -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method GET -TimeoutSec 10
    if ($healthResponse.env_report -and $null -ne $healthResponse.env_report.required_present) {
        Write-Host "  PASS: env_report.required_present exists" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  FAIL: env_report.required_present missing" -ForegroundColor Red
        $failed++
    }

    if ($healthResponse.env_report -and $null -ne $healthResponse.env_report.env_ok) {
        Write-Host "  PASS: env_report.env_ok exists" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  FAIL: env_report.env_ok missing" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "  FAIL: Could not parse health response" -ForegroundColor Red
    $failed += 2
}

Write-Host ""
Write-Host "[6/6] Module File Checks" -ForegroundColor Yellow
Test-FileExists -Name "web/lib/env-validation.ts exists" -Path (Join-Path $webDir "lib\env-validation.ts")
Test-FileExists -Name "web/lib/settings.ts exists" -Path (Join-Path $webDir "lib\settings.ts")
Test-FileExists -Name "web/lib/notify.ts exists" -Path (Join-Path $webDir "lib\notify.ts")
Test-FileExists -Name "web/lib/email.ts exists" -Path (Join-Path $webDir "lib\email.ts")
Test-FileExists -Name "web/lib/slack.ts exists" -Path (Join-Path $webDir "lib\slack.ts")

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "SMOKE TEST SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Passed:   $passed" -ForegroundColor Green
Write-Host "  Failed:   $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })
Write-Host "  Warnings: $warnings" -ForegroundColor $(if ($warnings -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

if ($failed -eq 0) {
    Write-Host "SMOKE TEST: PASS" -ForegroundColor Green
    exit 0
} else {
    Write-Host "SMOKE TEST: FAIL" -ForegroundColor Red
    exit 1
}
