-- Migration 036: Add idempotency key for hook_feedback events
-- Allows tracking which video triggered feedback and prevents duplicate counts

-- =============================================================================
-- A) Add source_video_id column to hook_feedback
-- =============================================================================

ALTER TABLE public.hook_feedback
ADD COLUMN IF NOT EXISTS source_video_id uuid NULL REFERENCES public.videos(id) ON DELETE CASCADE;

-- =============================================================================
-- B) Add unique constraint for idempotency
-- =============================================================================
-- Prevents the same video from triggering the same outcome on the same hook twice

CREATE UNIQUE INDEX IF NOT EXISTS idx_hook_feedback_idempotency
  ON public.hook_feedback(hook_id, source_video_id, outcome)
  WHERE source_video_id IS NOT NULL;

-- =============================================================================
-- C) Index for video lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_hook_feedback_video
  ON public.hook_feedback(source_video_id)
  WHERE source_video_id IS NOT NULL;
