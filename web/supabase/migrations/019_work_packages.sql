-- Migration 019: Work packages and auto-assignment columns
-- Adds assignment state machine columns for dispatch/expire workflow

-- Add new columns to videos table (non-destructive)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS work_lane text NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS work_priority int NOT NULL DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS assigned_ttl_minutes int NOT NULL DEFAULT 240;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS assigned_expires_at timestamptz NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS assignment_state text NOT NULL DEFAULT 'UNASSIGNED';

-- Add constraint for assignment_state (UNASSIGNED | ASSIGNED | EXPIRED | COMPLETED)
-- Using DO block to safely add constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'videos_assignment_state_check'
  ) THEN
    ALTER TABLE public.videos ADD CONSTRAINT videos_assignment_state_check
      CHECK (assignment_state IN ('UNASSIGNED', 'ASSIGNED', 'EXPIRED', 'COMPLETED'));
  END IF;
END $$;

-- Add index for queue-based queries (assignment_state, assigned_role, assigned_expires_at)
-- Note: assigned_role was added in migration 018 as assigned_by (using that name for now)
-- We may need to add assigned_role separately if needed
CREATE INDEX IF NOT EXISTS idx_videos_assignment_queue
  ON public.videos (assignment_state, assigned_to, assigned_expires_at);

-- Add index for user-specific assignment lookup
CREATE INDEX IF NOT EXISTS idx_videos_assigned_user_state
  ON public.videos (assigned_to, assignment_state);

-- Add index for expired assignment scanning
CREATE INDEX IF NOT EXISTS idx_videos_assignment_expires
  ON public.videos (assignment_state, assigned_expires_at)
  WHERE assignment_state = 'ASSIGNED';

-- Add assigned_role column if not exists (separate from claim_role)
-- This tracks what role the video was assigned FOR (e.g., assigned to recorder for recording)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS assigned_role text NULL;

-- RLS policies: Same pattern as 018
-- Users can see their own assignments
DO $$
BEGIN
  -- Drop policy if exists and recreate
  DROP POLICY IF EXISTS "Users can view their assigned videos" ON public.videos;

  CREATE POLICY "Users can view their assigned videos"
    ON public.videos
    FOR SELECT
    TO authenticated
    USING (assigned_to = auth.uid() OR assigned_to IS NULL);

EXCEPTION WHEN OTHERS THEN
  -- Policy may already exist with different definition, that's OK
  NULL;
END $$;

-- Comment for documentation
COMMENT ON COLUMN public.videos.assignment_state IS 'Assignment state machine: UNASSIGNED (available) -> ASSIGNED (dispatched) -> EXPIRED/COMPLETED';
COMMENT ON COLUMN public.videos.assigned_expires_at IS 'When the current assignment expires (TTL-based)';
COMMENT ON COLUMN public.videos.assigned_ttl_minutes IS 'Default TTL for assignments on this video (configurable per-video)';
COMMENT ON COLUMN public.videos.work_lane IS 'Derived work lane: recorder|editor|uploader (optional cached value)';
COMMENT ON COLUMN public.videos.work_priority IS 'Cached priority score for efficient sorting';
COMMENT ON COLUMN public.videos.assigned_role IS 'Role the video was assigned for (recorder/editor/uploader)';
