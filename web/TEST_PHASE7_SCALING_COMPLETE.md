# Phase 7 Scaling Test Documentation

## Overview
Complete test sequence for Phase 7 scaling functionality that creates iteration groups, child variants, and queued videos.

## Prerequisites
- Next.js dev server running on localhost:3000
- Supabase configured with service role key
- Phase 7 migration (007_winner_scaling.sql) applied
- At least one account and variant in the database

## Test Sequence

### 1. Get Required IDs
```powershell
# Get account and variant IDs
$accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
$variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$accountId = $accounts.data[0].id
$variantId = $variants.data[0].id

Write-Host "Account ID: $accountId"
Write-Host "Winner Variant ID: $variantId"
```

### 2. Test Scaling (Sync Mode)
```powershell
# Create scaling request
$payload = @{
  "winner_variant_id" = $variantId
  "change_types" = @("cta")
  "count_per_type" = 1
  "account_ids" = @($accountId)
  "google_drive_url" = "https://drive.google.com/drive/folders/SCALING_BATCH_TEST"
  "mode" = "sync"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $payload

Write-Host "✓ Scaling Result:"
Write-Host "  OK: $($result.ok)"
Write-Host "  Iteration Group ID: $($result.iteration_group_id)"
Write-Host "  Status: $($result.status)"
Write-Host "  Child Variants: $($result.created.child_variants_count)"
Write-Host "  Videos Created: $($result.created.videos_created_count)"
Write-Host "  Warnings: $($result.warnings -join ', ')"

$igId = $result.iteration_group_id
```

### 3. Verify Iteration Group
```powershell
# Check iteration group details
$igDetails = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$igId" -Method GET

Write-Host "✓ Iteration Group:"
Write-Host "  Status: $($igDetails.data.status)"
Write-Host "  Winner Variant ID: $($igDetails.data.winner_variant_id)"
Write-Host "  Concept ID: $($igDetails.data.concept_id)"
Write-Host "  Plan JSON exists: $($igDetails.data.plan_json -ne $null)"
```

### 4. Verify Child Variants Created
```powershell
# Check for child variants
$allVariants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$childVariants = $allVariants.data | Where-Object { $_.iteration_group_id -eq $igId }

Write-Host "✓ Child Variants: $($childVariants.Count)"
if ($childVariants.Count -gt 0) {
    $child = $childVariants[0]
    Write-Host "  Sample Child Variant:"
    Write-Host "    ID: $($child.id)"
    Write-Host "    Parent Variant ID: $($child.parent_variant_id)"
    Write-Host "    Change Type: $($child.change_type)"
    Write-Host "    Status: $($child.status)"
    Write-Host "    Compliance Status: $($child.compliance_status)"
}
```

### 5. Verify Videos Created
```powershell
# Check for created videos
$allVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method GET
$createdVideos = $allVideos.data | Where-Object { 
    $_.account_id -eq $accountId -and 
    $_.status -eq "needs_edit" -and
    $_.google_drive_url -eq "https://drive.google.com/drive/folders/SCALING_BATCH_TEST"
}

Write-Host "✓ Videos Created: $($createdVideos.Count)"
if ($createdVideos.Count -gt 0) {
    $video = $createdVideos[0]
    Write-Host "  Sample Video:"
    Write-Host "    ID: $($video.id)"
    Write-Host "    Variant ID: $($video.variant_id)"
    Write-Host "    Account ID: $($video.account_id)"
    Write-Host "    Status: $($video.status)"
    Write-Host "    Google Drive URL: $($video.google_drive_url)"
}
```

### 6. Test Async Mode
```powershell
# Test async scaling
$asyncPayload = @{
  "winner_variant_id" = $variantId
  "change_types" = @("cta")
  "count_per_type" = 1
  "account_ids" = @($accountId)
  "google_drive_url" = "https://drive.google.com/drive/folders/SCALING_BATCH_TEST_ASYNC"
  "mode" = "async"
} | ConvertTo-Json

$asyncResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $asyncPayload

Write-Host "✓ Async Scaling Started:"
Write-Host "  Iteration Group ID: $($asyncResult.iteration_group_id)"
Write-Host "  Status: $($asyncResult.status)"
Write-Host "  Mode: $($asyncResult.mode)"

# Wait and check completion
Start-Sleep -Seconds 5
$asyncIgDetails = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups/$($asyncResult.iteration_group_id)" -Method GET
Write-Host "  Final Status: $($asyncIgDetails.data.status)"
```

## Expected Results

### Successful Scaling Should Show:
- ✅ `ok: true` in scaling response
- ✅ `child_variants_count > 0`
- ✅ `videos_created_count > 0`
- ✅ Iteration group `status: "complete"`
- ✅ Child variants with proper parent linkage
- ✅ Videos with `status: "needs_edit"`
- ✅ No duplicate videos per variant-account combination

### Schema Validation:
- Child variants have all required fields populated
- Videos have required fields: `variant_id`, `account_id`, `google_drive_url`, `status`
- Iteration groups have `winner_variant_id`, `concept_id`, `plan_json`

## Troubleshooting

### Common Issues:
1. **NULL insertion errors**: Check that winner variant has `concept_id`, `hook_id`, `script_id`
2. **No child variants created**: Verify `plan_json.test_matrix` structure
3. **No videos created**: Check `account_ids` and `google_drive_url` parameters
4. **Duplicate prevention**: Videos should not be created if they already exist for variant-account pair

### Debug Commands:
```powershell
# Check server logs for correlation_id
# Look for "[correlation_id] Creating child variant with payload"
# Look for "[correlation_id] Creating video with payload"

# Verify database state
$iterations = Invoke-RestMethod -Uri "http://localhost:3000/api/iteration-groups" -Method GET
$variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET  
$videos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method GET
```
