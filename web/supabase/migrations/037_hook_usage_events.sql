-- Migration 037: Hook Usage Events for Idempotent Posted Counts
-- Purpose: Track when hooks are used in posted videos to enable idempotent count increments

-- =============================================================================
-- A) Create hook_usage_events table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hook_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- References
  hook_id uuid NOT NULL REFERENCES public.proven_hooks(id) ON DELETE CASCADE,
  source_video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,

  -- Event type (currently only 'posted', but flexible for future use)
  event_type text NOT NULL DEFAULT 'posted'
);

-- =============================================================================
-- B) Constraints and Indexes
-- =============================================================================

-- Unique constraint for idempotency: same hook + video + event_type cannot create duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_hook_usage_events_idempotency
  ON public.hook_usage_events(hook_id, source_video_id, event_type);

-- Index for video lookups
CREATE INDEX IF NOT EXISTS idx_hook_usage_events_video
  ON public.hook_usage_events(source_video_id);

-- =============================================================================
-- C) RLS Policies (deny by default - service role access only)
-- =============================================================================

ALTER TABLE public.hook_usage_events ENABLE ROW LEVEL SECURITY;

-- No policies = deny all for non-service-role
-- Execution route uses supabaseAdmin (service role) to bypass RLS
