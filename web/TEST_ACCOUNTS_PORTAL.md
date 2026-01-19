# Accounts Portal - PowerShell Test Commands

## Setup and Schema Migration
```powershell
# Run schema migration first
try {
  $migrationResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/debug/schema-migration" -Method POST
  Write-Host "Migration result:" ($migrationResponse | ConvertTo-Json)
} catch {
  Write-Host "Migration error: $($_.Exception.Message)"
}
```

## 1. Create Account
```powershell
try {
  $accountBody = @{
    name = "TestTikTok"
    platform = "tiktok"
  } | ConvertTo-Json

  $accountResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method POST -ContentType "application/json" -Body $accountBody
  Write-Host "Created account:" ($accountResponse | ConvertTo-Json)
  $accountId = $accountResponse.data.id
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Account creation error: $errorText"
}
```

## 2. List Accounts
```powershell
try {
  $accountsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  Write-Host "Accounts list:" ($accountsResponse | ConvertTo-Json)
} catch {
  Write-Host "List accounts error: $($_.Exception.Message)"
}
```

## 3. Create Video with Account ID
```powershell
try {
  # Get a variant first
  $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
  $variantId = $variants.data[0].id

  $videoBody = @{
    account_id = $accountId
    variant_id = $variantId
    google_drive_url = "https://drive.google.com/file/d/TEST123/view"
    status = "needs_edit"
    caption_used = "Amazing supplement results! 💊"
    hashtags_used = "#supplement #health #fyp"
  } | ConvertTo-Json

  $videoResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method POST -ContentType "application/json" -Body $videoBody
  Write-Host "Created video:" ($videoResponse | ConvertTo-Json)
  $videoId = $videoResponse.data.id
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Video creation error: $errorText"
}
```

## 4. Set Status to Ready to Upload
```powershell
try {
  $updateBody = @{
    status = "ready_to_upload"
  } | ConvertTo-Json

  $updateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $updateBody
  Write-Host "Updated to ready_to_upload:" ($updateResponse | ConvertTo-Json)
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Update error: $errorText"
}
```

## 5. Mark Posted
```powershell
try {
  $postBody = @{
    status = "posted"
    tt_post_url = "https://tiktok.com/@testuser/video/123456789"
    posted_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  } | ConvertTo-Json

  $postResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $postBody
  Write-Host "Marked as posted:" ($postResponse | ConvertTo-Json)
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Post error: $errorText"
}
```

## 6. Test Account-Aware Video Fetching
```powershell
try {
  # Fetch videos for specific account
  $accountVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId" -Method GET
  Write-Host "Videos for account $accountId:" ($accountVideos | ConvertTo-Json)

  # Fetch ready to upload videos for account
  $readyVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=ready_to_upload" -Method GET
  Write-Host "Ready to upload videos:" ($readyVideos | ConvertTo-Json)
} catch {
  Write-Host "Fetch error: $($_.Exception.Message)"
}
```

## Happy Path Test: Concept -> Video -> Portal
```powershell
# Complete workflow test
try {
  Write-Host "=== HAPPY PATH TEST ==="
  
  # 1. Create account
  $account = @{ name = "HappyPathTest"; platform = "tiktok" } | ConvertTo-Json
  $accountResult = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method POST -ContentType "application/json" -Body $account
  $accountId = $accountResult.data.id
  Write-Host "✓ Created account: $accountId"

  # 2. Get concept
  $concepts = Invoke-RestMethod -Uri "http://localhost:3000/api/concepts" -Method GET
  $conceptId = $concepts.data[0].id
  Write-Host "✓ Using concept: $conceptId"

  # 3. Generate hooks
  $hooksBody = @{ concept_id = $conceptId } | ConvertTo-Json
  $hooksResult = Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/generate" -Method POST -ContentType "application/json" -Body $hooksBody
  Write-Host "✓ Generated hooks"

  # 4. Get hooks and generate script
  $hooks = Invoke-RestMethod -Uri "http://localhost:3000/api/hooks?concept_id=$conceptId" -Method GET
  $hookText = $hooks.data[0].hook_text
  
  $scriptBody = @{ concept_id = $conceptId; hook_text = $hookText } | ConvertTo-Json
  $scriptResult = Invoke-RestMethod -Uri "http://localhost:3000/api/scripts/generate" -Method POST -ContentType "application/json" -Body $scriptBody
  Write-Host "✓ Generated script"

  # 5. Generate variants
  $variantsBody = @{ concept_id = $conceptId } | ConvertTo-Json
  $variantsResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/generate" -Method POST -ContentType "application/json" -Body $variantsBody
  Write-Host "✓ Generated variants"

  # 6. Get variant and create video
  $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants?concept_id=$conceptId" -Method GET
  $variantId = $variants.data[0].id
  
  $video = @{
    account_id = $accountId
    variant_id = $variantId
    google_drive_url = "https://drive.google.com/file/d/HAPPYPATH123/view"
    status = "ready_to_upload"
    caption_used = "Happy path test video!"
    hashtags_used = "#test #happypath #fyp"
  } | ConvertTo-Json
  
  $videoResult = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method POST -ContentType "application/json" -Body $video
  $videoId = $videoResult.data.id
  Write-Host "✓ Created video: $videoId"

  # 7. Test portal fetch
  $portalVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=ready_to_upload" -Method GET
  Write-Host "✓ Portal shows $($portalVideos.data.Count) ready videos"

  # 8. Mark as posted
  $posted = @{
    status = "posted"
    tt_post_url = "https://tiktok.com/@happypath/video/987654321"
    posted_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  } | ConvertTo-Json
  
  $postedResult = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $posted
  Write-Host "✓ Marked as posted"

  Write-Host "=== HAPPY PATH COMPLETE ==="
  
} catch {
  Write-Host "❌ Happy path failed: $($_.Exception.Message)"
}
```
