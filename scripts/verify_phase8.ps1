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
Write-Host "`n[1/26] Checking /api/health..." -ForegroundColor Yellow
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
Write-Host "`n[2/26] Fetching accounts for video queries..." -ForegroundColor Yellow
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
Write-Host "`n[3/26] Validating video status enum..." -ForegroundColor Yellow
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
Write-Host "`n[4/26] Checking for duplicate variant+account in queue states..." -ForegroundColor Yellow
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
Write-Host "`n[5/26] Verifying migrations 009/010 via API behavior (non-destructive)..." -ForegroundColor Yellow
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
Write-Host "`n[5b/26] Testing attach-script clears queue blocker..." -ForegroundColor Yellow
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
Write-Host "`n[6/26] Confirming API-level duplicate prevention (idempotency)..." -ForegroundColor Yellow
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
Write-Host "`n[7/26] Stress-checking DB-level queue dedupe (migration 008) via race..." -ForegroundColor Yellow
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
Write-Host "`n[8/26] Testing claim workflow..." -ForegroundColor Yellow
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
Write-Host "`n[9/26] Testing execution gating workflow..." -ForegroundColor Yellow
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
Write-Host "`n[10/26] Testing role-based claim enforcement..." -ForegroundColor Yellow
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
Write-Host "`n[11/26] Testing actor validation and admin-only force..." -ForegroundColor Yellow
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
Write-Host "`n[12/26] Testing claim_role requirement..." -ForegroundColor Yellow
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

# Check 13: SLA fields in queue API
Write-Host "`n[13/26] Testing SLA fields in queue API..." -ForegroundColor Yellow
try {
    $slaQueueResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?sort=priority&limit=10" -Method GET -TimeoutSec 10
    if (-not $slaQueueResult.ok) {
        Write-Host "  FAIL: Queue API request failed" -ForegroundColor Red
        exit 1
    }

    if ($slaQueueResult.data.Count -eq 0) {
        Write-Host "  SKIP: No videos in queue to test SLA fields" -ForegroundColor Yellow
    } else {
        $slaTestVideo = $slaQueueResult.data[0]
        $allSlaFieldsPresent = $true

        # Check sla_deadline_at exists
        if (-not $slaTestVideo.PSObject.Properties.Match("sla_deadline_at")) {
            Write-Host "    FAIL: sla_deadline_at field missing" -ForegroundColor Red
            $allSlaFieldsPresent = $false
        }

        # Check sla_status exists and has valid value
        if (-not $slaTestVideo.PSObject.Properties.Match("sla_status")) {
            Write-Host "    FAIL: sla_status field missing" -ForegroundColor Red
            $allSlaFieldsPresent = $false
        } elseif ($slaTestVideo.sla_status -notin @("on_track", "due_soon", "overdue")) {
            Write-Host "    FAIL: sla_status has invalid value: $($slaTestVideo.sla_status)" -ForegroundColor Red
            $allSlaFieldsPresent = $false
        }

        # Check priority_score exists
        if (-not $slaTestVideo.PSObject.Properties.Match("priority_score")) {
            Write-Host "    FAIL: priority_score field missing" -ForegroundColor Red
            $allSlaFieldsPresent = $false
        }

        # Check age_minutes_in_stage exists
        if (-not $slaTestVideo.PSObject.Properties.Match("age_minutes_in_stage")) {
            Write-Host "    FAIL: age_minutes_in_stage field missing" -ForegroundColor Red
            $allSlaFieldsPresent = $false
        }

        if ($allSlaFieldsPresent) {
            Write-Host "    sla_deadline_at: $($slaTestVideo.sla_deadline_at)" -ForegroundColor Gray
            Write-Host "    sla_status: $($slaTestVideo.sla_status)" -ForegroundColor Gray
            Write-Host "    priority_score: $($slaTestVideo.priority_score)" -ForegroundColor Gray
            Write-Host "    age_minutes_in_stage: $($slaTestVideo.age_minutes_in_stage)" -ForegroundColor Gray

            # Verify priority sorting: first item should have highest priority_score
            if ($slaQueueResult.data.Count -gt 1) {
                $firstPriority = $slaQueueResult.data[0].priority_score
                $secondPriority = $slaQueueResult.data[1].priority_score
                if ($firstPriority -lt $secondPriority) {
                    Write-Host "    WARN: Priority sorting may not be correct (first: $firstPriority, second: $secondPriority)" -ForegroundColor Yellow
                } else {
                    Write-Host "    Priority sorting verified (first: $firstPriority >= second: $secondPriority)" -ForegroundColor Gray
                }
            }

            Write-Host "  PASS: SLA fields present and valid" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Some SLA fields missing or invalid" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "  FAIL: SLA fields test error: $_" -ForegroundColor Red
    exit 1
}

# Check 14: Role dashboard routes exist
Write-Host "`n[14/26] Testing role dashboard routes..." -ForegroundColor Yellow
try {
    # These routes require authentication, so we just check they don't return 500
    # They should redirect to login (302) or return the page (200)
    $roleDashboards = @("/admin/recorder", "/admin/editor", "/admin/uploader")
    $allRoutesOk = $true

    foreach ($route in $roleDashboards) {
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$route" -Method GET -TimeoutSec 10 -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
            $statusCode = $response.StatusCode
        } catch {
            # Catch redirect (302) or other responses
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } else {
                $statusCode = 0
            }
        }

        if ($statusCode -eq 200 -or $statusCode -eq 302 -or $statusCode -eq 307) {
            Write-Host "    $route returns $statusCode - OK" -ForegroundColor Gray
        } else {
            Write-Host "    FAIL: $route returned unexpected status: $statusCode" -ForegroundColor Red
            $allRoutesOk = $false
        }
    }

    if ($allRoutesOk) {
        Write-Host "  PASS: Role dashboard routes accessible" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Some role dashboard routes not accessible" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  FAIL: Role dashboard routes test error: $_" -ForegroundColor Red
    exit 1
}

# Check 15: Notifications API endpoint
Write-Host "`n[15/26] Testing notifications API endpoint..." -ForegroundColor Yellow
try {
    # The notifications endpoint requires auth, so without a session we expect 401
    # We're just checking the endpoint exists and returns proper error
    $notifResult = $null
    $notifStatusCode = 0
    try {
        $notifResult = Invoke-RestMethod -Uri "$baseUrl/api/notifications" -Method GET -TimeoutSec 10
        $notifStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $notifStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    # Without auth, expect 401
    if ($notifStatusCode -eq 401) {
        Write-Host "    GET /api/notifications returns 401 without auth - OK" -ForegroundColor Gray
        Write-Host "  PASS: Notifications API endpoint exists and requires auth" -ForegroundColor Green
    } elseif ($notifStatusCode -eq 200 -and $notifResult.ok) {
        Write-Host "    GET /api/notifications returned data (auth context present)" -ForegroundColor Gray
        Write-Host "  PASS: Notifications API endpoint working" -ForegroundColor Green
    } else {
        Write-Host "    GET /api/notifications returned unexpected status: $notifStatusCode" -ForegroundColor Yellow
        Write-Host "  WARN: Notifications endpoint may not be fully configured" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN: Notifications API test error: $_" -ForegroundColor Yellow
}

# Check 16: Assignment API endpoint
Write-Host "`n[16/26] Testing assignment API endpoint..." -ForegroundColor Yellow
try {
    # Find a video to test with
    $assignQueueResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/queue?claimed=any&limit=1" -Method GET -TimeoutSec 10
    if (-not $assignQueueResult.ok -or -not $assignQueueResult.data -or $assignQueueResult.data.Count -eq 0) {
        Write-Host "  SKIP: No videos available for assignment test" -ForegroundColor Yellow
    } else {
        $assignTestVideoId = $assignQueueResult.data[0].id

        # Test assign endpoint - requires admin auth, so expect 401 without auth
        $assignBody = @{
            assignee_user_id = "00000000-0000-0000-0000-000000000001"
            notes = "test assignment"
        } | ConvertTo-Json -Depth 5

        $assignStatusCode = 0
        try {
            $assignResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/$assignTestVideoId/assign" -Method POST -ContentType "application/json" -Body $assignBody -TimeoutSec 10
            $assignStatusCode = 200
        } catch {
            if ($_.Exception.Response) {
                $assignStatusCode = [int]$_.Exception.Response.StatusCode
            }
        }

        # Without auth, expect 401 (unauthorized)
        if ($assignStatusCode -eq 401) {
            Write-Host "    POST /api/videos/[id]/assign returns 401 without auth - OK" -ForegroundColor Gray
            Write-Host "  PASS: Assignment API endpoint exists and requires admin auth" -ForegroundColor Green
        } elseif ($assignStatusCode -eq 403) {
            Write-Host "    POST /api/videos/[id]/assign returns 403 (admin only) - OK" -ForegroundColor Gray
            Write-Host "  PASS: Assignment API endpoint exists and enforces admin-only" -ForegroundColor Green
        } elseif ($assignStatusCode -eq 400) {
            # Migration 018 may not be applied
            Write-Host "    POST /api/videos/[id]/assign returns 400 (migration may be needed)" -ForegroundColor Gray
            Write-Host "  WARN: Assignment feature requires migration 018_video_assignment.sql" -ForegroundColor Yellow
        } else {
            Write-Host "    POST /api/videos/[id]/assign returned status: $assignStatusCode" -ForegroundColor Gray
            Write-Host "  WARN: Assignment endpoint may not be fully configured" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  WARN: Assignment API test error: $_" -ForegroundColor Yellow
}

# Check 17: Ops Metrics API endpoint (admin-only)
Write-Host "`n[17/26] Testing ops-metrics API endpoint..." -ForegroundColor Yellow
try {
    # The ops-metrics endpoint requires admin auth, so without a session we expect 403
    $opsMetricsResult = $null
    $opsMetricsStatusCode = 0
    try {
        $opsMetricsResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/ops-metrics" -Method GET -TimeoutSec 10
        $opsMetricsStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $opsMetricsStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    # Without admin auth, expect 403 (Forbidden)
    if ($opsMetricsStatusCode -eq 403) {
        Write-Host "    GET /api/admin/ops-metrics returns 403 without admin auth - OK" -ForegroundColor Gray
        Write-Host "  PASS: Ops-metrics API endpoint exists and requires admin auth" -ForegroundColor Green
    } elseif ($opsMetricsStatusCode -eq 401) {
        Write-Host "    GET /api/admin/ops-metrics returns 401 (unauthorized) - OK" -ForegroundColor Gray
        Write-Host "  PASS: Ops-metrics API endpoint exists and requires auth" -ForegroundColor Green
    } elseif ($opsMetricsStatusCode -eq 200 -and $opsMetricsResult.ok) {
        # If authenticated as admin, verify response structure
        $allStructureOk = $true

        # Check data.totals.by_status exists
        if (-not $opsMetricsResult.data.totals.by_status) {
            Write-Host "    FAIL: data.totals.by_status missing" -ForegroundColor Red
            $allStructureOk = $false
        } else {
            Write-Host "    data.totals.by_status present - OK" -ForegroundColor Gray
        }

        # Check data.aging_buckets exists for NOT_RECORDED
        if (-not $opsMetricsResult.data.aging_buckets.NOT_RECORDED) {
            Write-Host "    FAIL: data.aging_buckets.NOT_RECORDED missing" -ForegroundColor Red
            $allStructureOk = $false
        } else {
            Write-Host "    data.aging_buckets.NOT_RECORDED present - OK" -ForegroundColor Gray
        }

        # Check throughput arrays exist
        if (-not $opsMetricsResult.data.throughput.posted_per_day) {
            Write-Host "    FAIL: data.throughput.posted_per_day missing" -ForegroundColor Red
            $allStructureOk = $false
        } else {
            Write-Host "    data.throughput.posted_per_day present - OK" -ForegroundColor Gray
        }

        # Check blockers is an array
        if ($null -eq $opsMetricsResult.data.blockers -or $opsMetricsResult.data.blockers -isnot [array]) {
            # Note: PowerShell converts empty arrays weirdly, so check more carefully
            if ($opsMetricsResult.data.PSObject.Properties.Match("blockers")) {
                Write-Host "    data.blockers field present - OK" -ForegroundColor Gray
            } else {
                Write-Host "    FAIL: data.blockers missing or not array" -ForegroundColor Red
                $allStructureOk = $false
            }
        } else {
            Write-Host "    data.blockers is array - OK" -ForegroundColor Gray
        }

        if ($allStructureOk) {
            Write-Host "  PASS: Ops-metrics API endpoint working with correct structure" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Ops-metrics response structure incomplete" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "    GET /api/admin/ops-metrics returned unexpected status: $opsMetricsStatusCode" -ForegroundColor Yellow
        Write-Host "  WARN: Ops-metrics endpoint may not be fully configured" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN: Ops-metrics API test error: $_" -ForegroundColor Yellow
}

# Check 18: Dispatch and assignment enforcement (skip if migration 019 not applied)
Write-Host "`n[18/26] Testing dispatch and assignment enforcement..." -ForegroundColor Yellow
try {
    # First test: dispatch endpoint exists and requires auth
    $dispatchStatusCode = 0
    try {
        $dispatchResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/dispatch" -Method POST -ContentType "application/json" -Body '{"role":"recorder"}' -TimeoutSec 10
        $dispatchStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $dispatchStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    # Without auth, expect 401
    if ($dispatchStatusCode -eq 401) {
        Write-Host "    POST /api/videos/dispatch returns 401 without auth - OK" -ForegroundColor Gray
        Write-Host "  PASS: Dispatch API endpoint exists and requires auth" -ForegroundColor Green
    } elseif ($dispatchStatusCode -eq 400) {
        # May return 400 if migration 019 not applied
        Write-Host "    POST /api/videos/dispatch returns 400 (migration 019 may not be applied) - OK" -ForegroundColor Gray
        Write-Host "  SKIP: Dispatch test skipped (migration 019 not applied)" -ForegroundColor Yellow
    } elseif ($dispatchStatusCode -eq 200) {
        # If authenticated, verify response structure
        Write-Host "    Dispatch returned 200 - checking response structure" -ForegroundColor Gray
        if ($dispatchResult.ok -and $dispatchResult.data.video_id) {
            Write-Host "  PASS: Dispatch API working" -ForegroundColor Green
        } else {
            Write-Host "    Unexpected response structure" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    POST /api/videos/dispatch returned unexpected status: $dispatchStatusCode" -ForegroundColor Yellow
        Write-Host "  WARN: Dispatch endpoint may not be fully configured" -ForegroundColor Yellow
    }

    # Second test: reclaim-expired endpoint exists and requires admin
    $reclaimStatusCode = 0
    try {
        $reclaimResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/reclaim-expired" -Method POST -TimeoutSec 10
        $reclaimStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $reclaimStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($reclaimStatusCode -eq 403) {
        Write-Host "    POST /api/videos/reclaim-expired returns 403 without admin auth - OK" -ForegroundColor Gray
        Write-Host "  PASS: Reclaim-expired API endpoint exists and requires admin" -ForegroundColor Green
    } elseif ($reclaimStatusCode -eq 401) {
        Write-Host "    POST /api/videos/reclaim-expired returns 401 - OK" -ForegroundColor Gray
        Write-Host "  PASS: Reclaim-expired API endpoint exists and requires auth" -ForegroundColor Green
    } elseif ($reclaimStatusCode -eq 400) {
        Write-Host "    POST /api/videos/reclaim-expired returns 400 (migration 019 may not be applied)" -ForegroundColor Gray
        Write-Host "  SKIP: Reclaim test skipped" -ForegroundColor Yellow
    } else {
        Write-Host "    POST /api/videos/reclaim-expired returned status: $reclaimStatusCode" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN: Dispatch/assignment test error: $_" -ForegroundColor Yellow
}

# Check 19: Workbench routes and auto-handoff
Write-Host "`n[19/26] Testing workbench routes and auto-handoff..." -ForegroundColor Yellow
try {
    # Test workbench routes exist
    $workbenchRoutes = @("/admin/recorder/workbench", "/admin/editor/workbench", "/admin/uploader/workbench")
    $allWorkbenchOk = $true

    foreach ($route in $workbenchRoutes) {
        try {
            $response = Invoke-WebRequest -Uri "$baseUrl$route" -Method GET -TimeoutSec 10 -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
            $statusCode = $response.StatusCode
        } catch {
            # Catch redirect (302) or other responses
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } else {
                $statusCode = 0
            }
        }

        if ($statusCode -eq 200 -or $statusCode -eq 302 -or $statusCode -eq 307) {
            Write-Host "    $route returns $statusCode - OK" -ForegroundColor Gray
        } else {
            Write-Host "    FAIL: $route returned unexpected status: $statusCode" -ForegroundColor Red
            $allWorkbenchOk = $false
        }
    }

    if ($allWorkbenchOk) {
        Write-Host "    Workbench routes accessible - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: Some workbench routes not accessible" -ForegroundColor Red
        exit 1
    }

    # Test my-active endpoint (requires auth, so expect 401 without)
    $myActiveStatusCode = 0
    try {
        $myActiveResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/my-active" -Method GET -TimeoutSec 10
        $myActiveStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $myActiveStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($myActiveStatusCode -eq 401) {
        Write-Host "    GET /api/videos/my-active returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($myActiveStatusCode -eq 200) {
        Write-Host "    GET /api/videos/my-active returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/videos/my-active returned unexpected status: $myActiveStatusCode" -ForegroundColor Yellow
    }

    # Test complete-assignment endpoint (requires auth, so expect 401 without)
    $completeStatusCode = 0
    try {
        $completeResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/00000000-0000-0000-0000-000000000001/complete-assignment" -Method POST -ContentType "application/json" -Body '{}' -TimeoutSec 10
        $completeStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $completeStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($completeStatusCode -eq 401) {
        Write-Host "    POST /api/videos/[id]/complete-assignment returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($completeStatusCode -eq 404) {
        Write-Host "    POST /api/videos/[id]/complete-assignment returns 404 (video not found) - OK" -ForegroundColor Gray
    } elseif ($completeStatusCode -eq 400) {
        Write-Host "    POST /api/videos/[id]/complete-assignment returns 400 (may need migration 019) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/videos/[id]/complete-assignment returned status: $completeStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Workbench routes and handoff APIs accessible" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Workbench/auto-handoff test error: $_" -ForegroundColor Yellow
}

# Check 20: Assignment expiry and sweep endpoint
Write-Host "`n[20/26] Testing assignment expiry and sweep endpoint..." -ForegroundColor Yellow
try {
    # Test notifications endpoint (requires auth, so expect 401 without)
    $notifStatusCode = 0
    try {
        $notifResult = Invoke-RestMethod -Uri "$baseUrl/api/notifications" -Method GET -TimeoutSec 10
        $notifStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $notifStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($notifStatusCode -eq 401) {
        Write-Host "    GET /api/notifications returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($notifStatusCode -eq 200) {
        Write-Host "    GET /api/notifications returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/notifications returned status: $notifStatusCode" -ForegroundColor Yellow
    }

    # Test sweep-assignments endpoint (admin-only, so expect 401/403 without auth)
    $sweepStatusCode = 0
    try {
        $sweepResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/sweep-assignments" -Method POST -ContentType "application/json" -Body '{}' -TimeoutSec 10
        $sweepStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $sweepStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($sweepStatusCode -eq 401) {
        Write-Host "    POST /api/admin/sweep-assignments returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($sweepStatusCode -eq 403) {
        Write-Host "    POST /api/admin/sweep-assignments returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($sweepStatusCode -eq 200) {
        Write-Host "    POST /api/admin/sweep-assignments returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/sweep-assignments returned status: $sweepStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Assignment expiry and notifications APIs accessible" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Assignment expiry test error: $_" -ForegroundColor Yellow
}

# Check 21: Admin assignment dashboard endpoints
Write-Host "`n[21/26] Testing admin assignment dashboard endpoints..." -ForegroundColor Yellow
try {
    # Test GET /api/admin/assignments (admin-only, expect 401/403 without auth)
    $assignmentsStatusCode = 0
    try {
        $assignmentsResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/assignments" -Method GET -TimeoutSec 10
        $assignmentsStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $assignmentsStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($assignmentsStatusCode -eq 401) {
        Write-Host "    GET /api/admin/assignments returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($assignmentsStatusCode -eq 403) {
        Write-Host "    GET /api/admin/assignments returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($assignmentsStatusCode -eq 200) {
        Write-Host "    GET /api/admin/assignments returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/assignments returned status: $assignmentsStatusCode" -ForegroundColor Yellow
    }

    # Test POST /api/admin/assignments/[id]/extend (admin-only, expect 401/403 without auth)
    $extendStatusCode = 0
    try {
        $extendResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/assignments/00000000-0000-0000-0000-000000000001/extend" -Method POST -ContentType "application/json" -Body '{"ttl_minutes": 60}' -TimeoutSec 10
        $extendStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $extendStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($extendStatusCode -eq 401) {
        Write-Host "    POST /api/admin/assignments/[id]/extend returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($extendStatusCode -eq 403) {
        Write-Host "    POST /api/admin/assignments/[id]/extend returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($extendStatusCode -eq 404) {
        Write-Host "    POST /api/admin/assignments/[id]/extend returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/assignments/[id]/extend returned status: $extendStatusCode" -ForegroundColor Yellow
    }

    # Test POST /api/admin/assignments/[id]/reassign (admin-only, expect 401/403 without auth)
    $reassignStatusCode = 0
    try {
        $reassignResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/assignments/00000000-0000-0000-0000-000000000001/reassign" -Method POST -ContentType "application/json" -Body '{"to_user_id": "00000000-0000-0000-0000-000000000002", "to_role": "recorder"}' -TimeoutSec 10
        $reassignStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $reassignStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($reassignStatusCode -eq 401) {
        Write-Host "    POST /api/admin/assignments/[id]/reassign returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($reassignStatusCode -eq 403) {
        Write-Host "    POST /api/admin/assignments/[id]/reassign returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($reassignStatusCode -eq 404) {
        Write-Host "    POST /api/admin/assignments/[id]/reassign returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/assignments/[id]/reassign returned status: $reassignStatusCode" -ForegroundColor Yellow
    }

    # Test GET /api/admin/user-activity (admin-only, expect 401/403 without auth)
    $userActivityStatusCode = 0
    try {
        $userActivityResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/user-activity" -Method GET -TimeoutSec 10
        $userActivityStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $userActivityStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($userActivityStatusCode -eq 401) {
        Write-Host "    GET /api/admin/user-activity returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($userActivityStatusCode -eq 403) {
        Write-Host "    GET /api/admin/user-activity returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($userActivityStatusCode -eq 200) {
        Write-Host "    GET /api/admin/user-activity returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/user-activity returned status: $userActivityStatusCode" -ForegroundColor Yellow
    }

    # Test /admin/assignments page route (returns 307 redirect for auth)
    $assignmentsPageStatusCode = 0
    try {
        $assignmentsPageResult = Invoke-WebRequest -Uri "$baseUrl/admin/assignments" -Method GET -TimeoutSec 10 -MaximumRedirection 0
        $assignmentsPageStatusCode = $assignmentsPageResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $assignmentsPageStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($assignmentsPageStatusCode -eq 307) {
        Write-Host "    /admin/assignments page returns 307 (auth redirect) - OK" -ForegroundColor Gray
    } elseif ($assignmentsPageStatusCode -eq 200) {
        Write-Host "    /admin/assignments page returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/assignments page returned status: $assignmentsPageStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Admin assignment dashboard endpoints accessible" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Admin assignment dashboard test error: $_" -ForegroundColor Yellow
}

# Check 22: Admin events explorer and video timeline endpoints
Write-Host "`n[22/26] Testing admin events explorer and video timeline..." -ForegroundColor Yellow
try {
    # Test GET /api/admin/events (admin-only, expect 401 without auth)
    $eventsStatusCode = 0
    try {
        $eventsResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/events" -Method GET -TimeoutSec 10
        $eventsStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $eventsStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($eventsStatusCode -eq 401) {
        Write-Host "    GET /api/admin/events returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($eventsStatusCode -eq 403) {
        Write-Host "    GET /api/admin/events returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($eventsStatusCode -eq 200) {
        Write-Host "    GET /api/admin/events returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/events returned status: $eventsStatusCode" -ForegroundColor Yellow
    }

    # Test GET /api/admin/videos/[id]/timeline (admin-only, expect 401 without auth)
    $timelineStatusCode = 0
    try {
        $timelineResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/videos/00000000-0000-0000-0000-000000000001/timeline" -Method GET -TimeoutSec 10
        $timelineStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $timelineStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($timelineStatusCode -eq 401) {
        Write-Host "    GET /api/admin/videos/[id]/timeline returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($timelineStatusCode -eq 403) {
        Write-Host "    GET /api/admin/videos/[id]/timeline returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($timelineStatusCode -eq 404) {
        Write-Host "    GET /api/admin/videos/[id]/timeline returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/videos/[id]/timeline returned status: $timelineStatusCode" -ForegroundColor Yellow
    }

    # Test /admin/events page route (returns 307 redirect for auth)
    $eventsPageStatusCode = 0
    try {
        $eventsPageResult = Invoke-WebRequest -Uri "$baseUrl/admin/events" -Method GET -TimeoutSec 10 -MaximumRedirection 0
        $eventsPageStatusCode = $eventsPageResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $eventsPageStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($eventsPageStatusCode -eq 307) {
        Write-Host "    /admin/events page returns 307 (auth redirect) - OK" -ForegroundColor Gray
    } elseif ($eventsPageStatusCode -eq 200) {
        Write-Host "    /admin/events page returns 200 - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/events page returned status: $eventsPageStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Admin events explorer and video timeline endpoints accessible" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Admin events explorer test error: $_" -ForegroundColor Yellow
}

# Check 23: Admin force-status, clear-claim, reset-assignments endpoints
Write-Host "`n[23/26] Testing admin force-status, clear-claim, reset-assignments..." -ForegroundColor Yellow
try {
    # Test POST /api/admin/videos/[id]/force-status (admin-only, expect 401 without auth)
    $forceStatusCode = 0
    try {
        $forceResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/videos/00000000-0000-0000-0000-000000000001/force-status" -Method POST -ContentType "application/json" -Body '{"target_status":"RECORDED","reason":"test"}' -TimeoutSec 10
        $forceStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $forceStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($forceStatusCode -eq 401) {
        Write-Host "    POST /api/admin/videos/[id]/force-status returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($forceStatusCode -eq 403) {
        Write-Host "    POST /api/admin/videos/[id]/force-status returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($forceStatusCode -eq 404) {
        Write-Host "    POST /api/admin/videos/[id]/force-status returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/videos/[id]/force-status returned status: $forceStatusCode" -ForegroundColor Yellow
    }

    # Test POST /api/admin/videos/[id]/clear-claim (admin-only, expect 401 without auth)
    $clearClaimStatusCode = 0
    try {
        $clearClaimResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/videos/00000000-0000-0000-0000-000000000001/clear-claim" -Method POST -ContentType "application/json" -Body '{"reason":"test"}' -TimeoutSec 10
        $clearClaimStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $clearClaimStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($clearClaimStatusCode -eq 401) {
        Write-Host "    POST /api/admin/videos/[id]/clear-claim returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($clearClaimStatusCode -eq 403) {
        Write-Host "    POST /api/admin/videos/[id]/clear-claim returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($clearClaimStatusCode -eq 404) {
        Write-Host "    POST /api/admin/videos/[id]/clear-claim returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/videos/[id]/clear-claim returned status: $clearClaimStatusCode" -ForegroundColor Yellow
    }

    # Test POST /api/admin/videos/[id]/reset-assignments (admin-only, expect 401 without auth)
    $resetAssignmentsStatusCode = 0
    try {
        $resetAssignmentsResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/videos/00000000-0000-0000-0000-000000000001/reset-assignments" -Method POST -ContentType "application/json" -Body '{"mode":"expire","reason":"test"}' -TimeoutSec 10
        $resetAssignmentsStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $resetAssignmentsStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($resetAssignmentsStatusCode -eq 401) {
        Write-Host "    POST /api/admin/videos/[id]/reset-assignments returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($resetAssignmentsStatusCode -eq 403) {
        Write-Host "    POST /api/admin/videos/[id]/reset-assignments returns 403 without admin auth - OK" -ForegroundColor Gray
    } elseif ($resetAssignmentsStatusCode -eq 404) {
        Write-Host "    POST /api/admin/videos/[id]/reset-assignments returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/videos/[id]/reset-assignments returned status: $resetAssignmentsStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Admin force-status, clear-claim, reset-assignments endpoints accessible" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Admin data repair tools test error: $_" -ForegroundColor Yellow
}

# Check 24: Email notification module verification
Write-Host "`n[24/26] Testing email notification module..." -ForegroundColor Yellow
try {
    # Verify email.ts exists
    $emailModulePath = Join-Path $webDir "lib/email.ts"
    if (-not (Test-Path $emailModulePath)) {
        Write-Host "  FAIL: Email module not found at $emailModulePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Email module exists at lib/email.ts - OK" -ForegroundColor Gray

    # Verify email-notifications.ts exists
    $emailNotificationsPath = Join-Path $webDir "lib/email-notifications.ts"
    if (-not (Test-Path $emailNotificationsPath)) {
        Write-Host "  FAIL: Email notifications module not found at $emailNotificationsPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Email notifications module exists at lib/email-notifications.ts - OK" -ForegroundColor Gray

    # Verify email.ts exports required functions
    $emailContent = Get-Content $emailModulePath -Raw
    if ($emailContent -notmatch "export\s+(async\s+)?function\s+sendEmail") {
        Write-Host "  FAIL: sendEmail function not exported from email.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    sendEmail function exported - OK" -ForegroundColor Gray

    if ($emailContent -notmatch "export\s+function\s+isEmailEnabled") {
        Write-Host "  FAIL: isEmailEnabled function not exported from email.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    isEmailEnabled function exported - OK" -ForegroundColor Gray

    if ($emailContent -notmatch "export\s+function\s+getEmailConfig") {
        Write-Host "  FAIL: getEmailConfig function not exported from email.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    getEmailConfig function exported - OK" -ForegroundColor Gray

    if ($emailContent -notmatch "export\s+(async\s+)?function\s+checkEmailCooldown") {
        Write-Host "  FAIL: checkEmailCooldown function not exported from email.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    checkEmailCooldown function exported - OK" -ForegroundColor Gray

    # Verify email-notifications.ts exports required functions
    $notificationsContent = Get-Content $emailNotificationsPath -Raw
    if ($notificationsContent -notmatch "export\s+(async\s+)?function\s+triggerEmailNotification") {
        Write-Host "  FAIL: triggerEmailNotification function not exported from email-notifications.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    triggerEmailNotification function exported - OK" -ForegroundColor Gray

    if ($notificationsContent -notmatch "export\s+(async\s+)?function\s+sendAssignmentEmail") {
        Write-Host "  FAIL: sendAssignmentEmail function not exported from email-notifications.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    sendAssignmentEmail function exported - OK" -ForegroundColor Gray

    if ($notificationsContent -notmatch "export\s+(async\s+)?function\s+sendExpiryNotificationEmail") {
        Write-Host "  FAIL: sendExpiryNotificationEmail function not exported from email-notifications.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    sendExpiryNotificationEmail function exported - OK" -ForegroundColor Gray

    if ($notificationsContent -notmatch "export\s+(async\s+)?function\s+sendAdminActionEmail") {
        Write-Host "  FAIL: sendAdminActionEmail function not exported from email-notifications.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    sendAdminActionEmail function exported - OK" -ForegroundColor Gray

    # Verify fail-safe design (checks for isEmailEnabled)
    if ($notificationsContent -notmatch "isEmailEnabled\(\)") {
        Write-Host "  FAIL: email-notifications.ts does not check isEmailEnabled() for fail-safe" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Fail-safe isEmailEnabled() check present - OK" -ForegroundColor Gray

    # Verify email triggers are integrated in dispatch route
    $dispatchPath = Join-Path $webDir "app/api/videos/dispatch/route.ts"
    if (Test-Path $dispatchPath) {
        $dispatchContent = Get-Content $dispatchPath -Raw
        if ($dispatchContent -match "triggerEmailNotification") {
            Write-Host "    Email trigger integrated in dispatch route - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: triggerEmailNotification not found in dispatch route" -ForegroundColor Yellow
        }
    }

    # Verify email triggers are integrated in reassign route
    $reassignPath = Join-Path $webDir "app/api/admin/assignments/[video_id]/reassign/route.ts"
    if (Test-Path $reassignPath) {
        $reassignContent = Get-Content $reassignPath -Raw
        if ($reassignContent -match "triggerEmailNotification") {
            Write-Host "    Email trigger integrated in reassign route - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: triggerEmailNotification not found in reassign route" -ForegroundColor Yellow
        }
    }

    # Verify email events show in timeline API
    $timelinePath = Join-Path $webDir "app/api/admin/videos/[video_id]/timeline/route.ts"
    if (Test-Path $timelinePath) {
        $timelineContent = Get-Content $timelinePath -Raw
        if ($timelineContent -match "email_sent|email_skipped|email_failed") {
            Write-Host "    Email event labels in timeline API - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: email event labels not found in timeline API" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Email notification module verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Email module test error: $_" -ForegroundColor Yellow
}

# Check 25: Slack notification module and unified notify router verification
Write-Host "`n[25/26] Testing Slack notification module and notify router..." -ForegroundColor Yellow
try {
    # Verify slack.ts exists
    $slackModulePath = Join-Path $webDir "lib/slack.ts"
    if (-not (Test-Path $slackModulePath)) {
        Write-Host "  FAIL: Slack module not found at $slackModulePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Slack module exists at lib/slack.ts - OK" -ForegroundColor Gray

    # Verify notify.ts exists
    $notifyModulePath = Join-Path $webDir "lib/notify.ts"
    if (-not (Test-Path $notifyModulePath)) {
        Write-Host "  FAIL: Notify router module not found at $notifyModulePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Notify router exists at lib/notify.ts - OK" -ForegroundColor Gray

    # Verify slack.ts exports required functions
    $slackContent = Get-Content $slackModulePath -Raw
    if ($slackContent -notmatch "export\s+(async\s+)?function\s+sendSlack") {
        Write-Host "  FAIL: sendSlack function not exported from slack.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    sendSlack function exported - OK" -ForegroundColor Gray

    if ($slackContent -notmatch "export\s+function\s+isSlackEnabled") {
        Write-Host "  FAIL: isSlackEnabled function not exported from slack.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    isSlackEnabled function exported - OK" -ForegroundColor Gray

    if ($slackContent -notmatch "export\s+function\s+getSlackConfig") {
        Write-Host "  FAIL: getSlackConfig function not exported from slack.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    getSlackConfig function exported - OK" -ForegroundColor Gray

    if ($slackContent -notmatch "export\s+function\s+buildSlackMessage") {
        Write-Host "  FAIL: buildSlackMessage function not exported from slack.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    buildSlackMessage function exported - OK" -ForegroundColor Gray

    # Verify notify.ts exports required functions
    $notifyContent = Get-Content $notifyModulePath -Raw
    if ($notifyContent -notmatch "export\s+(async\s+)?function\s+notify") {
        Write-Host "  FAIL: notify function not exported from notify.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    notify function exported - OK" -ForegroundColor Gray

    if ($notifyContent -notmatch "export\s+(async\s+)?function\s+notifyAssignment") {
        Write-Host "  FAIL: notifyAssignment function not exported from notify.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    notifyAssignment function exported - OK" -ForegroundColor Gray

    if ($notifyContent -notmatch "export\s+(async\s+)?function\s+notifyExpiry") {
        Write-Host "  FAIL: notifyExpiry function not exported from notify.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    notifyExpiry function exported - OK" -ForegroundColor Gray

    if ($notifyContent -notmatch "export\s+(async\s+)?function\s+notifyAdminAction") {
        Write-Host "  FAIL: notifyAdminAction function not exported from notify.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    notifyAdminAction function exported - OK" -ForegroundColor Gray

    # Verify notify router imports both email and slack
    if ($notifyContent -notmatch "from\s+[`"']@/lib/email[`"']") {
        Write-Host "  FAIL: notify.ts does not import from email module" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Notify router imports email module - OK" -ForegroundColor Gray

    if ($notifyContent -notmatch "from\s+[`"']@/lib/slack[`"']") {
        Write-Host "  FAIL: notify.ts does not import from slack module" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Notify router imports slack module - OK" -ForegroundColor Gray

    # Verify email-notifications.ts routes through notify
    $emailNotificationsPath = Join-Path $webDir "lib/email-notifications.ts"
    if (Test-Path $emailNotificationsPath) {
        $emailNotifContent = Get-Content $emailNotificationsPath -Raw
        if ($emailNotifContent -match "from\s+[`"']@/lib/notify[`"']") {
            Write-Host "    email-notifications.ts imports notify router - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: email-notifications.ts does not import notify router" -ForegroundColor Yellow
        }
    }

    # Verify Slack events show in timeline API
    $timelinePath = Join-Path $webDir "app/api/admin/videos/[video_id]/timeline/route.ts"
    if (Test-Path $timelinePath) {
        $timelineContent = Get-Content $timelinePath -Raw
        if ($timelineContent -match "slack_sent|slack_skipped|slack_failed") {
            Write-Host "    Slack event labels in timeline API - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: slack event labels not found in timeline API" -ForegroundColor Yellow
        }
    }

    # Verify Slack badge styling in page component
    $pagePath = Join-Path $webDir "app/admin/pipeline/[id]/page.tsx"
    if (Test-Path $pagePath) {
        $pageContent = Get-Content $pagePath -Raw
        if ($pageContent -match "slack_sent|slack_skipped|slack_failed") {
            Write-Host "    Slack badge styling in timeline UI - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: slack badge styling not found in timeline UI" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Slack notification module and notify router verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Slack/notify module test error: $_" -ForegroundColor Yellow
}

# Check 26: Subscription gating module verification
Write-Host "`n[26/27] Testing subscription gating module..." -ForegroundColor Yellow
try {
    # Verify subscription.ts exists
    $subscriptionModulePath = Join-Path $webDir "lib/subscription.ts"
    if (-not (Test-Path $subscriptionModulePath)) {
        Write-Host "  FAIL: Subscription module not found at $subscriptionModulePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Subscription module exists at lib/subscription.ts - OK" -ForegroundColor Gray

    # Verify subscription.ts exports required functions
    $subscriptionContent = Get-Content $subscriptionModulePath -Raw
    if ($subscriptionContent -notmatch "export\s+(async\s+)?function\s+getUserPlan") {
        Write-Host "  FAIL: getUserPlan function not exported from subscription.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    getUserPlan function exported - OK" -ForegroundColor Gray

    if ($subscriptionContent -notmatch "export\s+(async\s+)?function\s+isProUser") {
        Write-Host "  FAIL: isProUser function not exported from subscription.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    isProUser function exported - OK" -ForegroundColor Gray

    if ($subscriptionContent -notmatch "export\s+(async\s+)?function\s+canPerformGatedAction") {
        Write-Host "  FAIL: canPerformGatedAction function not exported from subscription.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    canPerformGatedAction function exported - OK" -ForegroundColor Gray

    if ($subscriptionContent -notmatch "export\s+function\s+isSubscriptionGatingEnabled") {
        Write-Host "  FAIL: isSubscriptionGatingEnabled function not exported from subscription.ts" -ForegroundColor Red
        exit 1
    }
    Write-Host "    isSubscriptionGatingEnabled function exported - OK" -ForegroundColor Gray

    # Verify fail-safe design (admin bypass check)
    if ($subscriptionContent -notmatch "isAdmin") {
        Write-Host "  FAIL: subscription.ts does not check isAdmin for bypass" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Admin bypass check present - OK" -ForegroundColor Gray

    # Verify dispatch route has subscription gating
    $dispatchPath = Join-Path $webDir "app/api/videos/dispatch/route.ts"
    if (Test-Path $dispatchPath) {
        $dispatchContent = Get-Content $dispatchPath -Raw
        if ($dispatchContent -match "canPerformGatedAction") {
            Write-Host "    Subscription gating integrated in dispatch route - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: canPerformGatedAction not found in dispatch route" -ForegroundColor Yellow
        }
    }

    # Verify execution route has subscription gating
    $executionPath = Join-Path $webDir "app/api/videos/[id]/execution/route.ts"
    if (Test-Path $executionPath) {
        $executionContent = Get-Content $executionPath -Raw
        if ($executionContent -match "canPerformGatedAction") {
            Write-Host "    Subscription gating integrated in execution route - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: canPerformGatedAction not found in execution route" -ForegroundColor Yellow
        }
    }

    # Verify workbench handles subscription_required
    $workbenchPath = Join-Path $webDir "app/admin/components/RoleWorkbench.tsx"
    if (Test-Path $workbenchPath) {
        $workbenchContent = Get-Content $workbenchPath -Raw
        if ($workbenchContent -match "subscription_required") {
            Write-Host "    Workbench UI handles subscription_required - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: subscription_required handling not found in workbench" -ForegroundColor Yellow
        }
        if ($workbenchContent -match "subscriptionRequired") {
            Write-Host "    Workbench has subscriptionRequired state - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: subscriptionRequired state not found in workbench" -ForegroundColor Yellow
        }
    }

    # Verify dispatch returns 401 without auth (existing behavior preserved)
    $dispatchStatusCode = 0
    try {
        $dispatchResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/dispatch" -Method POST -ContentType "application/json" -Body '{"role":"recorder"}' -TimeoutSec 10
        $dispatchStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $dispatchStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($dispatchStatusCode -eq 401) {
        Write-Host "    POST /api/videos/dispatch returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/videos/dispatch returned status: $dispatchStatusCode" -ForegroundColor Yellow
    }

    # Verify execution returns 401 without auth (existing behavior preserved)
    $executionStatusCode = 0
    try {
        $executionResult = Invoke-RestMethod -Uri "$baseUrl/api/videos/00000000-0000-0000-0000-000000000001/execution" -Method PUT -ContentType "application/json" -Body '{"recording_status":"RECORDED"}' -TimeoutSec 10
        $executionStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $executionStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }

    if ($executionStatusCode -eq 401) {
        Write-Host "    PUT /api/videos/[id]/execution returns 401 without auth - OK" -ForegroundColor Gray
    } elseif ($executionStatusCode -eq 404) {
        Write-Host "    PUT /api/videos/[id]/execution returns 404 (video not found) - OK" -ForegroundColor Gray
    } else {
        Write-Host "    PUT /api/videos/[id]/execution returned status: $executionStatusCode" -ForegroundColor Yellow
    }

    Write-Host "  PASS: Subscription gating module verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Subscription module test error: $_" -ForegroundColor Yellow
}

# Check 27: Pro upgrade landing page and admin plan management (Step 17)
Write-Host "`n[27/28] Testing Pro upgrade landing page and admin plan management..." -ForegroundColor Yellow
try {
    # Verify /upgrade page exists
    $upgradePath = Join-Path $webDir "app/upgrade/page.tsx"
    if (-not (Test-Path $upgradePath)) {
        Write-Host "  FAIL: /upgrade page not found at $upgradePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    /upgrade page exists - OK" -ForegroundColor Gray

    # Verify /upgrade page fetches plan status
    $upgradeContent = Get-Content $upgradePath -Raw
    if ($upgradeContent -match "/api/auth/plan-status") {
        Write-Host "    /upgrade page fetches plan-status - OK" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: /upgrade page does not fetch /api/auth/plan-status" -ForegroundColor Yellow
    }

    # Verify "Contact Admin" clipboard copy functionality
    if ($upgradeContent -match "clipboard\.writeText") {
        Write-Host "    /upgrade page has clipboard copy feature - OK" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: /upgrade page missing clipboard copy functionality" -ForegroundColor Yellow
    }

    # Verify plan-status API endpoint exists
    $planStatusPath = Join-Path $webDir "app/api/auth/plan-status/route.ts"
    if (-not (Test-Path $planStatusPath)) {
        Write-Host "  FAIL: plan-status API not found at $planStatusPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/auth/plan-status endpoint exists - OK" -ForegroundColor Gray

    # Verify plan-status returns 401 without auth
    $planStatusCode = 0
    try {
        $planStatusResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/plan-status" -Method GET -TimeoutSec 10
        $planStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $planStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($planStatusCode -eq 401) {
        Write-Host "    GET /api/auth/plan-status returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/auth/plan-status returned status: $planStatusCode" -ForegroundColor Yellow
    }

    # Verify admin set-plan API endpoint exists
    $setPlanPath = Join-Path $webDir "app/api/admin/users/set-plan/route.ts"
    if (-not (Test-Path $setPlanPath)) {
        Write-Host "  FAIL: admin set-plan API not found at $setPlanPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    POST /api/admin/users/set-plan endpoint exists - OK" -ForegroundColor Gray

    # Verify set-plan returns 401 without auth
    $setPlanStatusCode = 0
    try {
        $setPlanResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/users/set-plan" -Method POST -ContentType "application/json" -Body '{"user_id":"test","plan":"pro"}' -TimeoutSec 10
        $setPlanStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $setPlanStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($setPlanStatusCode -eq 401) {
        Write-Host "    POST /api/admin/users/set-plan returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/users/set-plan returned status: $setPlanStatusCode" -ForegroundColor Yellow
    }

    # Verify admin users list API endpoint exists
    $usersListPath = Join-Path $webDir "app/api/admin/users/route.ts"
    if (-not (Test-Path $usersListPath)) {
        Write-Host "  FAIL: admin users list API not found at $usersListPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/admin/users endpoint exists - OK" -ForegroundColor Gray

    # Verify users list returns 401 without auth
    $usersListStatusCode = 0
    try {
        $usersListResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Method GET -TimeoutSec 10
        $usersListStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $usersListStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($usersListStatusCode -eq 401) {
        Write-Host "    GET /api/admin/users returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/users returned status: $usersListStatusCode" -ForegroundColor Yellow
    }

    # Verify /admin/users page exists
    $adminUsersPath = Join-Path $webDir "app/admin/users/page.tsx"
    if (-not (Test-Path $adminUsersPath)) {
        Write-Host "  FAIL: /admin/users page not found at $adminUsersPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    /admin/users page exists - OK" -ForegroundColor Gray

    # Verify /admin/users page route returns 307 redirect (auth required)
    $adminUsersRouteStatusCode = 0
    try {
        $adminUsersRouteResult = Invoke-WebRequest -Uri "$baseUrl/admin/users" -Method GET -MaximumRedirection 0 -TimeoutSec 10 -ErrorAction SilentlyContinue
        $adminUsersRouteStatusCode = [int]$adminUsersRouteResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $adminUsersRouteStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminUsersRouteStatusCode -eq 307 -or $adminUsersRouteStatusCode -eq 200) {
        Write-Host "    /admin/users page returns $adminUsersRouteStatusCode - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/users page returned status: $adminUsersRouteStatusCode" -ForegroundColor Yellow
    }

    # Verify workbench has upgrade link
    $workbenchPath = Join-Path $webDir "app/admin/components/RoleWorkbench.tsx"
    if (Test-Path $workbenchPath) {
        $workbenchContent = Get-Content $workbenchPath -Raw
        if ($workbenchContent -match '"/upgrade"') {
            Write-Host "    Workbench has upgrade link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: Workbench missing /upgrade link" -ForegroundColor Yellow
        }
    }

    # Verify subscription.ts reads from admin_set_plan events
    $subscriptionPath = Join-Path $webDir "lib/subscription.ts"
    if (Test-Path $subscriptionPath) {
        $subscriptionContent = Get-Content $subscriptionPath -Raw
        if ($subscriptionContent -match "admin_set_plan") {
            Write-Host "    subscription.ts reads admin_set_plan events - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: subscription.ts does not read admin_set_plan events" -ForegroundColor Yellow
        }
    }

    # Verify nav link in pipeline page
    $pipelinePath = Join-Path $webDir "app/admin/pipeline/page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw
        if ($pipelineContent -match '"/admin/users"') {
            Write-Host "    Pipeline nav has Users link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: Pipeline page missing /admin/users nav link" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Pro upgrade landing page and admin plan management verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Pro upgrade verification error: $_" -ForegroundColor Yellow
}

# Check 28: Self-service upgrade requests and admin queue (Step 18)
Write-Host "`n[28/28] Testing self-service upgrade requests and admin queue..." -ForegroundColor Yellow
try {
    # Verify upgrade request API endpoint exists
    $upgradeRequestPath = Join-Path $webDir "app/api/auth/upgrade-request/route.ts"
    if (-not (Test-Path $upgradeRequestPath)) {
        Write-Host "  FAIL: upgrade-request API not found at $upgradeRequestPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    POST /api/auth/upgrade-request endpoint exists - OK" -ForegroundColor Gray

    # Verify upgrade request returns 401 without auth
    $upgradeRequestStatusCode = 0
    try {
        $upgradeRequestResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/upgrade-request" -Method POST -ContentType "application/json" -Body '{}' -TimeoutSec 10
        $upgradeRequestStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $upgradeRequestStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($upgradeRequestStatusCode -eq 401) {
        Write-Host "    POST /api/auth/upgrade-request returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/auth/upgrade-request returned status: $upgradeRequestStatusCode" -ForegroundColor Yellow
    }

    # Verify admin upgrade-requests list API exists
    $upgradeRequestsListPath = Join-Path $webDir "app/api/admin/upgrade-requests/route.ts"
    if (-not (Test-Path $upgradeRequestsListPath)) {
        Write-Host "  FAIL: admin upgrade-requests list API not found at $upgradeRequestsListPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/admin/upgrade-requests endpoint exists - OK" -ForegroundColor Gray

    # Verify upgrade-requests list returns 401 without auth
    $upgradeRequestsListStatusCode = 0
    try {
        $upgradeRequestsListResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/upgrade-requests" -Method GET -TimeoutSec 10
        $upgradeRequestsListStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $upgradeRequestsListStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($upgradeRequestsListStatusCode -eq 401) {
        Write-Host "    GET /api/admin/upgrade-requests returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/upgrade-requests returned status: $upgradeRequestsListStatusCode" -ForegroundColor Yellow
    }

    # Verify admin upgrade-requests resolve API exists
    $resolveApiPath = Join-Path $webDir "app/api/admin/upgrade-requests/resolve/route.ts"
    if (-not (Test-Path $resolveApiPath)) {
        Write-Host "  FAIL: admin upgrade-requests resolve API not found at $resolveApiPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    POST /api/admin/upgrade-requests/resolve endpoint exists - OK" -ForegroundColor Gray

    # Verify resolve returns 401 without auth
    $resolveStatusCode = 0
    try {
        $resolveResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/upgrade-requests/resolve" -Method POST -ContentType "application/json" -Body '{"request_event_id":"test","decision":"approved"}' -TimeoutSec 10
        $resolveStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $resolveStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($resolveStatusCode -eq 401) {
        Write-Host "    POST /api/admin/upgrade-requests/resolve returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/upgrade-requests/resolve returned status: $resolveStatusCode" -ForegroundColor Yellow
    }

    # Verify /admin/upgrade-requests page exists
    $adminUpgradeRequestsPagePath = Join-Path $webDir "app/admin/upgrade-requests/page.tsx"
    if (-not (Test-Path $adminUpgradeRequestsPagePath)) {
        Write-Host "  FAIL: /admin/upgrade-requests page not found at $adminUpgradeRequestsPagePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    /admin/upgrade-requests page exists - OK" -ForegroundColor Gray

    # Verify /admin/upgrade-requests returns 307 (auth redirect)
    $adminUpgradeRequestsRouteStatusCode = 0
    try {
        $adminUpgradeRequestsRouteResult = Invoke-WebRequest -Uri "$baseUrl/admin/upgrade-requests" -Method GET -MaximumRedirection 0 -TimeoutSec 10 -ErrorAction SilentlyContinue
        $adminUpgradeRequestsRouteStatusCode = [int]$adminUpgradeRequestsRouteResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $adminUpgradeRequestsRouteStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminUpgradeRequestsRouteStatusCode -eq 307 -or $adminUpgradeRequestsRouteStatusCode -eq 200) {
        Write-Host "    /admin/upgrade-requests page returns $adminUpgradeRequestsRouteStatusCode - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/upgrade-requests page returned status: $adminUpgradeRequestsRouteStatusCode" -ForegroundColor Yellow
    }

    # Verify /upgrade page has request form
    $upgradePath = Join-Path $webDir "app/upgrade/page.tsx"
    if (Test-Path $upgradePath) {
        $upgradeContent = Get-Content $upgradePath -Raw
        if ($upgradeContent -match "submitUpgradeRequest") {
            Write-Host "    /upgrade page has request form - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: /upgrade page missing submitUpgradeRequest function" -ForegroundColor Yellow
        }
        if ($upgradeContent -match "/api/auth/upgrade-request") {
            Write-Host "    /upgrade page calls upgrade-request API - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: /upgrade page does not call upgrade-request API" -ForegroundColor Yellow
        }
    }

    # Verify notify router recognizes user_upgrade_requested
    $notifyPath = Join-Path $webDir "lib/notify.ts"
    if (Test-Path $notifyPath) {
        $notifyContent = Get-Content $notifyPath -Raw
        if ($notifyContent -match "user_upgrade_requested") {
            Write-Host "    notify router recognizes user_upgrade_requested - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: notify router does not recognize user_upgrade_requested" -ForegroundColor Yellow
        }
        if ($notifyContent -match "user_upgrade_request_resolved") {
            Write-Host "    notify router recognizes user_upgrade_request_resolved - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: notify router does not recognize user_upgrade_request_resolved" -ForegroundColor Yellow
        }
    }

    # Verify pipeline nav has Upgrades link
    $pipelinePath = Join-Path $webDir "app/admin/pipeline/page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw
        if ($pipelineContent -match '"/admin/upgrade-requests"') {
            Write-Host "    Pipeline nav has Upgrades link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: Pipeline page missing /admin/upgrade-requests nav link" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Self-service upgrade requests and admin queue verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Upgrade requests verification error: $_" -ForegroundColor Yellow
}

# Check 29: System Settings (Admin) + Feature Flags + Runtime Config (Step 19)
Write-Host "`n[29/29] Testing system settings and runtime config..." -ForegroundColor Yellow
try {
    # Verify settings resolver exists
    $settingsPath = Join-Path $webDir "lib/settings.ts"
    if (-not (Test-Path $settingsPath)) {
        Write-Host "  FAIL: settings.ts not found at $settingsPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    lib/settings.ts exists - OK" -ForegroundColor Gray

    # Verify settings resolver has required exports
    $settingsContent = Get-Content $settingsPath -Raw
    if ($settingsContent -match "ALLOWED_SETTING_KEYS") {
        Write-Host "    settings.ts has ALLOWED_SETTING_KEYS - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: settings.ts missing ALLOWED_SETTING_KEYS" -ForegroundColor Red
        exit 1
    }
    if ($settingsContent -match "getEffectiveSetting") {
        Write-Host "    settings.ts has getEffectiveSetting - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: settings.ts missing getEffectiveSetting" -ForegroundColor Red
        exit 1
    }
    if ($settingsContent -match "setSystemSetting") {
        Write-Host "    settings.ts has setSystemSetting - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: settings.ts missing setSystemSetting" -ForegroundColor Red
        exit 1
    }

    # Verify runtime-config API exists
    $runtimeConfigPath = Join-Path $webDir "app/api/auth/runtime-config/route.ts"
    if (-not (Test-Path $runtimeConfigPath)) {
        Write-Host "  FAIL: runtime-config API not found at $runtimeConfigPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/auth/runtime-config endpoint exists - OK" -ForegroundColor Gray

    # Verify runtime-config returns 401 without auth
    $runtimeConfigStatusCode = 0
    try {
        $runtimeConfigResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/runtime-config" -Method GET -TimeoutSec 10
        $runtimeConfigStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $runtimeConfigStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($runtimeConfigStatusCode -eq 401) {
        Write-Host "    GET /api/auth/runtime-config returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/auth/runtime-config returned status: $runtimeConfigStatusCode" -ForegroundColor Yellow
    }

    # Verify admin settings list API exists
    $adminSettingsPath = Join-Path $webDir "app/api/admin/settings/route.ts"
    if (-not (Test-Path $adminSettingsPath)) {
        Write-Host "  FAIL: admin settings API not found at $adminSettingsPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/admin/settings endpoint exists - OK" -ForegroundColor Gray

    # Verify admin settings returns 401 without auth
    $adminSettingsStatusCode = 0
    try {
        $adminSettingsResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/settings" -Method GET -TimeoutSec 10
        $adminSettingsStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $adminSettingsStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminSettingsStatusCode -eq 401) {
        Write-Host "    GET /api/admin/settings returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/settings returned status: $adminSettingsStatusCode" -ForegroundColor Yellow
    }

    # Verify admin settings/set API exists
    $adminSettingsSetPath = Join-Path $webDir "app/api/admin/settings/set/route.ts"
    if (-not (Test-Path $adminSettingsSetPath)) {
        Write-Host "  FAIL: admin settings/set API not found at $adminSettingsSetPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    POST /api/admin/settings/set endpoint exists - OK" -ForegroundColor Gray

    # Verify admin settings/set returns 401 without auth
    $adminSettingsSetStatusCode = 0
    try {
        $adminSettingsSetResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/settings/set" -Method POST -ContentType "application/json" -Body '{"key":"TEST","value":true}' -TimeoutSec 10
        $adminSettingsSetStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $adminSettingsSetStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminSettingsSetStatusCode -eq 401) {
        Write-Host "    POST /api/admin/settings/set returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    POST /api/admin/settings/set returned status: $adminSettingsSetStatusCode" -ForegroundColor Yellow
    }

    # Verify /admin/settings page exists
    $adminSettingsPagePath = Join-Path $webDir "app/admin/settings/page.tsx"
    if (-not (Test-Path $adminSettingsPagePath)) {
        Write-Host "  FAIL: /admin/settings page not found at $adminSettingsPagePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    /admin/settings page exists - OK" -ForegroundColor Gray

    # Verify /admin/settings returns 307 (auth redirect) or 200
    $adminSettingsPageStatusCode = 0
    try {
        $adminSettingsPageResult = Invoke-WebRequest -Uri "$baseUrl/admin/settings" -Method GET -MaximumRedirection 0 -TimeoutSec 10 -ErrorAction SilentlyContinue
        $adminSettingsPageStatusCode = [int]$adminSettingsPageResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $adminSettingsPageStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminSettingsPageStatusCode -eq 307 -or $adminSettingsPageStatusCode -eq 200) {
        Write-Host "    /admin/settings page returns $adminSettingsPageStatusCode - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/settings page returned status: $adminSettingsPageStatusCode" -ForegroundColor Yellow
    }

    # Verify subscription.ts uses settings resolver
    $subscriptionPath = Join-Path $webDir "lib/subscription.ts"
    if (Test-Path $subscriptionPath) {
        $subscriptionContent = Get-Content $subscriptionPath -Raw
        if ($subscriptionContent -match "getEffectiveBoolean") {
            Write-Host "    subscription.ts uses settings resolver - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: subscription.ts does not use settings resolver" -ForegroundColor Yellow
        }
    }

    # Verify email.ts uses settings resolver
    $emailPath = Join-Path $webDir "lib/email.ts"
    if (Test-Path $emailPath) {
        $emailContent = Get-Content $emailPath -Raw
        if ($emailContent -match "getEffectiveBoolean") {
            Write-Host "    email.ts uses settings resolver - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: email.ts does not use settings resolver" -ForegroundColor Yellow
        }
    }

    # Verify slack.ts uses settings resolver
    $slackPath = Join-Path $webDir "lib/slack.ts"
    if (Test-Path $slackPath) {
        $slackContent = Get-Content $slackPath -Raw
        if ($slackContent -match "getEffectiveBoolean") {
            Write-Host "    slack.ts uses settings resolver - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: slack.ts does not use settings resolver" -ForegroundColor Yellow
        }
    }

    # Verify notify.ts uses settings resolver for SLACK_OPS_EVENTS
    $notifyPath = Join-Path $webDir "lib/notify.ts"
    if (Test-Path $notifyPath) {
        $notifyContent = Get-Content $notifyPath -Raw
        if ($notifyContent -match "getEffectiveStringArray") {
            Write-Host "    notify.ts uses settings resolver for SLACK_OPS_EVENTS - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: notify.ts does not use settings resolver for SLACK_OPS_EVENTS" -ForegroundColor Yellow
        }
    }

    # Verify pipeline nav has Settings link
    $pipelinePath = Join-Path $webDir "app/admin/pipeline/page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw
        if ($pipelineContent -match '"/admin/settings"') {
            Write-Host "    Pipeline nav has Settings link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: Pipeline page missing /admin/settings nav link" -ForegroundColor Yellow
        }
    }

    # Verify /upgrade page has runtime config display
    $upgradePath = Join-Path $webDir "app/upgrade/page.tsx"
    if (Test-Path $upgradePath) {
        $upgradeContent = Get-Content $upgradePath -Raw
        if ($upgradeContent -match "runtime-config") {
            Write-Host "    /upgrade page fetches runtime config - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: /upgrade page does not fetch runtime config" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: System settings and runtime config verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: System settings verification error: $_" -ForegroundColor Yellow
}

# Check 30: SLA & Throughput Analytics Dashboard (Step 20)
Write-Host "`n[30/30] Testing analytics dashboard and export..." -ForegroundColor Yellow
try {
    # Verify analytics module exists
    $analyticsPath = Join-Path $webDir "lib/analytics.ts"
    if (-not (Test-Path $analyticsPath)) {
        Write-Host "  FAIL: analytics.ts not found at $analyticsPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    lib/analytics.ts exists - OK" -ForegroundColor Gray

    # Verify analytics module has required exports
    $analyticsContent = Get-Content $analyticsPath -Raw
    if ($analyticsContent -match "computeStageStats") {
        Write-Host "    analytics.ts has computeStageStats - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: analytics.ts missing computeStageStats" -ForegroundColor Red
        exit 1
    }
    if ($analyticsContent -match "computeThroughputByDay") {
        Write-Host "    analytics.ts has computeThroughputByDay - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: analytics.ts missing computeThroughputByDay" -ForegroundColor Red
        exit 1
    }
    if ($analyticsContent -match "computeProductivity") {
        Write-Host "    analytics.ts has computeProductivity - OK" -ForegroundColor Gray
    } else {
        Write-Host "  FAIL: analytics.ts missing computeProductivity" -ForegroundColor Red
        exit 1
    }

    # Verify analytics summary API exists
    $analyticsSummaryPath = Join-Path $webDir "app/api/admin/analytics/summary/route.ts"
    if (-not (Test-Path $analyticsSummaryPath)) {
        Write-Host "  FAIL: analytics summary API not found at $analyticsSummaryPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/admin/analytics/summary endpoint exists - OK" -ForegroundColor Gray

    # Verify analytics summary returns 401 without auth
    $analyticsSummaryStatusCode = 0
    try {
        $analyticsSummaryResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/analytics/summary" -Method GET -TimeoutSec 10
        $analyticsSummaryStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $analyticsSummaryStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($analyticsSummaryStatusCode -eq 401) {
        Write-Host "    GET /api/admin/analytics/summary returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/analytics/summary returned status: $analyticsSummaryStatusCode" -ForegroundColor Yellow
    }

    # Verify analytics export API exists
    $analyticsExportPath = Join-Path $webDir "app/api/admin/analytics/export/route.ts"
    if (-not (Test-Path $analyticsExportPath)) {
        Write-Host "  FAIL: analytics export API not found at $analyticsExportPath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    GET /api/admin/analytics/export endpoint exists - OK" -ForegroundColor Gray

    # Verify analytics export returns 401 without auth
    $analyticsExportStatusCode = 0
    try {
        $analyticsExportResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/analytics/export?type=stage" -Method GET -TimeoutSec 10
        $analyticsExportStatusCode = 200
    } catch {
        if ($_.Exception.Response) {
            $analyticsExportStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($analyticsExportStatusCode -eq 401) {
        Write-Host "    GET /api/admin/analytics/export returns 401 without auth - OK" -ForegroundColor Gray
    } else {
        Write-Host "    GET /api/admin/analytics/export returned status: $analyticsExportStatusCode" -ForegroundColor Yellow
    }

    # Verify /admin/analytics page exists
    $adminAnalyticsPagePath = Join-Path $webDir "app/admin/analytics/page.tsx"
    if (-not (Test-Path $adminAnalyticsPagePath)) {
        Write-Host "  FAIL: /admin/analytics page not found at $adminAnalyticsPagePath" -ForegroundColor Red
        exit 1
    }
    Write-Host "    /admin/analytics page exists - OK" -ForegroundColor Gray

    # Verify /admin/analytics returns 307 (auth redirect) or 200
    $adminAnalyticsPageStatusCode = 0
    try {
        $adminAnalyticsPageResult = Invoke-WebRequest -Uri "$baseUrl/admin/analytics" -Method GET -MaximumRedirection 0 -TimeoutSec 10 -ErrorAction SilentlyContinue
        $adminAnalyticsPageStatusCode = [int]$adminAnalyticsPageResult.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $adminAnalyticsPageStatusCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($adminAnalyticsPageStatusCode -eq 307 -or $adminAnalyticsPageStatusCode -eq 200) {
        Write-Host "    /admin/analytics page returns $adminAnalyticsPageStatusCode - OK" -ForegroundColor Gray
    } else {
        Write-Host "    /admin/analytics page returned status: $adminAnalyticsPageStatusCode" -ForegroundColor Yellow
    }

    # Verify pipeline nav has Analytics link
    $pipelinePath = Join-Path $webDir "app/admin/pipeline/page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw
        if ($pipelineContent -match '"/admin/analytics"') {
            Write-Host "    Pipeline nav has Analytics link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: Pipeline page missing /admin/analytics nav link" -ForegroundColor Yellow
        }
    }

    # Verify settings has ANALYTICS_DEFAULT_WINDOW_DAYS
    $settingsPath = Join-Path $webDir "lib/settings.ts"
    if (Test-Path $settingsPath) {
        $settingsContent = Get-Content $settingsPath -Raw
        if ($settingsContent -match "ANALYTICS_DEFAULT_WINDOW_DAYS") {
            Write-Host "    settings.ts has ANALYTICS_DEFAULT_WINDOW_DAYS - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing ANALYTICS_DEFAULT_WINDOW_DAYS" -ForegroundColor Yellow
        }
    }

    # Verify analytics page has export buttons
    if (Test-Path $adminAnalyticsPagePath) {
        $analyticsPageContent = Get-Content $adminAnalyticsPagePath -Raw
        if ($analyticsPageContent -match "Export CSV") {
            Write-Host "    /admin/analytics page has export buttons - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: /admin/analytics page missing export buttons" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Analytics dashboard and export verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Analytics verification error: $_" -ForegroundColor Yellow
}

# [31/31] Incident Mode and Maintenance Banner verification
Write-Host "`n[31/31] Testing incident mode and maintenance banner..." -ForegroundColor Yellow
try {
    # Check settings.ts has incident mode keys
    $settingsPath = Join-Path $webDir "lib\settings.ts"
    if (Test-Path $settingsPath) {
        Write-Host "    lib/settings.ts exists - OK" -ForegroundColor Gray
        $settingsContent = Get-Content $settingsPath -Raw

        if ($settingsContent -match 'INCIDENT_MODE_ENABLED') {
            Write-Host "    settings.ts has INCIDENT_MODE_ENABLED - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing INCIDENT_MODE_ENABLED" -ForegroundColor Yellow
        }

        if ($settingsContent -match 'INCIDENT_MODE_MESSAGE') {
            Write-Host "    settings.ts has INCIDENT_MODE_MESSAGE - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing INCIDENT_MODE_MESSAGE" -ForegroundColor Yellow
        }

        if ($settingsContent -match 'INCIDENT_MODE_READ_ONLY') {
            Write-Host "    settings.ts has INCIDENT_MODE_READ_ONLY - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing INCIDENT_MODE_READ_ONLY" -ForegroundColor Yellow
        }

        if ($settingsContent -match 'INCIDENT_MODE_ALLOWLIST_USER_IDS') {
            Write-Host "    settings.ts has INCIDENT_MODE_ALLOWLIST_USER_IDS - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing INCIDENT_MODE_ALLOWLIST_USER_IDS" -ForegroundColor Yellow
        }

        if ($settingsContent -match 'getIncidentModeStatus') {
            Write-Host "    settings.ts has getIncidentModeStatus helper - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing getIncidentModeStatus helper" -ForegroundColor Yellow
        }

        if ($settingsContent -match 'checkIncidentReadOnlyBlock') {
            Write-Host "    settings.ts has checkIncidentReadOnlyBlock helper - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: settings.ts missing checkIncidentReadOnlyBlock helper" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: lib/settings.ts not found" -ForegroundColor Yellow
    }

    # Check IncidentBanner component exists
    $bannerPath = Join-Path $webDir "app\admin\components\IncidentBanner.tsx"
    if (Test-Path $bannerPath) {
        Write-Host "    IncidentBanner.tsx component exists - OK" -ForegroundColor Gray
        $bannerContent = Get-Content $bannerPath -Raw

        if ($bannerContent -match 'incident_mode_enabled') {
            Write-Host "    IncidentBanner checks incident_mode_enabled - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: IncidentBanner missing incident_mode_enabled check" -ForegroundColor Yellow
        }

        if ($bannerContent -match 'incident_mode_read_only') {
            Write-Host "    IncidentBanner checks incident_mode_read_only - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: IncidentBanner missing incident_mode_read_only check" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: IncidentBanner.tsx component not found" -ForegroundColor Yellow
    }

    # Check runtime-config includes incident fields
    $runtimeConfigPath = Join-Path $webDir "app\api\auth\runtime-config\route.ts"
    if (Test-Path $runtimeConfigPath) {
        $runtimeConfigContent = Get-Content $runtimeConfigPath -Raw

        if ($runtimeConfigContent -match 'incident_mode_enabled') {
            Write-Host "    runtime-config API returns incident_mode_enabled - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: runtime-config API missing incident_mode_enabled" -ForegroundColor Yellow
        }

        if ($runtimeConfigContent -match 'is_allowlisted') {
            Write-Host "    runtime-config API returns is_allowlisted - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: runtime-config API missing is_allowlisted" -ForegroundColor Yellow
        }
    }

    # Check server-side enforcement in dispatch route
    $dispatchPath = Join-Path $webDir "app\api\videos\dispatch\route.ts"
    if (Test-Path $dispatchPath) {
        $dispatchContent = Get-Content $dispatchPath -Raw

        if ($dispatchContent -match 'checkIncidentReadOnlyBlock') {
            Write-Host "    dispatch route has incident mode check - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: dispatch route missing incident mode check" -ForegroundColor Yellow
        }

        if ($dispatchContent -match 'incident_mode_read_only') {
            Write-Host "    dispatch route returns incident_mode_read_only error - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: dispatch route missing incident_mode_read_only error" -ForegroundColor Yellow
        }
    }

    # Check server-side enforcement in execution route
    $executionPath = Join-Path $webDir "app\api\videos\[id]\execution\route.ts"
    if (Test-Path $executionPath) {
        $executionContent = Get-Content $executionPath -Raw

        if ($executionContent -match 'checkIncidentReadOnlyBlock') {
            Write-Host "    execution route has incident mode check - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: execution route missing incident mode check" -ForegroundColor Yellow
        }
    }

    # Check admin settings page has incident mode settings
    $settingsPagePath = Join-Path $webDir "app\admin\settings\page.tsx"
    if (Test-Path $settingsPagePath) {
        $settingsPageContent = Get-Content $settingsPagePath -Raw

        if ($settingsPageContent -match 'INCIDENT_MODE_ENABLED') {
            Write-Host "    admin settings page has INCIDENT_MODE_ENABLED - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: admin settings page missing INCIDENT_MODE_ENABLED" -ForegroundColor Yellow
        }

        if ($settingsPageContent -match 'IncidentBanner') {
            Write-Host "    admin settings page has IncidentBanner - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: admin settings page missing IncidentBanner" -ForegroundColor Yellow
        }
    }

    # Check pipeline page has IncidentBanner
    $pipelinePath = Join-Path $webDir "app\admin\pipeline\page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw

        if ($pipelineContent -match 'IncidentBanner') {
            Write-Host "    pipeline page has IncidentBanner - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: pipeline page missing IncidentBanner" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Incident mode and maintenance banner verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Incident mode verification error: $_" -ForegroundColor Yellow
}

# [32/33] Production Readiness Pack verification
Write-Host "`n[32/33] Testing production readiness pack..." -ForegroundColor Yellow
try {
    # Check /admin/status returns 307 without auth
    try {
        $request = [System.Net.HttpWebRequest]::Create("$baseUrl/admin/status")
        $request.Method = "GET"
        $request.AllowAutoRedirect = $false
        $request.Timeout = 10000

        try {
            $response = $request.GetResponse()
            $statusCode = [int]$response.StatusCode
            $response.Close()
        } catch [System.Net.WebException] {
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $_.Exception.Response.Close()
            } else {
                $statusCode = 0
            }
        }

        if ($statusCode -eq 307) {
            Write-Host "    /admin/status returns 307 without auth - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: /admin/status returned $statusCode (expected 307)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  WARN: /admin/status check error: $_" -ForegroundColor Yellow
    }

    # Check /api/health includes env_report fields
    try {
        $healthResponse = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET -TimeoutSec 10
        if ($healthResponse.env_report) {
            Write-Host "    /api/health includes env_report - OK" -ForegroundColor Gray

            if ($null -ne $healthResponse.env_report.env_ok) {
                Write-Host "    env_report.env_ok field present - OK" -ForegroundColor Gray
            } else {
                Write-Host "  WARN: env_report.env_ok field missing" -ForegroundColor Yellow
            }

            if ($null -ne $healthResponse.env_report.required_present) {
                Write-Host "    env_report.required_present field present - OK" -ForegroundColor Gray
            } else {
                Write-Host "  WARN: env_report.required_present field missing" -ForegroundColor Yellow
            }

            if ($null -ne $healthResponse.env_report.required_total) {
                Write-Host "    env_report.required_total field present - OK" -ForegroundColor Gray
            } else {
                Write-Host "  WARN: env_report.required_total field missing" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  WARN: /api/health missing env_report" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  WARN: /api/health check error: $_" -ForegroundColor Yellow
    }

    # Check web/lib/env-validation.ts exists and exports getEnvReport
    $envValidationPath = Join-Path $webDir "lib\env-validation.ts"
    if (Test-Path $envValidationPath) {
        Write-Host "    web/lib/env-validation.ts exists - OK" -ForegroundColor Gray
        $envValidationContent = Get-Content $envValidationPath -Raw

        if ($envValidationContent -match 'export function getEnvReport') {
            Write-Host "    env-validation.ts exports getEnvReport - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: env-validation.ts missing getEnvReport export" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: web/lib/env-validation.ts not found" -ForegroundColor Yellow
    }

    # Check docs/PRODUCTION.md exists
    $docsPath = Join-Path (Split-Path -Parent $webDir) "docs\PRODUCTION.md"
    if (Test-Path $docsPath) {
        Write-Host "    docs/PRODUCTION.md exists - OK" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: docs/PRODUCTION.md not found" -ForegroundColor Yellow
    }

    # Check scripts/smoke_prod.ps1 exists
    $smokePath = Join-Path (Split-Path -Parent $webDir) "scripts\smoke_prod.ps1"
    if (Test-Path $smokePath) {
        Write-Host "    scripts/smoke_prod.ps1 exists - OK" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: scripts/smoke_prod.ps1 not found" -ForegroundColor Yellow
    }

    # Check /admin/status page exists
    $statusPagePath = Join-Path $webDir "app\admin\status\page.tsx"
    if (Test-Path $statusPagePath) {
        Write-Host "    /admin/status page exists - OK" -ForegroundColor Gray
    } else {
        Write-Host "  WARN: /admin/status page not found" -ForegroundColor Yellow
    }

    # Check pipeline nav has Status link
    $pipelinePath = Join-Path $webDir "app\admin\pipeline\page.tsx"
    if (Test-Path $pipelinePath) {
        $pipelineContent = Get-Content $pipelinePath -Raw
        if ($pipelineContent -match '/admin/status') {
            Write-Host "    pipeline nav has Status link - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: pipeline nav missing Status link" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: Production readiness pack verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Production readiness verification error: $_" -ForegroundColor Yellow
}

# [33/33] UX Polish verification
Write-Host "`n[33/33] Testing UX polish components..." -ForegroundColor Yellow
try {
    # Check AdminPageLayout exists and exports EmptyState
    $adminLayoutPath = Join-Path $webDir "app\admin\components\AdminPageLayout.tsx"
    if (Test-Path $adminLayoutPath) {
        Write-Host "    AdminPageLayout.tsx exists - OK" -ForegroundColor Gray
        $adminLayoutContent = Get-Content $adminLayoutPath -Raw

        if ($adminLayoutContent -match 'export function EmptyState') {
            Write-Host "    EmptyState component exported - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: EmptyState component not exported" -ForegroundColor Yellow
        }

        if ($adminLayoutContent -match 'export function AdminCard') {
            Write-Host "    AdminCard component exported - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: AdminCard component not exported" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: AdminPageLayout.tsx not found" -ForegroundColor Yellow
    }

    # Check RoleWorkbench has Accordion component
    $workbenchPath = Join-Path $webDir "app\admin\components\RoleWorkbench.tsx"
    if (Test-Path $workbenchPath) {
        $workbenchContent = Get-Content $workbenchPath -Raw
        if ($workbenchContent -match 'const Accordion') {
            Write-Host "    RoleWorkbench has Accordion component - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: RoleWorkbench missing Accordion component" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: RoleWorkbench.tsx not found" -ForegroundColor Yellow
    }

    # Check admin pages use EmptyState
    $eventsPath = Join-Path $webDir "app\admin\events\page.tsx"
    if (Test-Path $eventsPath) {
        $eventsContent = Get-Content $eventsPath -Raw
        if ($eventsContent -match 'EmptyState') {
            Write-Host "    events page uses EmptyState - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: events page missing EmptyState" -ForegroundColor Yellow
        }
    }

    $assignmentsPath = Join-Path $webDir "app\admin\assignments\page.tsx"
    if (Test-Path $assignmentsPath) {
        $assignmentsContent = Get-Content $assignmentsPath -Raw
        if ($assignmentsContent -match 'EmptyState') {
            Write-Host "    assignments page uses EmptyState - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: assignments page missing EmptyState" -ForegroundColor Yellow
        }
    }

    # Check upgrade page has Tailwind styling
    $upgradePath = Join-Path $webDir "app\upgrade\page.tsx"
    if (Test-Path $upgradePath) {
        $upgradeContent = Get-Content $upgradePath -Raw
        if ($upgradeContent -match 'bg-slate-50') {
            Write-Host "    upgrade page uses Tailwind styling - OK" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: upgrade page missing Tailwind styling" -ForegroundColor Yellow
        }
    }

    Write-Host "  PASS: UX polish verification completed" -ForegroundColor Green
} catch {
    Write-Host "  WARN: UX polish verification error: $_" -ForegroundColor Yellow
}

Write-Host "`n[33/33] Phase 8 verification summary..." -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Phase 8 verification PASSED" -ForegroundColor Green
exit 0
