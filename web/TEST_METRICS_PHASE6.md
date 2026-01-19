# Phase 6: Performance Tracking - PowerShell Test Commands

## Setup: Run Migration First
```powershell
# Apply the Phase 6 migration in Supabase
# Copy and paste this SQL into your Supabase SQL editor:
```

```sql
-- Phase 6: Video Performance Tracking and Winner Promotion
-- Create video_metrics table for daily performance snapshots

CREATE TABLE IF NOT EXISTS public.video_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  account_id uuid,
  metric_date date NOT NULL,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  clicks integer DEFAULT 0,
  orders integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(video_id, metric_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_metrics_account_date ON public.video_metrics(account_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_video_metrics_video_date ON public.video_metrics(video_id, metric_date);

-- Add performance tracking columns to videos table (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'views_total') THEN
    ALTER TABLE public.videos ADD COLUMN views_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'likes_total') THEN
    ALTER TABLE public.videos ADD COLUMN likes_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'comments_total') THEN
    ALTER TABLE public.videos ADD COLUMN comments_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'shares_total') THEN
    ALTER TABLE public.videos ADD COLUMN shares_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'revenue_total') THEN
    ALTER TABLE public.videos ADD COLUMN revenue_total numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'orders_total') THEN
    ALTER TABLE public.videos ADD COLUMN orders_total integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'last_metric_at') THEN
    ALTER TABLE public.videos ADD COLUMN last_metric_at timestamptz;
  END IF;
END $$;

-- Add winner promotion columns to variants table (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'score') THEN
    ALTER TABLE public.variants ADD COLUMN score numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'is_winner') THEN
    ALTER TABLE public.variants ADD COLUMN is_winner boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'winner_reason') THEN
    ALTER TABLE public.variants ADD COLUMN winner_reason text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'promoted_at') THEN
    ALTER TABLE public.variants ADD COLUMN promoted_at timestamptz;
  END IF;
END $$;
```

## 1. Get Account ID and Posted Videos
```powershell
try {
  # Get accounts
  $accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  $accountId = $accounts.data[0].id
  Write-Host "Using account: $accountId"

  # Get posted videos for this account
  $videos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=posted" -Method GET
  Write-Host "Posted videos count: $($videos.data.Count)"
  
  if ($videos.data.Count -gt 0) {
    $videoId = $videos.data[0].id
    Write-Host "Using video: $videoId"
  } else {
    Write-Host "No posted videos found. Create and post a video first."
  }
} catch {
  Write-Host "Error getting account/videos: $($_.Exception.Message)"
}
```

## 2. Post Today's Metrics for a Video
```powershell
try {
  $today = Get-Date -Format "yyyy-MM-dd"
  
  $metricsBody = @{
    video_id = $videoId
    account_id = $accountId
    metric_date = $today
    views = 1250
    likes = 89
    comments = 23
    shares = 12
    saves = 45
    clicks = 67
    orders = 2
    revenue = 89.50
  } | ConvertTo-Json

  $metricsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics" -Method POST -ContentType "application/json" -Body $metricsBody
  Write-Host "Metrics saved:" ($metricsResponse | ConvertTo-Json)
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Metrics error: $errorText"
}
```

## 3. Add More Metrics for Different Days
```powershell
try {
  # Yesterday's metrics
  $yesterday = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
  
  $yesterdayMetrics = @{
    video_id = $videoId
    account_id = $accountId
    metric_date = $yesterday
    views = 980
    likes = 67
    comments = 18
    shares = 8
    saves = 34
    clicks = 45
    orders = 1
    revenue = 45.00
  } | ConvertTo-Json

  $response1 = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics" -Method POST -ContentType "application/json" -Body $yesterdayMetrics
  Write-Host "Yesterday metrics saved"

  # Day before yesterday
  $dayBefore = (Get-Date).AddDays(-2).ToString("yyyy-MM-dd")
  
  $dayBeforeMetrics = @{
    video_id = $videoId
    account_id = $accountId
    metric_date = $dayBefore
    views = 750
    likes = 45
    comments = 12
    shares = 5
    saves = 23
    clicks = 30
    orders = 0
    revenue = 0
  } | ConvertTo-Json

  $response2 = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics" -Method POST -ContentType "application/json" -Body $dayBeforeMetrics
  Write-Host "Day before metrics saved"
} catch {
  Write-Host "Error adding historical metrics: $($_.Exception.Message)"
}
```

## 4. Fetch Metrics by Account ID and Date Range
```powershell
try {
  # Get last 7 days of metrics for account
  $from = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")
  $to = (Get-Date).ToString("yyyy-MM-dd")
  
  $metricsData = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics?account_id=$accountId&from=$from&to=$to" -Method GET
  Write-Host "Metrics for last 7 days:" ($metricsData | ConvertTo-Json)
  
  # Get metrics for specific video
  $videoMetrics = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics?video_id=$videoId" -Method GET
  Write-Host "All metrics for video $videoId:" ($videoMetrics | ConvertTo-Json)
} catch {
  Write-Host "Error fetching metrics: $($_.Exception.Message)"
}
```

## 5. Run Winner Evaluation
```powershell
try {
  # Evaluate winners for this account over last 7 days
  $evaluateBody = @{
    account_id = $accountId
    days = 7
  } | ConvertTo-Json

  $evaluateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/evaluate" -Method POST -ContentType "application/json" -Body $evaluateBody
  Write-Host "Winner evaluation results:" ($evaluateResponse | ConvertTo-Json)
  
  if ($evaluateResponse.winners_count -gt 0) {
    Write-Host "🏆 WINNERS FOUND:"
    foreach ($winner in $evaluateResponse.winners) {
      Write-Host "  - Variant: $($winner.variant_id)"
      Write-Host "    Video: $($winner.video_id)"
      Write-Host "    Score: $($winner.score)"
      Write-Host "    Reason: $($winner.reason)"
      Write-Host ""
    }
  } else {
    Write-Host "No winners found with current thresholds"
  }
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Evaluation error: $errorText"
}
```

## 6. Test High-Performance Metrics (Force Winner)
```powershell
try {
  # Add high-performance metrics to trigger winner status
  $today = Get-Date -Format "yyyy-MM-dd"
  
  $winnerMetrics = @{
    video_id = $videoId
    account_id = $accountId
    metric_date = $today
    views = 5000
    likes = 450
    comments = 120
    shares = 80
    saves = 200
    clicks = 300
    orders = 5  # This should trigger winner (>= 3 orders)
    revenue = 250.00  # This should also trigger winner (>= 50 revenue)
  } | ConvertTo-Json

  $winnerResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics" -Method POST -ContentType "application/json" -Body $winnerMetrics
  Write-Host "High-performance metrics saved"

  # Re-evaluate winners
  $reevaluateBody = @{
    account_id = $accountId
    days = 7
  } | ConvertTo-Json

  $reevaluateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/evaluate" -Method POST -ContentType "application/json" -Body $reevaluateBody
  Write-Host "Re-evaluation after high metrics:" ($reevaluateResponse | ConvertTo-Json)
} catch {
  Write-Host "Error with winner test: $($_.Exception.Message)"
}
```

## 7. Verify Updated Video Totals
```powershell
try {
  # Check if video totals were updated
  $updatedVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=posted" -Method GET
  
  foreach ($video in $updatedVideos.data) {
    Write-Host "Video $($video.id.Substring(0,8)):"
    Write-Host "  Views Total: $($video.views_total)"
    Write-Host "  Likes Total: $($video.likes_total)"
    Write-Host "  Orders Total: $($video.orders_total)"
    Write-Host "  Revenue Total: $($video.revenue_total)"
    Write-Host "  Last Metric: $($video.last_metric_at)"
    Write-Host ""
  }
} catch {
  Write-Host "Error checking video totals: $($_.Exception.Message)"
}
```

## Complete Happy Path Test
```powershell
Write-Host "=== PHASE 6 PERFORMANCE TRACKING HAPPY PATH ==="

try {
  # 1. Get account and video
  $accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  $accountId = $accounts.data[0].id
  
  $videos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=posted" -Method GET
  if ($videos.data.Count -eq 0) {
    Write-Host "❌ No posted videos found. Create and post a video first."
    exit
  }
  $videoId = $videos.data[0].id
  Write-Host "✓ Using account: $accountId, video: $videoId"

  # 2. Add metrics for 3 days
  for ($i = 0; $i -lt 3; $i++) {
    $date = (Get-Date).AddDays(-$i).ToString("yyyy-MM-dd")
    $metrics = @{
      video_id = $videoId
      account_id = $accountId
      metric_date = $date
      views = 1000 + ($i * 500)
      likes = 50 + ($i * 25)
      comments = 10 + ($i * 5)
      shares = 5 + ($i * 3)
      orders = $i + 1
      revenue = ($i + 1) * 25.0
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:3000/api/metrics" -Method POST -ContentType "application/json" -Body $metrics | Out-Null
  }
  Write-Host "✓ Added 3 days of metrics"

  # 3. Fetch metrics
  $allMetrics = Invoke-RestMethod -Uri "http://localhost:3000/api/metrics?video_id=$videoId" -Method GET
  Write-Host "✓ Retrieved $($allMetrics.data.Count) metric records"

  # 4. Evaluate winners
  $evaluation = @{ account_id = $accountId; days = 7 } | ConvertTo-Json
  $evalResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/evaluate" -Method POST -ContentType "application/json" -Body $evaluation
  Write-Host "✓ Evaluated $($evalResult.evaluated_count) variants, found $($evalResult.winners_count) winners"

  # 5. Check updated totals
  $updatedVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=posted" -Method GET
  $video = $updatedVideos.data | Where-Object { $_.id -eq $videoId }
  Write-Host "✓ Video totals updated - Views: $($video.views_total), Orders: $($video.orders_total)"

  Write-Host "=== PHASE 6 HAPPY PATH COMPLETE ==="
} catch {
  Write-Host "❌ Happy path failed: $($_.Exception.Message)"
}
```
