-- Migration 035: Hook Suggestions Table
-- Purpose: Track pending hook suggestions from posted videos for admin review

-- =============================================================================
-- A) Create hook_suggestions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hook_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Source context
  source_video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  brand_name text NULL,

  -- Hook content
  hook_type text NOT NULL CHECK (hook_type IN ('spoken', 'visual', 'text')),
  hook_text text NOT NULL,
  hook_hash text NOT NULL,

  -- Review workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL,
  review_note text NULL
);

-- =============================================================================
-- B) Constraints and Indexes
-- =============================================================================

-- Unique constraint for idempotency: same video + hook_type + hook_hash cannot create duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_hook_suggestions_unique
  ON public.hook_suggestions(source_video_id, hook_type, hook_hash);

-- Index for admin review queue (pending suggestions by date)
CREATE INDEX IF NOT EXISTS idx_hook_suggestions_status_created
  ON public.hook_suggestions(status, created_at DESC);

-- Index for lookup by video
CREATE INDEX IF NOT EXISTS idx_hook_suggestions_video
  ON public.hook_suggestions(source_video_id);

-- =============================================================================
-- C) Update timestamp trigger
-- =============================================================================

-- Reuse existing trigger function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_hook_suggestions_updated_at ON public.hook_suggestions;
CREATE TRIGGER update_hook_suggestions_updated_at
  BEFORE UPDATE ON public.hook_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- D) RLS Policies (deny by default - service role access only)
-- =============================================================================

ALTER TABLE public.hook_suggestions ENABLE ROW LEVEL SECURITY;

-- No policies = deny all for non-service-role
-- Admin APIs will use supabaseAdmin (service role) to bypass RLS
