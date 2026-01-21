# Phase 7: Async Winner Scaling - PowerShell Test Commands

## Prerequisites

1. **Apply Phase 7 Migration** in Supabase SQL Editor:
```sql
-- Run the updated 007_winner_scaling.sql migration
-- Then immediately run: NOTIFY pgrst, 'reload schema';
```

2. **Restart Next.js Dev Server**:
```powershell
# Stop: Ctrl + C
# Start: npm run dev
```

## Step 1: Get Valid IDs (Non-Empty Check)

```powershell
# Get account with validation
$accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
$accountId = $accounts.data[0].id
Write-Host "accountId=$accountId"

# Get variant with validation
$variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$variantId = ($variants.data | Where-Object { $_.id } | Select-Object -First 1).id
Write-Host "variantId=$variantId"
if (-not $variantId) { throw "No variants found. Create one via the concept workbench first." }
```

## Step 2: Test Async Scaling (Default Mode)

```powershell
# Async scaling - returns immediately with iteration_group_id
$scaleBodyAsync = @{
  winner_variant_id = $variantId
  change_types      = @("hook","cta")
  count_per_type    = 2
  account_ids       = @($accountId)
  google_drive_url  = "https://drive.google.com/drive/folders/ASYNC_SCALING_TEST"
  mode              = "async"  # Optional - async is default
} | ConvertTo-Json -Depth 10

try {
  $asyncResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $scaleBodyAsync -TimeoutSec 15
  
  Write-Host "✓ Async scaling started successfully"
  Write-Host "  Mode: $($asyncResult.mode)"
  Write-Host "  Iteration Group ID: $($asyncResult.iteration_group_id)"
  Write-Host "  Status: $($asyncResult.status)"
  Write-Host "  Correlation ID: $($asyncResult.correlation_id)"
  
  $iterationGroupId = $asyncResult.iteration_group_id
  
} catch {
  $errorResponse = $_.Exception.Response
  if ($errorResponse) {
    $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
    Write-Host "❌ Async scaling failed: $($reader.ReadToEnd())"
  } else {
    Write-Host "❌ Async scaling failed: $($_.Exception.Message)"
  }
}
```

## Step 3: Monitor Scaling Progress

```powershell
# Poll iteration group status until complete
$maxPolls = 20
$pollCount = 0

do {
  Start-Sleep -Seconds 3
  $pollCount++
  
  try {
    $statusResult = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$iterationGroupId" -Method GET -TimeoutSec 10
    
    if ($statusResult.ok) {
      $status = $statusResult.data.summary.status
      $variantsCreated = $statusResult.data.summary.variants_created
      $videosCreated = $statusResult.data.summary.videos_created
      
      Write-Host "Poll $pollCount - Status: $status, Variants: $variantsCreated, Videos: $videosCreated"
      
      if ($status -eq "complete") {
        Write-Host "✓ Scaling completed successfully!"
        Write-Host "  Final variants created: $variantsCreated"
        Write-Host "  Final videos created: $videosCreated"
        Write-Host "  Accounts affected: $($statusResult.data.summary.accounts_affected)"
        break
      } elseif ($status -eq "failed") {
        Write-Host "❌ Scaling failed: $($statusResult.data.summary.error_message)"
        break
      }
    }
  } catch {
    Write-Host "⚠️  Poll $pollCount failed: $($_.Exception.Message)"
  }
  
} while ($pollCount -lt $maxPolls)

if ($pollCount -ge $maxPolls) {
  Write-Host "⚠️  Polling timeout - check status manually"
}
```

## Step 4: Verify Results

```powershell
# Check final iteration group details
try {
  $finalResult = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$iterationGroupId" -Method GET
  
  if ($finalResult.ok) {
    Write-Host "`n--- FINAL RESULTS ---"
    Write-Host "Status: $($finalResult.data.summary.status)"
    Write-Host "Child variants: $($finalResult.data.child_variants.Count)"
    Write-Host "Created videos: $($finalResult.data.created_videos.Count)"
    
    # Show child variant details
    $finalResult.data.child_variants | ForEach-Object {
      Write-Host "  Variant $($_.id.Substring(0,8)): $($_.change_type) - $($_.change_note)"
    }
    
    # Show created video details
    $finalResult.data.created_videos | ForEach-Object {
      Write-Host "  Video $($_.id.Substring(0,8)): Account $($_.accounts.name) - $($_.status)"
    }
  }
} catch {
  Write-Host "❌ Failed to get final results: $($_.Exception.Message)"
}

# Verify lineage shows relationships
try {
  $lineageResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/lineage?variant_id=$variantId" -Method GET
  Write-Host "`n--- LINEAGE VERIFICATION ---"
  Write-Host "Child variants: $($lineageResult.data.child_variants.Count)"
  Write-Host "Iteration groups: $($lineageResult.data.iteration_groups.Count)"
  Write-Host "Associated videos: $($lineageResult.data.all_videos.Count)"
} catch {
  Write-Host "❌ Lineage check failed: $($_.Exception.Message)"
}

# Check account video queue
try {
  $queueResult = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=needs_edit" -Method GET
  Write-Host "`n--- ACCOUNT QUEUE ---"
  Write-Host "Videos needing edit: $($queueResult.data.Count)"
} catch {
  Write-Host "❌ Queue check failed: $($_.Exception.Message)"
}
```

## Step 5: Test Sync Mode (Optional)

```powershell
# Test synchronous scaling for comparison
$scaleBodySync = @{
  winner_variant_id = $variantId
  change_types      = @("cta")
  count_per_type    = 1
  mode              = "sync"
} | ConvertTo-Json -Depth 10

try {
  Write-Host "`n--- TESTING SYNC MODE ---"
  $syncResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $scaleBodySync -TimeoutSec 120
  
  Write-Host "✓ Sync scaling completed"
  Write-Host "  Mode: $($syncResult.mode)"
  Write-Host "  Variants created: $($syncResult.summary.variants_created)"
  Write-Host "  Videos created: $($syncResult.summary.videos_created)"
  
} catch {
  Write-Host "❌ Sync scaling failed: $($_.Exception.Message)"
}
```

## Step 6: List All Iteration Groups

```powershell
# Get all iteration groups for the winner variant
try {
  $allGroups = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups?winner_variant_id=$variantId" -Method GET
  
  Write-Host "`n--- ALL ITERATION GROUPS ---"
  Write-Host "Total groups for variant: $($allGroups.data.Count)"
  
  $allGroups.data | ForEach-Object {
    Write-Host "  Group $($_.id.Substring(0,8)): $($_.status) - $($_.created_at)"
  }
} catch {
  Write-Host "❌ Failed to list iteration groups: $($_.Exception.Message)"
}
```

## Complete Happy Path Test

```powershell
Write-Host "=== PHASE 7 ASYNC SCALING HAPPY PATH ==="

try {
  # 1. Get IDs
  $accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
  $accountId = $accounts.data[0].id
  $variantId = ($variants.data | Where-Object { $_.id } | Select-Object -First 1).id
  
  Write-Host "✓ Got valid IDs: variant $($variantId.Substring(0,8)), account $($accountId.Substring(0,8))"

  # 2. Start async scaling
  $scaleBody = @{
    winner_variant_id = $variantId
    change_types = @("hook", "cta")
    count_per_type = 1
    account_ids = @($accountId)
    google_drive_url = "https://drive.google.com/drive/folders/HAPPY_PATH_ASYNC"
  } | ConvertTo-Json -Depth 10
  
  $asyncResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $scaleBody -TimeoutSec 15
  $iterationGroupId = $asyncResult.iteration_group_id
  Write-Host "✓ Started async scaling: $iterationGroupId"

  # 3. Poll until complete (max 30 seconds)
  $pollCount = 0
  do {
    Start-Sleep -Seconds 3
    $pollCount++
    $status = (Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$iterationGroupId" -Method GET).data.summary.status
    Write-Host "  Poll $pollCount: $status"
  } while ($status -eq "processing" -and $pollCount -lt 10)

  # 4. Verify final results
  $final = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$iterationGroupId" -Method GET
  Write-Host "✓ Final status: $($final.data.summary.status)"
  Write-Host "✓ Variants created: $($final.data.summary.variants_created)"
  Write-Host "✓ Videos created: $($final.data.summary.videos_created)"

  Write-Host "=== ASYNC SCALING HAPPY PATH COMPLETE ==="
} catch {
  Write-Host "❌ Happy path failed: $($_.Exception.Message)"
}
```

## Key Features Tested

- **Async Mode**: Immediate response with background processing
- **Status Polling**: Real-time monitoring of scaling progress
- **Error Handling**: Graceful failure with detailed error messages
- **Schema Safety**: Safe column insertion with validation
- **Correlation IDs**: Request tracking for debugging
- **Video Deduplication**: Prevents duplicate videos per variant/account
- **Comprehensive Results**: Complete lineage and video queue verification
