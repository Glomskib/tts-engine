# Videos Phase 5 - PowerShell Test Commands

## Setup
```powershell
# Get a variant_id
$variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$variantId = $variants.data[0].id
Write-Host "Using variant ID: $variantId"
```

## 1. Create a video
```powershell
try {
  $createBody = @{
    variant_id = $variantId
    google_drive_url = "https://drive.google.com/file/d/TEST123456/view"
    status = "draft"
    caption_used = "Amazing supplement results! 💊 #health #supplements"
    hashtags_used = "#supplement #health #tiktokmademebuyit #fyp"
  } | ConvertTo-Json

  $createResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method POST -ContentType "application/json" -Body $createBody
  Write-Host "Created video:" $createResponse | ConvertTo-Json
  $videoId = $createResponse.data.id
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Create error: $errorText"
}
```

## 2. Patch status to ready_to_upload
```powershell
try {
  $patchBody = @{
    status = "ready_to_upload"
  } | ConvertTo-Json

  $patchResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $patchBody
  Write-Host "Updated to ready_to_upload:" $patchResponse | ConvertTo-Json
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Patch error: $errorText"
}
```

## 3. Patch to posted with tt_post_url and posted_at
```powershell
try {
  $postBody = @{
    status = "posted"
    tt_post_url = "https://tiktok.com/@user/video/123456789"
    posted_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  } | ConvertTo-Json

  $postResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $postBody
  Write-Host "Marked as posted:" $postResponse | ConvertTo-Json
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Post error: $errorText"
}
```

## 4. Fetch queue (ready_to_upload videos)
```powershell
try {
  $queueResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?status=ready_to_upload" -Method GET
  Write-Host "Ready to upload queue:" $queueResponse | ConvertTo-Json
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Queue fetch error: $errorText"
}
```

## 5. Test filtering by variant_id
```powershell
try {
  $variantVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?variant_id=$variantId" -Method GET
  Write-Host "Videos for variant $variantId:" $variantVideos | ConvertTo-Json
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Variant filter error: $errorText"
}
```

## Complete Test Sequence
```powershell
# Run all tests in sequence
$variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$variantId = $variants.data[0].id

# Create -> Update to ready -> Mark posted -> Check queue
$createBody = @{ variant_id = $variantId; google_drive_url = "https://drive.google.com/file/d/TEST123/view"; status = "draft"; caption_used = "Test caption"; hashtags_used = "#test" } | ConvertTo-Json
$video = Invoke-RestMethod -Uri "http://localhost:3000/api/videos" -Method POST -ContentType "application/json" -Body $createBody

$readyBody = @{ status = "ready_to_upload" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$($video.data.id)" -Method PATCH -ContentType "application/json" -Body $readyBody

$queue = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?status=ready_to_upload" -Method GET
Write-Host "Queue count:" $queue.data.Count
```
