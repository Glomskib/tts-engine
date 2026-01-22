-- 010_videos_editor_claim.sql
-- Phase 8.3: Editor workflow with safe claiming

-- Add claim columns to videos table
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS claimed_by text NULL,
ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz NULL;

-- Index for queue queries by status and claim time
CREATE INDEX IF NOT EXISTS videos_status_claimed_at_idx
ON public.videos (status, claimed_at DESC);

-- Index for looking up videos by claimer
CREATE INDEX IF NOT EXISTS videos_claimed_by_idx
ON public.videos (claimed_by)
WHERE claimed_by IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.videos.claimed_by IS 'Editor identifier who claimed this video';
COMMENT ON COLUMN public.videos.claimed_at IS 'When the video was claimed';
COMMENT ON COLUMN public.videos.claim_expires_at IS 'When the claim expires (auto-release)';
