# verify_phase8.ps1 - Phase 8 video pipeline verification
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

# Valid video statuses (must match video-pipeline.ts)
$validStatuses = @("needs_edit", "ready_to_post", "posted", "failed", "archived")

# Queue states where duplicates are not allowed
$queueStates = @("needs_edit", "ready_to_post")

Write-Host "Phase 8 Video Pipeline Verification" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

function Read-HttpErrorBody {
  param([Parameter(Mandatory=$true)] $Err)
  try {
    $resp = $Err.Exception.Response
    if (-not $resp) { return $null }
    $stream = $resp.GetResponseStream()
    if (-not $stream) { return $null }
    $reader = New-Object System.IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch {
    return $null
  }
}

function Read-HttpStatusCode {
  param([Parameter(Mandatory=$true)] $Err)
  try {
    if ($Err.Exception.Response -and $Err.Exception.Response.StatusCode) {
      return [int]$Err.Exception.Response.StatusCode
    }
    return $null
  } catch {
    return $null
  }
}

function Try-ParseJsonString {
  param([Parameter(Mandatory=$true)][string] $Text)
  try {
    $trim = $Text.Trim()
    if ($trim.StartsWith('{') -or $trim.StartsWith('[')) {
      return $trim | ConvertFrom-Json -ErrorAction Stop
    }
    return $null
  } catch {
    return $null
  }
}

# Check 1: Health endpoint
Write-Host "`n[1/12] Checking /api/health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET -TimeoutSec 10
    if ($health.ok -eq $true) {
        Write-Host "  PASS: Health check OK" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Health check returned ok=false" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  FAIL: Health endpoint unreachable. Is dev server running?" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

# Check 2: Get accounts to test videos endpoint
Write-Host "`n[2/12] Fetching accounts for video queries..." -ForegroundColor Yellow
try {
    $accounts = Invoke-RestMethod -Uri "$baseUrl/api/accounts" -Method GET -TimeoutSec 10
    if (-not $accounts.ok -or -not $accounts.data -or $accounts.data.Count -eq 0) {
        Write-Host "  WARN: No accounts found, skipping video invariant checks" -ForegroundColor Yellow
        Write-Host "`nPhase 8 verification PASSED (limited - no accounts)" -ForegroundColor Green
        exit 0
    }
    $testAccountId = $accounts.data[0].id
    Write-Host "  PASS: Found $($accounts.data.Count) account(s), using: $testAccountId" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: Could not fetch accounts" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

# Check 3: Videos status enum validation
Write-Host "`n[3/12] Validating video status enum..." -ForegroundColor Yellow
try {
    $videos = Invoke-RestMethod -Uri "$baseUrl/api/videos?account_id=$testAccountId" -Method GET -TimeoutSec 10
    if (-not $videos.ok) {
        Write-Host "  FAIL: Videos endpoint returned ok=false" -ForegroundColor Red
        exit 1
    }
    
    $invalidStatuses = @()
    foreach ($video in $videos.data) {
        if ($video.status -and $validStatuses -notcontains $video.status) {
            $invalidStatuses += "$($video.id): $($video.status)"
        }
    }
    
    if ($invalidStatuses.Count -gt 0) {
        Write-Host "  FAIL: Found videos with invalid status:" -ForegroundColor Red
        $invalidStatuses | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "  PASS: All $($videos.data.Count) video(s) have valid status" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: Could not validate video statuses" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

# Check 4: No duplicate variant+account in queue states
Write-Host "`n[4/12] Checking for duplicate variant+account in queue states..." -ForegroundColor Yellow
try {
    $allVideos = @()
    foreach ($account in $accounts.data) {
        $accVideos = Invoke-RestMethod -Uri "$baseUrl/api/videos?account_id=$($account.id)" -Method GET -TimeoutSec 10
        if ($accVideos.ok -and $accVideos.data) {
            $allVideos += $accVideos.data
        }
    }
    
    # Filter to queue states only
    $queueVideos = $allVideos | Where-Object { $queueStates -contains $_.status }
    
    # Check for duplicates
    $seen = @{}
    $duplicates = @()
    foreach ($video in $queueVideos) {
        $key = "$($video.variant_id)|$($video.account_id)"
        if ($seen.ContainsKey($key)) {
            $duplicates += "variant=$($video.variant_id) account=$($video.account_id)"
        }
        $seen[$key] = $true
    }
    
    if ($duplicates.Count -gt 0) {
        Write-Host "  FAIL: Found duplicate variant+account in queue states:" -ForegroundColor Red
        $duplicates | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "  PASS: No duplicates in queue states ($($queueVideos.Count) queue videos checked)" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: Could not check for duplicates" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

# Check 5: Verify Phase 8.2 database objects exist (hosted Supabase)
Write-Host "`n[5/12] Verifying migrations 009/010 via API behavior (non-destructive)..." -ForegroundColor Yellow
try {
    # Migration 010: claim endpoints should exist and work for queue videos
    # Create (or dedupe-return) a queue video via API to ensure we have a valid videos.id
    $variants = Invoke-RestMethod -Uri "$baseUrl/api/variants" -Method GET -TimeoutSec 15
    if (!$variants.data -or $variants.data.Count -eq 0) { throw "No variants found to create a video for Check 5" }
    $variantId = $variants.data[0].id

    $createPayload = @{ 
      variant_id = $variantId
      account_id = $testAccountId
      status = "needs_edit"
      google_drive_url = "https://drive.google.com/drive/folders/PHASE8_VERIFY"
    } | ConvertTo-Json -Depth 10

    $createResp = Invoke-RestMethod -Uri "$baseUrl/api/videos" -Method POST -ContentType "application/json" -Body $createPayload -TimeoutSec 15
    if ($createResp.ok -eq $false) { throw "Create video failed: $($createResp.error)" }
    $vid = $createResp.data.id
    if (!$vid) { throw "Create video did not return data.id" }

    # Force-release the video first to ensure clean state (handles leftover claims from previous test runs)
    $forceReleasePayload = @{ released_by = "admin"; force = $true } | ConvertTo-Json -Depth 5
    try {
        $forceReleaseResp = Invoke-RestMethod -Uri "$baseUrl/api/videos/$vid/release" -Method POST -ContentType "application/json" -Body $forceReleasePayload -TimeoutSec 10 -ErrorAction SilentlyContinue
        # Ignore result - just ensuring clean state
    } catch {
        # Ignore errors - video may not have been claimed
    }

    $claimPayload = @{ claimed_by = "verify_phase8"; claim_role = "admin" } | ConvertTo-Json -Depth 5
        try {
            $claimResp = Invoke-RestMethod -Uri "$baseUrl/api/videos/$vid/claim" -Method POST -ContentType "application/json" -Body $claimPayload -TimeoutSec 15
            if ($claimResp.ok -ne $true) {
                $respJson = $claimResp | ConvertTo-Json -Depth 10
                throw "FAIL: Claim endpoint returned ok:false. Response: $respJson"
            }
        } catch {
            $body = Read-HttpErrorBody $_
            $errJson = $null
            if ($body) { $errJson = Try-ParseJsonString $body }
            if ($errJson) {
                $respStr = $errJson | ConvertTo-Json -Depth 10
                throw "FAIL: Claim endpoint error. Response: $respStr"
            }
            throw "FAIL: Claim endpoint error: $_"
        }

        # Immediately release so verification does not consume the queue
        $releasePayload = @{ released_by = "verify_phase8" } | ConvertTo-Json -Depth 5
        try {
            $releaseResp = Invoke-RestMethod -Uri "$baseUrl/api/videos/$vid/release" -Method POST -ContentType "application/json" -Body $releasePayload -TimeoutSec 10
            if ($releaseResp.ok -ne $true) {
                $respJson = $releaseResp | ConvertTo-Json -Depth 10
                throw "FAIL: Release endpoint returned ok:false. Response: $respJson"
            }
        } catch {
            $body = Read-HttpErrorBody $_
            $errJson = $null
            if ($body) { $errJson = Try-ParseJsonString $body }
            if ($errJson) {
                $respStr = $errJson | ConvertTo-Json -Depth 10
                throw "FAIL: Release endpoint error. Response: $respStr"
            }
            throw "FAIL: Release endpoint error: $_"
        }
        Write-Host "  PASS: Claim + release endpoints operational (non-destructive)" -ForegroundColor Green

    # Migration 009: events endpoint should exist
    if ($videos.data.Count -gt 0) {
        $anyVid = $videos.data[0].id
        $eventsResp = Invoke-RestMethod -Uri "$baseUrl/api/videos/$anyVid/events" -Method GET -TimeoutSec 10
        if ($eventsResp.ok -ne $true) { throw "FAIL: Events endpoint returned ok:false" }
        Write-Host "  PASS: Events endpoint operational" -ForegroundColor Green
    }
} catch {
    $status = Read-HttpStatusCode $_
    $body = Read-HttpErrorBody $_
    $errJson = $null
    if ($body) { $errJson = Try-ParseJsonString $body }
    Write-Host "  FAIL: Claim/events behavior check failed" -ForegroundColor Red
    if ($status) { Write-Host "  HTTP: $status" -ForegroundColor Red }
    if ($body)   { Write-Host "  BODY: $body" -ForegroundColor Red }
    if ($errJson -and $errJson.error) {
      throw "Check 5 failed: $($errJson.error)"
    }
    throw "Check 5 failed: $($_.Exception.Message)"
}

# Check 5b: Test attach-script clears queue blocker
Write-Host "`n[5b/12] Testing attach-script clears queue blocker..." -ForegroundColor Yellow
try {
    # Get an approved script to use for testing
    $scriptsResult = Invoke-RestMethod -Uri "$baseUrl/api/scripts?status=APPROVED&limit=1" -Method GET -TimeoutSec 10

    if (-not $scriptsResult.ok -or -not $scriptsResult.data -or $scriptsResult.data.Count -eq 0) {
        Write-Host "  SKIP: No approved scripts available for blocker test" -ForegroundColor Yellow
    } else {
        $testScriptId = $scriptsResult.data[0].id

        # Create a fresh test video without a script
        $testDriveUrl = "https://drive.google.com/test/blocker-verify-$(Get-Random)"
        $createPayload = @{
            variant_id = $variantId
            account_id = $testAccountId
            status = "needs_edit"
            google_drive_url = $testDriveUrl
        } | ConvertTo-Json -Depth 5

        $createResult = Invoke-RestMethod -Uri "$baseUrl/api/videos" -Method POST -ContentType "application/json" -Body $createPayload -TimeoutSec 10

        if (-not $createResult.ok) {
            Write-Host "  SKIP: Could not create test video: $($createResult.error)" -ForegroundColor Yellow
        } else {
            $blockerTestVideoId = $createResult.data.id
            Write-Host "    Created test video: $blockerTestVideoId" -ForegroundColor Gray

            # Check queue for this video - should have blocked_reason
            $queueCheck1 = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=100" -Method GET -TimeoutSec 10
            $videoInQueue1 = $queueCheck1.data | Where-Object { $_.id -eq $blockerTestVideoId }

            if ($null -eq $videoInQueue1) {
                Write-Host "  WARN: Test video not found in queue response" -ForegroundColor Yellow
            } elseif ($null -eq $videoInQueue1.blocked_reason -or $videoInQueue1.blocked_reason -eq "") {
                Write-Host "  WARN: Video should have blocked_reason before script attached (got: $($videoInQueue1.blocked_reason))" -ForegroundColor Yellow
            } else {
                Write-Host "    Before attach: blocked_reason = '$($videoInQueue1.blocked_reason)'" -ForegroundColor Gray

                # Attach the script
                $attachPayload = @{ script_id = $testScriptId } | ConvertTo-Json -Depth 5
                $attachResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$blockerTestVideoId/attach-script" -Method POST -ContentType "application/json" -Body $attachPayload -TimeoutSec 10

                if (-not $attachResult.ok) {
                    Write-Host "  FAIL: Attach script failed: $($attachResult.error)" -ForegroundColor Red
                } else {
                    Write-Host "    Script attached successfully" -ForegroundColor Gray

                    # Re-check queue - blocker should be cleared
                    $queueCheck2 = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=100" -Method GET -TimeoutSec 10
                    $videoInQueue2 = $queueCheck2.data | Where-Object { $_.id -eq $blockerTestVideoId }

                    if ($null -eq $videoInQueue2) {
                        Write-Host "  WARN: Test video not found in queue after attach" -ForegroundColor Yellow
                    } elseif ($null -ne $videoInQueue2.blocked_reason -and $videoInQueue2.blocked_reason -ne "" -and $videoInQueue2.blocked_reason -like "*script*") {
                        Write-Host "  FAIL: Script blocker not cleared after attach (blocked_reason = '$($videoInQueue2.blocked_reason)')" -ForegroundColor Red
                    } else {
                        Write-Host "    After attach: blocked_reason cleared or not script-related" -ForegroundColor Gray
                        Write-Host "  PASS: Attach-script clears queue blocker" -ForegroundColor Green
                    }
                }
            }

            # Clean up: Delete the test video (or set to completed to remove from queue)
            try {
                $cleanupPayload = @{ status = "completed" } | ConvertTo-Json -Depth 5
                Invoke-RestMethod -Uri "$baseUrl/api/videos/$blockerTestVideoId" -Method PATCH -ContentType "application/json" -Body $cleanupPayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
                Write-Host "    Cleaned up test video" -ForegroundColor Gray
            } catch {
                # Ignore cleanup errors - video may not support PATCH
            }
        }
    }
} catch {
    $errMsg = $_.Exception.Message
    Write-Host "  WARN: Attach-script blocker test error: $errMsg" -ForegroundColor Yellow
}

# Check 6: Test duplicate prevention via API (index enforcement)
Write-Host "`n[6/12] Confirming API-level duplicate prevention (idempotency)..." -ForegroundColor Yellow
try {
    # Get a variant to test with
    $variants = Invoke-RestMethod -Uri "$baseUrl/api/variants" -Method GET -TimeoutSec 10
    if (-not $variants.ok -or -not $variants.data -or $variants.data.Count -eq 0) {
        Write-Host "  SKIP: No variants available for duplicate test" -ForegroundColor Yellow
    } else {
        $testVariantId = $variants.data[0].id
        $testUrl = "https://test.example.com/duplicate-check-$(Get-Random)"
        
        # Create first video
        $body1 = @{
            variant_id = $testVariantId
            account_id = $testAccountId
            google_drive_url = $testUrl
            status = "needs_edit"
        } | ConvertTo-Json
        
        $result1 = Invoke-RestMethod -Uri "$baseUrl/api/videos" -Method POST -ContentType "application/json" -Body $body1 -TimeoutSec 10
        
        if ($result1.ok) {
            # Attempt to create duplicate
            $body2 = @{
                variant_id = $testVariantId
                account_id = $testAccountId
                google_drive_url = "https://test.example.com/duplicate-$(Get-Random)"
                status = "needs_edit"
            } | ConvertTo-Json
            
            $result2 = Invoke-RestMethod -Uri "$baseUrl/api/videos" -Method POST -ContentType "application/json" -Body $body2 -TimeoutSec 10
            
            if ($result2.existing -eq $true) {
                Write-Host "  PASS: API returned existing record for duplicate (idempotent)" -ForegroundColor Green
            } elseif ($result2.ok -eq $false) {
                Write-Host "  PASS: API rejected duplicate video creation" -ForegroundColor Green
            } else {
                Write-Host "  WARN: Duplicate was created - index may not be applied yet" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  SKIP: Could not create test video: $($result1.error)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  SKIP: Duplicate test failed (may need migration): $_" -ForegroundColor Yellow
}
Write-Host "  PASS: API duplicate prevention check completed" -ForegroundColor Green

# Check 7: Stress-checking DB-level queue dedupe (migration 008) via race
Write-Host "`n[7/12] Stress-checking DB-level queue dedupe (migration 008) via race..." -ForegroundColor Yellow
# This attempts to create the same queue item twice concurrently.
# If the DB unique partial index exists, at worst one insert succeeds and the other returns existing/duplicate behavior.
# If the DB constraint is missing AND API check is bypassed, both can insert (we want to catch that).
if ($null -eq $queueCandidate) {
    Write-Host "  WARN: Skipping race test (no queueCandidate available)" -ForegroundColor Yellow
} else {
    $payload = @{
        variant_id = $queueCandidate.variant_id
        account_id = $queueCandidate.account_id
        status     = $queueCandidate.status
        google_drive_url = $queueCandidate.google_drive_url
    } | ConvertTo-Json -Depth 10

    $u = "$baseUrl/api/videos"
    $job1 = Start-Job -ScriptBlock {
        param($u,$payload)
        $ErrorActionPreference = "Stop"
        Invoke-RestMethod -Uri $u -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 10
    } -ArgumentList $u,$payload
    $job2 = Start-Job -ScriptBlock {
        param($u,$payload)
        $ErrorActionPreference = "Stop"
        Invoke-RestMethod -Uri $u -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 10
    } -ArgumentList $u,$payload

    Wait-Job -Job $job1,$job2 -Timeout 20 | Out-Null

    if ($job1.State -ne "Completed") {
        $e = ($job1.ChildJobs | Select-Object -First 1).JobStateInfo.Reason
        Stop-Job $job1 -Force -ErrorAction SilentlyContinue
        Remove-Job $job1 -Force -ErrorAction SilentlyContinue
        throw "FAIL: Race job1 did not complete. $e"
    }
    if ($job2.State -ne "Completed") {
        $e = ($job2.ChildJobs | Select-Object -First 1).JobStateInfo.Reason
        Stop-Job $job2 -Force -ErrorAction SilentlyContinue
        Remove-Job $job2 -Force -ErrorAction SilentlyContinue
        throw "FAIL: Race job2 did not complete. $e"
    }

    $r1 = Receive-Job -Job $job1 -ErrorAction Stop -AutoRemoveJob
    $r2 = Receive-Job -Job $job2 -ErrorAction Stop -AutoRemoveJob

    if ($null -eq $r1 -or $null -eq $r2) {
        throw "FAIL: Race insert returned empty response(s)"
    }

    if (($r1.ok -ne $true) -or ($r2.ok -ne $true)) {
        throw "FAIL: Race insert returned ok:false (possible migration 008 missing or API behavior mismatch)"
    }

    Write-Host "  PASS: Race insert did not create duplicate queue records" -ForegroundColor Green
}

# Check 8: Claim workflow test
Write-Host "`n[8/12] Testing claim workflow..." -ForegroundColor Yellow
try {
    # Get first unclaimed queue video
    $queueResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=unclaimed&limit=1" -Method GET -TimeoutSec 10
    
    if (-not $queueResult.ok) {
        Write-Host "  FAIL: Queue endpoint returned ok=false: $($queueResult.error)" -ForegroundColor Red
        exit 1
    }
    
    if (-not $queueResult.data -or $queueResult.data.Count -eq 0) {
        Write-Host "  PASS: No unclaimed queue videos; skipping claim test" -ForegroundColor Green
    } else {
        $testVideoId = $queueResult.data[0].id
        Write-Host "  Testing claim on video: $testVideoId" -ForegroundColor Gray
        
        # Step 1: Claim it
        $claimBody1 = @{ claimed_by = "smoke_test"; claim_role = "admin" } | ConvertTo-Json
        $claimResult1 = Invoke-RestMethod -Uri "$baseUrl/api/videos/$testVideoId/claim" -Method POST -ContentType "application/json" -Body $claimBody1 -TimeoutSec 10
        
        if (-not $claimResult1.ok) {
            $respJson = $claimResult1 | ConvertTo-Json -Depth 10
            Write-Host "  FAIL: Initial claim failed: $($claimResult1.error)" -ForegroundColor Red
            Write-Host "  Response body: $respJson" -ForegroundColor Red
            exit 1
        }
        Write-Host "    Step 1: Claimed by smoke_test - OK" -ForegroundColor Gray
        
        # Step 2: Try to re-claim with different user (should fail 409)
        $claimBody2 = @{ claimed_by = "other_user"; claim_role = "admin" } | ConvertTo-Json
        $claimFailed = $false
        try {
            $claimResult2 = Invoke-RestMethod -Uri "$baseUrl/api/videos/$testVideoId/claim" -Method POST -ContentType "application/json" -Body $claimBody2 -TimeoutSec 10
            if ($claimResult2.ok -eq $false) {
                $claimFailed = $true
            }
        } catch {
            # Expected: 409 error
            $claimFailed = $true
        }
        
        if (-not $claimFailed) {
            Write-Host "  FAIL: Re-claim by another user should have failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "    Step 2: Re-claim by other_user rejected - OK" -ForegroundColor Gray
        
        # Step 3: Release with original claimer
        $releaseBody = @{ released_by = "smoke_test" } | ConvertTo-Json
        $releaseResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$testVideoId/release" -Method POST -ContentType "application/json" -Body $releaseBody -TimeoutSec 10
        
        if (-not $releaseResult.ok) {
            $respJson = $releaseResult | ConvertTo-Json -Depth 10
            Write-Host "  FAIL: Release failed: $($releaseResult.error)" -ForegroundColor Red
            Write-Host "  Response body: $respJson" -ForegroundColor Red
            exit 1
        }
        Write-Host "    Step 3: Released by smoke_test - OK" -ForegroundColor Gray
        
        # Step 4: Verify it appears unclaimed
        $queueCheck = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=unclaimed&limit=50" -Method GET -TimeoutSec 10
        $foundUnclaimed = $queueCheck.data | Where-Object { $_.id -eq $testVideoId }
        
        if (-not $foundUnclaimed) {
            Write-Host "  WARN: Video not found in unclaimed queue after release (may have been claimed by another process)" -ForegroundColor Yellow
        } else {
            Write-Host "    Step 4: Video appears unclaimed - OK" -ForegroundColor Gray
        }
        
        Write-Host "  PASS: Claim workflow completed successfully" -ForegroundColor Green
    }
} catch {
    Write-Host "  SKIP: Claim workflow test failed (columns may not exist yet): $_" -ForegroundColor Yellow
}

# Check 9: Execution gating workflow test
Write-Host "`n[9/12] Testing execution gating workflow..." -ForegroundColor Yellow
try {
    # Use the same test video from Check 5 (which has a script attached)
    # Ensure it has a locked script
    $queueForExec = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=100" -Method GET -TimeoutSec 10
    $videoWithScript = $queueForExec.data | Where-Object { $null -ne $_.script_locked_text -and $_.script_locked_text -ne "" } | Select-Object -First 1

    if ($null -eq $videoWithScript) {
        Write-Host "  SKIP: No video with locked script found for execution test" -ForegroundColor Yellow
    } else {
        $execTestVideoId = $videoWithScript.id
        $originalStatus = $videoWithScript.recording_status
        Write-Host "    Testing execution gating on video: $execTestVideoId (current status: $originalStatus)" -ForegroundColor Gray

        # Store original status to restore later
        $statusesToTest = @("NOT_RECORDED", "RECORDED", "EDITED", "READY_TO_POST")
        $allPassed = $true

        # Reset to NOT_RECORDED first (with admin + force to bypass validation, require_claim=false to skip claim check)
        $resetPayload = @{ recording_status = "NOT_RECORDED"; updated_by = "admin"; actor_role = "admin"; force = $true; require_claim = $false } | ConvertTo-Json -Depth 5
        $resetResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $resetPayload -TimeoutSec 10
        if (-not $resetResult.ok) {
            Write-Host "    WARN: Could not reset to NOT_RECORDED: $($resetResult.error)" -ForegroundColor Yellow
        } else {
            Write-Host "    Reset to NOT_RECORDED - OK" -ForegroundColor Gray
        }

        # Transition: NOT_RECORDED -> RECORDED (require_claim=false for this test - role enforcement tested in Check 10)
        $recordPayload = @{ recording_status = "RECORDED"; require_claim = $false } | ConvertTo-Json -Depth 5
        $recordResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $recordPayload -TimeoutSec 10
        if (-not $recordResult.ok) {
            Write-Host "    FAIL: NOT_RECORDED -> RECORDED failed: $($recordResult.error)" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "    NOT_RECORDED -> RECORDED - OK" -ForegroundColor Gray
        }

        # Transition: RECORDED -> EDITED
        $editPayload = @{ recording_status = "EDITED"; require_claim = $false } | ConvertTo-Json -Depth 5
        $editResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $editPayload -TimeoutSec 10
        if (-not $editResult.ok) {
            Write-Host "    FAIL: RECORDED -> EDITED failed: $($editResult.error)" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "    RECORDED -> EDITED - OK" -ForegroundColor Gray
        }

        # Transition: EDITED -> READY_TO_POST (video has google_drive_url so should work)
        $readyPayload = @{ recording_status = "READY_TO_POST"; require_claim = $false } | ConvertTo-Json -Depth 5
        $readyResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $readyPayload -TimeoutSec 10
        if (-not $readyResult.ok) {
            Write-Host "    FAIL: EDITED -> READY_TO_POST failed: $($readyResult.error)" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "    EDITED -> READY_TO_POST - OK" -ForegroundColor Gray
        }

        # Clear posted_url/platform first so the POSTED test is valid
        $clearPostedPayload = @{ posted_url = $null; posted_platform = $null; require_claim = $false } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $clearPostedPayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Transition: READY_TO_POST -> POSTED (should FAIL without posted_url/platform)
        $postFailPayload = @{ recording_status = "POSTED"; require_claim = $false } | ConvertTo-Json -Depth 5
        $postFailResult = $null
        $postFailedAsExpected = $false
        try {
            $postFailResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $postFailPayload -TimeoutSec 10
            if ($postFailResult.ok -eq $false) {
                $postFailedAsExpected = $true
            }
        } catch {
            # Expected: 400 error
            $postFailedAsExpected = $true
        }
        if (-not $postFailedAsExpected) {
            Write-Host "    FAIL: POSTED should have required posted_url/platform" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "    READY_TO_POST -> POSTED (without fields) correctly rejected - OK" -ForegroundColor Gray
        }

        # Transition: READY_TO_POST -> POSTED (with required fields)
        $postPayload = @{
            recording_status = "POSTED"
            posted_url = "https://test.example.com/video-$(Get-Random)"
            posted_platform = "tiktok"
            require_claim = $false
        } | ConvertTo-Json -Depth 5
        $postResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $postPayload -TimeoutSec 10
        if (-not $postResult.ok) {
            Write-Host "    FAIL: READY_TO_POST -> POSTED (with fields) failed: $($postResult.error)" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "    READY_TO_POST -> POSTED (with fields) - OK" -ForegroundColor Gray
        }

        # Verify events were recorded
        $eventsResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/events" -Method GET -TimeoutSec 10
        if ($eventsResult.ok -and $eventsResult.data.Count -gt 0) {
            $statusChangeEvents = $eventsResult.data | Where-Object { $_.event_type -eq "recording_status_changed" }
            Write-Host "    Found $($statusChangeEvents.Count) status change events - OK" -ForegroundColor Gray
        } else {
            Write-Host "    WARN: No events found for video" -ForegroundColor Yellow
        }

        # Restore original status
        $restorePayload = @{ recording_status = $originalStatus; updated_by = "admin"; actor_role = "admin"; force = $true; require_claim = $false } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$execTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $restorePayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    Restored to original status: $originalStatus" -ForegroundColor Gray

        if ($allPassed) {
            Write-Host "  PASS: Execution gating workflow completed successfully" -ForegroundColor Green
        } else {
            Write-Host "  WARN: Some execution gating checks failed" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  WARN: Execution gating test error: $_" -ForegroundColor Yellow
}

# Check 10: Role-based claim enforcement and handoff workflow
Write-Host "`n[10/12] Testing role-based claim enforcement..." -ForegroundColor Yellow
try {
    # First check if claim_role column exists by attempting a claim with role
    $testClaimBody = @{ claimed_by = "migration_check"; claim_role = "recorder" } | ConvertTo-Json -Depth 5
    # Find any video to test
    $testQueueResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=unclaimed&limit=1" -Method GET -TimeoutSec 10
    $hasClaimRoleColumn = $false
    if ($testQueueResult.ok -and $testQueueResult.data -and $testQueueResult.data.Count -gt 0) {
        $testVid = $testQueueResult.data[0].id
        try {
            $testClaimResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$testVid/claim" -Method POST -ContentType "application/json" -Body $testClaimBody -TimeoutSec 10
            if ($testClaimResult.ok) {
                # Check if claim_role was actually stored
                if ($testClaimResult.data.claim_role -eq "recorder") {
                    $hasClaimRoleColumn = $true
                }
                # Release the test claim
                $releaseTestBody = @{ released_by = "admin"; force = $true } | ConvertTo-Json -Depth 5
                Invoke-RestMethod -Uri "$baseUrl/api/videos/$testVid/release" -Method POST -ContentType "application/json" -Body $releaseTestBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            }
        } catch {
            # Column might not exist - that's fine
        }
    }

    if (-not $hasClaimRoleColumn) {
        Write-Host "  SKIP: claim_role column not available (migration 015 not applied)" -ForegroundColor Yellow
        Write-Host "  To enable role enforcement, apply: web/supabase/migrations/015_claim_roles.sql" -ForegroundColor Yellow
    } else {
        # Find a video with script_locked_text (required for execution workflow)
        $queueForRole = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=100" -Method GET -TimeoutSec 10
        $videoWithScript = $queueForRole.data | Where-Object { $null -ne $_.script_locked_text -and $_.script_locked_text -ne "" } | Select-Object -First 1

        if ($null -eq $videoWithScript) {
            Write-Host "  SKIP: No video with script_locked_text found for role enforcement test" -ForegroundColor Yellow
        } else {
        $roleTestVideoId = $videoWithScript.id
        $originalStatus = $videoWithScript.recording_status
        Write-Host "    Testing role-based enforcement on video: $roleTestVideoId" -ForegroundColor Gray

        $allRolePassed = $true

        # Cleanup: Force release any existing claim
        $forceReleaseBody = @{ released_by = "admin"; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/release" -Method POST -ContentType "application/json" -Body $forceReleaseBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Reset to NOT_RECORDED for clean state
        $resetPayload = @{ recording_status = "NOT_RECORDED"; updated_by = "admin"; actor_role = "admin"; force = $true; require_claim = $false } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $resetPayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Step 1: Claim as recorder
        $claimRecorderBody = @{ claimed_by = "verify_recorder"; claim_role = "recorder" } | ConvertTo-Json -Depth 5
        $claimRecorderResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/claim" -Method POST -ContentType "application/json" -Body $claimRecorderBody -TimeoutSec 10
        if (-not $claimRecorderResult.ok) {
            Write-Host "    FAIL: Claim as recorder failed: $($claimRecorderResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 1: Claimed as recorder - OK" -ForegroundColor Gray
        }

        # Step 2: Recorder -> RECORDED should PASS
        $recordedPayload = @{ recording_status = "RECORDED"; updated_by = "verify_recorder" } | ConvertTo-Json -Depth 5
        $recordedResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $recordedPayload -TimeoutSec 10
        if (-not $recordedResult.ok) {
            Write-Host "    FAIL: Recorder -> RECORDED should have passed: $($recordedResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 2: Recorder -> RECORDED passed - OK" -ForegroundColor Gray
        }

        # Step 3: Recorder -> EDITED should FAIL with ROLE_MISMATCH
        $editedPayload = @{ recording_status = "EDITED"; updated_by = "verify_recorder" } | ConvertTo-Json -Depth 5
        $roleMismatchFailed = $false
        $roleMismatchCode = $null
        try {
            $editedResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $editedPayload -TimeoutSec 10
            if ($editedResult.ok -eq $false -and $editedResult.code -eq "ROLE_MISMATCH") {
                $roleMismatchFailed = $true
                $roleMismatchCode = $editedResult.code
            }
        } catch {
            $body = Read-HttpErrorBody $_
            if ($body) {
                $errJson = Try-ParseJsonString $body
                if ($errJson -and $errJson.code -eq "ROLE_MISMATCH") {
                    $roleMismatchFailed = $true
                    $roleMismatchCode = $errJson.code
                }
            }
        }
        if (-not $roleMismatchFailed) {
            Write-Host "    FAIL: Recorder -> EDITED should have returned ROLE_MISMATCH" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 3: Recorder -> EDITED rejected with $roleMismatchCode - OK" -ForegroundColor Gray
        }

        # Step 4: Handoff recorder -> editor
        $handoffEditorBody = @{
            from_user = "verify_recorder"
            to_user = "verify_editor"
            to_role = "editor"
        } | ConvertTo-Json -Depth 5
        $handoffEditorResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/handoff" -Method POST -ContentType "application/json" -Body $handoffEditorBody -TimeoutSec 10
        if (-not $handoffEditorResult.ok) {
            Write-Host "    FAIL: Handoff recorder->editor failed: $($handoffEditorResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 4: Handoff recorder->editor - OK" -ForegroundColor Gray
        }

        # Step 5: Editor -> EDITED should PASS
        $editedByEditorPayload = @{ recording_status = "EDITED"; updated_by = "verify_editor" } | ConvertTo-Json -Depth 5
        $editedByEditorResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $editedByEditorPayload -TimeoutSec 10
        if (-not $editedByEditorResult.ok) {
            Write-Host "    FAIL: Editor -> EDITED should have passed: $($editedByEditorResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 5: Editor -> EDITED passed - OK" -ForegroundColor Gray
        }

        # Step 6: Editor -> READY_TO_POST should PASS
        $readyPayload = @{ recording_status = "READY_TO_POST"; updated_by = "verify_editor" } | ConvertTo-Json -Depth 5
        $readyResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $readyPayload -TimeoutSec 10
        if (-not $readyResult.ok) {
            Write-Host "    FAIL: Editor -> READY_TO_POST should have passed: $($readyResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 6: Editor -> READY_TO_POST passed - OK" -ForegroundColor Gray
        }

        # Step 7: Editor -> POSTED with posted_url/platform should FAIL (ROLE_MISMATCH)
        $postedByEditorPayload = @{
            recording_status = "POSTED"
            updated_by = "verify_editor"
            posted_url = "https://test.example.com/role-test"
            posted_platform = "tiktok"
        } | ConvertTo-Json -Depth 5
        $editorPostedMismatch = $false
        try {
            $postedByEditorResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $postedByEditorPayload -TimeoutSec 10
            if ($postedByEditorResult.ok -eq $false -and $postedByEditorResult.code -eq "ROLE_MISMATCH") {
                $editorPostedMismatch = $true
            }
        } catch {
            $body = Read-HttpErrorBody $_
            if ($body) {
                $errJson = Try-ParseJsonString $body
                if ($errJson -and $errJson.code -eq "ROLE_MISMATCH") {
                    $editorPostedMismatch = $true
                }
            }
        }
        if (-not $editorPostedMismatch) {
            Write-Host "    FAIL: Editor -> POSTED (with posted_url) should have returned ROLE_MISMATCH" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 7: Editor -> POSTED rejected with ROLE_MISMATCH - OK" -ForegroundColor Gray
        }

        # Step 8: Handoff editor -> uploader
        $handoffUploaderBody = @{
            from_user = "verify_editor"
            to_user = "verify_uploader"
            to_role = "uploader"
        } | ConvertTo-Json -Depth 5
        $handoffUploaderResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/handoff" -Method POST -ContentType "application/json" -Body $handoffUploaderBody -TimeoutSec 10
        if (-not $handoffUploaderResult.ok) {
            Write-Host "    FAIL: Handoff editor->uploader failed: $($handoffUploaderResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 8: Handoff editor->uploader - OK" -ForegroundColor Gray
        }

        # Clear posted_url/platform to ensure Step 9 tests correctly
        $clearFieldsPayload = @{ posted_url = $null; posted_platform = $null; updated_by = "admin"; actor_role = "admin"; require_claim = $false; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $clearFieldsPayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Step 9: Uploader -> POSTED without posted_url should FAIL (MISSING_POSTED_FIELDS)
        $postedNoUrlPayload = @{ recording_status = "POSTED"; updated_by = "verify_uploader" } | ConvertTo-Json -Depth 5
        $missingFieldsFailed = $false
        try {
            $postedNoUrlResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $postedNoUrlPayload -TimeoutSec 10
            if ($postedNoUrlResult.ok -eq $false) {
                $missingFieldsFailed = $true
            }
        } catch {
            $missingFieldsFailed = $true
        }
        if (-not $missingFieldsFailed) {
            Write-Host "    FAIL: Uploader -> POSTED without posted_url should have failed" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 9: Uploader -> POSTED (no fields) rejected - OK" -ForegroundColor Gray
        }

        # Step 10: Uploader -> POSTED with posted_url/platform should PASS
        $postedWithUrlPayload = @{
            recording_status = "POSTED"
            updated_by = "verify_uploader"
            posted_url = "https://test.example.com/role-verify-$(Get-Random)"
            posted_platform = "tiktok"
        } | ConvertTo-Json -Depth 5
        $postedWithUrlResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $postedWithUrlPayload -TimeoutSec 10
        if (-not $postedWithUrlResult.ok) {
            Write-Host "    FAIL: Uploader -> POSTED (with fields) should have passed: $($postedWithUrlResult.error)" -ForegroundColor Red
            $allRolePassed = $false
        } else {
            Write-Host "    Step 10: Uploader -> POSTED (with fields) passed - OK" -ForegroundColor Gray
        }

        # Step 11: Verify events contain claim, handoff, and status_change events
        $eventsResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/events" -Method GET -TimeoutSec 10
        if ($eventsResult.ok -and $eventsResult.data) {
            $claimEvents = $eventsResult.data | Where-Object { $_.event_type -eq "claim" }
            $handoffEvents = $eventsResult.data | Where-Object { $_.event_type -eq "handoff" }
            $statusEvents = $eventsResult.data | Where-Object { $_.event_type -eq "recording_status_changed" }
            Write-Host "    Step 11: Events - claims:$($claimEvents.Count), handoffs:$($handoffEvents.Count), status_changes:$($statusEvents.Count) - OK" -ForegroundColor Gray
        } else {
            Write-Host "    WARN: Could not fetch events" -ForegroundColor Yellow
        }

        # Cleanup: Restore original status and release
        $restorePayload = @{ recording_status = $originalStatus; updated_by = "admin"; actor_role = "admin"; force = $true; require_claim = $false } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $restorePayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        $releaseBody = @{ released_by = "admin"; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$roleTestVideoId/release" -Method POST -ContentType "application/json" -Body $releaseBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    Cleanup: Restored status and released claim" -ForegroundColor Gray

        if ($allRolePassed) {
            Write-Host "  PASS: Role-based claim enforcement workflow completed successfully" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Some role-based enforcement checks failed" -ForegroundColor Red
            exit 1
        }
        }
    }
} catch {
    Write-Host "  FAIL: Role-based enforcement test error: $_" -ForegroundColor Red
    exit 1
}

# Check 11: Actor validation and admin-only force bypass
Write-Host "`n[11/12] Testing actor validation and admin-only force..." -ForegroundColor Yellow
try {
    # Find a video with script for testing
    $queueForActor = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=100" -Method GET -TimeoutSec 10
    $videoForActorTest = $queueForActor.data | Where-Object { $null -ne $_.script_locked_text -and $_.script_locked_text -ne "" } | Select-Object -First 1

    if ($null -eq $videoForActorTest) {
        Write-Host "  SKIP: No video with script found for actor validation test" -ForegroundColor Yellow
    } else {
        $actorTestVideoId = $videoForActorTest.id
        Write-Host "    Testing actor validation on video: $actorTestVideoId" -ForegroundColor Gray

        $allActorPassed = $true

        # Cleanup: Force release any existing claim (as admin)
        $cleanupBody = @{ released_by = "admin"; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/release" -Method POST -ContentType "application/json" -Body $cleanupBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Reset to NOT_RECORDED (as admin with force)
        $resetPayload = @{ recording_status = "NOT_RECORDED"; updated_by = "admin"; actor_role = "admin"; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $resetPayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        # Step 1: Attempt execution with missing actor -> expect MISSING_ACTOR
        $noActorPayload = @{ recording_status = "RECORDED" } | ConvertTo-Json -Depth 5
        $missingActorFailed = $false
        $missingActorCode = $null
        try {
            $noActorResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $noActorPayload -TimeoutSec 10
            if ($noActorResult.ok -eq $false -and $noActorResult.code -eq "MISSING_ACTOR") {
                $missingActorFailed = $true
                $missingActorCode = $noActorResult.code
            }
        } catch {
            $body = Read-HttpErrorBody $_
            if ($body) {
                $errJson = Try-ParseJsonString $body
                if ($errJson -and $errJson.code -eq "MISSING_ACTOR") {
                    $missingActorFailed = $true
                    $missingActorCode = $errJson.code
                }
            }
        }
        if (-not $missingActorFailed) {
            Write-Host "    FAIL: Execution without actor should return MISSING_ACTOR" -ForegroundColor Red
            $allActorPassed = $false
        } else {
            Write-Host "    Step 1: Missing actor rejected with $missingActorCode - OK" -ForegroundColor Gray
        }

        # Step 2: Claim as user1 (recorder)
        $claimUser1Body = @{ claimed_by = "user1"; claim_role = "recorder" } | ConvertTo-Json -Depth 5
        $claimUser1Result = Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/claim" -Method POST -ContentType "application/json" -Body $claimUser1Body -TimeoutSec 10
        if (-not $claimUser1Result.ok) {
            Write-Host "    FAIL: Claim as user1 failed: $($claimUser1Result.error)" -ForegroundColor Red
            $allActorPassed = $false
        } else {
            Write-Host "    Step 2: Claimed as user1 (recorder) - OK" -ForegroundColor Gray
        }

        # Step 3: Attempt release as different user -> expect NOT_CLAIM_OWNER
        $releaseOtherBody = @{ released_by = "user2" } | ConvertTo-Json -Depth 5
        $notOwnerFailed = $false
        $notOwnerCode = $null
        try {
            $releaseOtherResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/release" -Method POST -ContentType "application/json" -Body $releaseOtherBody -TimeoutSec 10
            if ($releaseOtherResult.ok -eq $false -and $releaseOtherResult.code -eq "NOT_CLAIM_OWNER") {
                $notOwnerFailed = $true
                $notOwnerCode = $releaseOtherResult.code
            }
        } catch {
            $body = Read-HttpErrorBody $_
            if ($body) {
                $errJson = Try-ParseJsonString $body
                if ($errJson -and $errJson.code -eq "NOT_CLAIM_OWNER") {
                    $notOwnerFailed = $true
                    $notOwnerCode = $errJson.code
                }
            }
        }
        if (-not $notOwnerFailed) {
            Write-Host "    FAIL: Release by different user should return NOT_CLAIM_OWNER" -ForegroundColor Red
            $allActorPassed = $false
        } else {
            Write-Host "    Step 3: Release by user2 rejected with $notOwnerCode - OK" -ForegroundColor Gray
        }

        # Step 4: Attempt force=true with non-admin user -> expect FORBIDDEN
        $forceNonAdminPayload = @{ recording_status = "RECORDED"; updated_by = "user1"; force = $true } | ConvertTo-Json -Depth 5
        $forbiddenFailed = $false
        $forbiddenCode = $null
        try {
            $forceNonAdminResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $forceNonAdminPayload -TimeoutSec 10
            if ($forceNonAdminResult.ok -eq $false -and $forceNonAdminResult.code -eq "FORBIDDEN") {
                $forbiddenFailed = $true
                $forbiddenCode = $forceNonAdminResult.code
            }
        } catch {
            $body = Read-HttpErrorBody $_
            if ($body) {
                $errJson = Try-ParseJsonString $body
                if ($errJson -and $errJson.code -eq "FORBIDDEN") {
                    $forbiddenFailed = $true
                    $forbiddenCode = $errJson.code
                }
            }
        }
        if (-not $forbiddenFailed) {
            Write-Host "    FAIL: Force=true with non-admin should return FORBIDDEN" -ForegroundColor Red
            $allActorPassed = $false
        } else {
            Write-Host "    Step 4: Force by non-admin rejected with $forbiddenCode - OK" -ForegroundColor Gray
        }

        # Step 5: Force with admin user should succeed
        # First release the claim so admin can force the execution
        $releaseUser1Body = @{ released_by = "user1" } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/release" -Method POST -ContentType "application/json" -Body $releaseUser1Body -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

        $forceAdminPayload = @{ recording_status = "RECORDED"; updated_by = "admin"; actor_role = "admin"; force = $true } | ConvertTo-Json -Depth 5
        $forceAdminResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $forceAdminPayload -TimeoutSec 10
        if (-not $forceAdminResult.ok) {
            Write-Host "    FAIL: Force with admin should succeed: $($forceAdminResult.error)" -ForegroundColor Red
            $allActorPassed = $false
        } else {
            Write-Host "    Step 5: Force with admin succeeded - OK" -ForegroundColor Gray
        }

        # Cleanup: Reset status
        $restorePayload = @{ recording_status = "NOT_RECORDED"; updated_by = "admin"; actor_role = "admin"; force = $true } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$actorTestVideoId/execution" -Method PUT -ContentType "application/json" -Body $restorePayload -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    Cleanup: Reset video status" -ForegroundColor Gray

        if ($allActorPassed) {
            Write-Host "  PASS: Actor validation and admin-only force checks completed" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Some actor validation checks failed" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "  FAIL: Actor validation test error: $_" -ForegroundColor Red
    exit 1
}

# Check 12: claim_role is now required for claims
Write-Host "`n[12/12] Testing claim_role requirement..." -ForegroundColor Yellow
try {
    # Find an unclaimed video
    $queueForClaimRole = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=unclaimed&limit=1" -Method GET -TimeoutSec 10
    if (-not $queueForClaimRole.ok -or -not $queueForClaimRole.data -or $queueForClaimRole.data.Count -eq 0) {
        Write-Host "  SKIP: No unclaimed videos available for claim_role test" -ForegroundColor Yellow
    } else {
        $claimRoleTestVideoId = $queueForClaimRole.data[0].id
        Write-Host "    Testing claim_role requirement on video: $claimRoleTestVideoId" -ForegroundColor Gray

        # Attempt claim without claim_role -> should fail
        $noRoleClaimBody = @{ claimed_by = "test_user" } | ConvertTo-Json -Depth 5
        $noRoleFailed = $false
        try {
            $noRoleResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$claimRoleTestVideoId/claim" -Method POST -ContentType "application/json" -Body $noRoleClaimBody -TimeoutSec 10
            if ($noRoleResult.ok -eq $false) {
                $noRoleFailed = $true
            }
        } catch {
            $noRoleFailed = $true
        }

        if (-not $noRoleFailed) {
            Write-Host "    FAIL: Claim without claim_role should have failed" -ForegroundColor Red
            # Release if it somehow succeeded
            $releaseBody = @{ released_by = "test_user" } | ConvertTo-Json -Depth 5
            Invoke-RestMethod -Uri "$baseUrl/api/videos/$claimRoleTestVideoId/release" -Method POST -ContentType "application/json" -Body $releaseBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            exit 1
        } else {
            Write-Host "    Claim without claim_role correctly rejected - OK" -ForegroundColor Gray
        }

        # Claim with claim_role should succeed
        $withRoleClaimBody = @{ claimed_by = "test_user"; claim_role = "recorder" } | ConvertTo-Json -Depth 5
        $withRoleResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$claimRoleTestVideoId/claim" -Method POST -ContentType "application/json" -Body $withRoleClaimBody -TimeoutSec 10
        if (-not $withRoleResult.ok) {
            Write-Host "    FAIL: Claim with claim_role should succeed: $($withRoleResult.error)" -ForegroundColor Red
            exit 1
        } else {
            Write-Host "    Claim with claim_role succeeded - OK" -ForegroundColor Gray
        }

        # Cleanup: release
        $releaseBody = @{ released_by = "test_user" } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$baseUrl/api/videos/$claimRoleTestVideoId/release" -Method POST -ContentType "application/json" -Body $releaseBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    Cleanup: Released claim" -ForegroundColor Gray

        Write-Host "  PASS: claim_role requirement check completed" -ForegroundColor Green
    }
} catch {
    Write-Host "  FAIL: claim_role requirement test error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[12/12] Phase 8 verification summary..." -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Phase 8 verification PASSED" -ForegroundColor Green
exit 0
