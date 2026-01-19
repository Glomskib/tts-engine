# Phase 7: Winner Scaling + Controlled Iteration - PowerShell Test Commands

## Setup: Run Migration First
```powershell
# Apply the Phase 7 migration in Supabase
# Copy and paste this SQL into your Supabase SQL editor:
```

```sql
-- Phase 7: Winner Scaling + Controlled Iteration
-- Add variant lineage and scaling batch support

-- Add lineage and scaling columns to variants table
DO $$
BEGIN
  -- Add parent_variant_id for variant lineage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'parent_variant_id') THEN
    ALTER TABLE public.variants ADD COLUMN parent_variant_id uuid NULL REFERENCES public.variants(id) ON DELETE SET NULL;
  END IF;
  
  -- Add iteration_group_id for scaling batches
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'iteration_group_id') THEN
    ALTER TABLE public.variants ADD COLUMN iteration_group_id uuid NULL;
  END IF;
  
  -- Add locked flag to prevent modifications
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'locked') THEN
    ALTER TABLE public.variants ADD COLUMN locked boolean NOT NULL DEFAULT false;
  END IF;
  
  -- Add change_type for scaling variants
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'change_type') THEN
    ALTER TABLE public.variants ADD COLUMN change_type text NULL;
  END IF;
  
  -- Add change_note for scaling details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'variants' AND column_name = 'change_note') THEN
    ALTER TABLE public.variants ADD COLUMN change_note text NULL;
  END IF;
END $$;

-- Create iteration_groups table for scaling batches
CREATE TABLE IF NOT EXISTS public.iteration_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  plan_json jsonb NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraint for iteration_group_id after table creation
DO $$
BEGIN
  -- Check if the foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_variants_iteration_group_id' 
    AND table_name = 'variants'
  ) THEN
    ALTER TABLE public.variants 
    ADD CONSTRAINT fk_variants_iteration_group_id 
    FOREIGN KEY (iteration_group_id) REFERENCES public.iteration_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_variants_parent ON public.variants(parent_variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_iteration_group ON public.variants(iteration_group_id);
CREATE INDEX IF NOT EXISTS idx_iteration_groups_winner ON public.iteration_groups(winner_variant_id);
CREATE INDEX IF NOT EXISTS idx_iteration_groups_concept ON public.iteration_groups(concept_id);
```

## 1. Promote a Variant to Winner
```powershell
try {
  # Get a variant to promote
  $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
  $variantId = $variants.data[0].id
  Write-Host "Promoting variant: $variantId"

  $promoteBody = @{
    variant_id = $variantId
    note = "High engagement and conversion rate"
  } | ConvertTo-Json

  $promoteResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/promote" -Method POST -ContentType "application/json" -Body $promoteBody
  Write-Host "Promotion result:" ($promoteResponse | ConvertTo-Json)
  
  if ($promoteResponse.ok) {
    Write-Host "✓ Variant successfully promoted to winner"
  }
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Promotion error: $errorText"
}
```

## 2. Scale a Winner with Multiple Change Types
```powershell
try {
  # Get accounts for video creation
  $accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  $accountIds = $accounts.data | Select-Object -First 2 | ForEach-Object { $_.id }
  
  Write-Host "Using accounts: $($accountIds -join ', ')"

  $scaleBody = @{
    winner_variant_id = $variantId
    change_types = @("hook", "cta")
    count_per_type = 3
    account_ids = $accountIds
    google_drive_url = "https://drive.google.com/drive/folders/SCALING_BATCH_123"
  } | ConvertTo-Json

  $scaleResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $scaleBody
  Write-Host "Scaling result:" ($scaleResponse | ConvertTo-Json)
  
  if ($scaleResponse.ok) {
    $iterationGroupId = $scaleResponse.data.iteration_group.id
    $variantsCreated = $scaleResponse.summary.variants_created
    $videosCreated = $scaleResponse.summary.videos_created
    
    Write-Host "✓ Scaling complete!"
    Write-Host "  - Iteration Group: $iterationGroupId"
    Write-Host "  - Variants Created: $variantsCreated"
    Write-Host "  - Videos Created: $videosCreated"
    Write-Host "  - Editor Brief Available: $($scaleResponse.editor_brief -ne $null)"
  }
} catch {
  $errorResponse = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($errorResponse)
  $errorText = $reader.ReadToEnd()
  Write-Host "Scaling error: $errorText"
}
```

## 3. Verify Lineage Endpoint
```powershell
try {
  # Check lineage for the original winner
  $lineageResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/lineage?variant_id=$variantId" -Method GET
  Write-Host "Lineage for winner variant:" ($lineageResponse | ConvertTo-Json -Depth 3)
  
  if ($lineageResponse.ok) {
    $lineage = $lineageResponse.data
    Write-Host "✓ Lineage retrieved successfully"
    Write-Host "  - Root Variant: $($lineage.root_variant.id)"
    Write-Host "  - Child Variants: $($lineage.child_variants.Count)"
    Write-Host "  - Iteration Groups: $($lineage.iteration_groups.Count)"
    Write-Host "  - Total Videos: $($lineage.all_videos.Count)"
    Write-Host "  - Is Winner: $($lineage.lineage_stats.is_winner)"
    
    # Test lineage for a child variant
    if ($lineage.child_variants.Count -gt 0) {
      $childId = $lineage.child_variants[0].id
      $childLineage = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/lineage?variant_id=$childId" -Method GET
      Write-Host "✓ Child variant lineage also works - Parent: $($childLineage.data.parent_variant.id)"
    }
  }
} catch {
  Write-Host "Lineage error: $($_.Exception.Message)"
}
```

## 4. Verify Account Queue Shows Created Videos
```powershell
try {
  # Check each account's needs_edit queue
  foreach ($accountId in $accountIds) {
    $needsEditVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$accountId&status=needs_edit" -Method GET
    
    if ($needsEditVideos.ok) {
      Write-Host "✓ Account $accountId has $($needsEditVideos.data.Count) videos needing edit"
      
      # Show details of first video
      if ($needsEditVideos.data.Count -gt 0) {
        $video = $needsEditVideos.data[0]
        Write-Host "  - Video ID: $($video.id)"
        Write-Host "  - Variant ID: $($video.variant_id)"
        Write-Host "  - Google Drive URL: $($video.google_drive_url)"
        Write-Host "  - Caption: $($video.caption_used)"
        Write-Host "  - Hashtags: $($video.hashtags_used)"
      }
    }
  }
} catch {
  Write-Host "Queue check error: $($_.Exception.Message)"
}
```

## 5. Test Video Status Progression
```powershell
try {
  # Get a needs_edit video and move it through the workflow
  $needsEditVideos = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$($accountIds[0])&status=needs_edit" -Method GET
  
  if ($needsEditVideos.ok -and $needsEditVideos.data.Count -gt 0) {
    $videoId = $needsEditVideos.data[0].id
    Write-Host "Testing workflow with video: $videoId"
    
    # Mark as ready to upload
    $readyBody = @{ status = "ready_to_upload" } | ConvertTo-Json
    $readyResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $readyBody
    
    if ($readyResponse.ok) {
      Write-Host "✓ Video marked as ready to upload"
      
      # Mark as posted
      $postedBody = @{
        status = "posted"
        tt_post_url = "https://tiktok.com/@testuser/video/scaling123"
        posted_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
      } | ConvertTo-Json
      
      $postedResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$videoId" -Method PATCH -ContentType "application/json" -Body $postedBody
      
      if ($postedResponse.ok) {
        Write-Host "✓ Video marked as posted"
      }
    }
  }
} catch {
  Write-Host "Workflow test error: $($_.Exception.Message)"
}
```

## 6. Test Advanced Scaling Scenarios
```powershell
try {
  Write-Host "=== ADVANCED SCALING TEST ==="
  
  # Scale with all change types
  $advancedScaleBody = @{
    winner_variant_id = $variantId
    change_types = @("hook", "on_screen_text", "cta", "caption", "edit_style")
    count_per_type = 2
    google_drive_url = "https://drive.google.com/drive/folders/ADVANCED_SCALING"
  } | ConvertTo-Json

  $advancedScale = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $advancedScaleBody
  
  if ($advancedScale.ok) {
    Write-Host "✓ Advanced scaling created $($advancedScale.summary.variants_created) variants"
    Write-Host "✓ Editor brief includes:"
    Write-Host "  - B-Roll: $($advancedScale.editor_brief.b_roll -join ', ')"
    Write-Host "  - Style: $($advancedScale.editor_brief.on_screen_style)"
    Write-Host "  - Pacing: $($advancedScale.editor_brief.pacing)"
    Write-Host "  - Do's: $($advancedScale.editor_brief.dos -join ', ')"
    Write-Host "  - Don'ts: $($advancedScale.editor_brief.donts -join ', ')"
  }
} catch {
  Write-Host "Advanced scaling error: $($_.Exception.Message)"
}
```

## Complete Happy Path Test
```powershell
Write-Host "=== PHASE 7 WINNER SCALING HAPPY PATH ==="

try {
  # 1. Get a variant and promote it
  $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
  $testVariantId = $variants.data[0].id
  
  $promote = @{ variant_id = $testVariantId; note = "Happy path test winner" } | ConvertTo-Json
  $promoteResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/promote" -Method POST -ContentType "application/json" -Body $promote
  Write-Host "✓ Promoted variant to winner"

  # 2. Get accounts for scaling
  $accounts = Invoke-RestMethod -Uri "http://localhost:3000/api/accounts" -Method GET
  $testAccountIds = $accounts.data | Select-Object -First 1 | ForEach-Object { $_.id }

  # 3. Scale the winner
  $scale = @{
    winner_variant_id = $testVariantId
    change_types = @("hook", "cta")
    count_per_type = 2
    account_ids = $testAccountIds
    google_drive_url = "https://drive.google.com/drive/folders/HAPPY_PATH_TEST"
  } | ConvertTo-Json
  
  $scaleResult = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/scale" -Method POST -ContentType "application/json" -Body $scale
  Write-Host "✓ Scaled winner - created $($scaleResult.summary.variants_created) variants and $($scaleResult.summary.videos_created) videos"

  # 4. Verify lineage
  $lineage = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/lineage?variant_id=$testVariantId" -Method GET
  Write-Host "✓ Lineage shows $($lineage.data.child_variants.Count) children and $($lineage.data.iteration_groups.Count) iteration groups"

  # 5. Check account queue
  $queue = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?account_id=$($testAccountIds[0])&status=needs_edit" -Method GET
  Write-Host "✓ Account queue shows $($queue.data.Count) videos needing edit"

  # 6. Move a video through workflow
  if ($queue.data.Count -gt 0) {
    $testVideoId = $queue.data[0].id
    
    $ready = @{ status = "ready_to_upload" } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$testVideoId" -Method PATCH -ContentType "application/json" -Body $ready | Out-Null
    
    $posted = @{
      status = "posted"
      tt_post_url = "https://tiktok.com/@happypath/video/scaling456"
      posted_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:3000/api/videos/$testVideoId" -Method PATCH -ContentType "application/json" -Body $posted | Out-Null
    Write-Host "✓ Moved video through needs_edit → ready_to_upload → posted"
  }

  Write-Host "=== PHASE 7 HAPPY PATH COMPLETE ==="
} catch {
  Write-Host "❌ Happy path failed: $($_.Exception.Message)"
}
```
