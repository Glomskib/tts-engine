-- ============================================================
-- Feedback Inbox: ff_feedback_items
-- Migration: 20260323200000_ff_feedback_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ff_feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Source & classification
  source text NOT NULL DEFAULT 'widget',     -- 'widget' | 'api' | 'email' | 'slack' | 'manual'
  type text NOT NULL DEFAULT 'other',        -- 'bug' | 'feature' | 'improvement' | 'support' | 'other'

  -- Content
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  page text,                                 -- URL path (no domain)
  device text,                               -- 'Desktop' | 'Mobile' | 'Tablet'

  -- Reporter
  reporter_email text,
  reporter_user_id uuid,

  -- Workflow
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'in_progress', 'shipped', 'rejected')),
  priority integer NOT NULL DEFAULT 3
    CHECK (priority >= 1 AND priority <= 5), -- 1=critical, 5=low
  assignee text,                             -- free-text name/handle
  tags text[] NOT NULL DEFAULT '{}',

  -- Metadata
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_feedback_id uuid                      -- soft link to user_feedback row
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ff_feedback_items_status
  ON public.ff_feedback_items (status);
CREATE INDEX IF NOT EXISTS idx_ff_feedback_items_type
  ON public.ff_feedback_items (type);
CREATE INDEX IF NOT EXISTS idx_ff_feedback_items_priority
  ON public.ff_feedback_items (priority);
CREATE INDEX IF NOT EXISTS idx_ff_feedback_items_created_at
  ON public.ff_feedback_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ff_feedback_items_reporter_user_id
  ON public.ff_feedback_items (reporter_user_id);

-- RLS
ALTER TABLE public.ff_feedback_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_feedback_items_service_write" ON public.ff_feedback_items;
CREATE POLICY "ff_feedback_items_service_write" ON public.ff_feedback_items
  FOR ALL USING (public.is_service_role());

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER ff_feedback_items_updated_at
  BEFORE UPDATE ON public.ff_feedback_items
  FOR EACH ROW EXECUTE FUNCTION public.ff_set_updated_at();
