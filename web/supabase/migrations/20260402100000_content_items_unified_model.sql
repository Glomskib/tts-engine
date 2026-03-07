-- Content Items Unified Model Migration
-- Adds fields needed to make content_items the canonical object for all content work:
-- pipeline, planner/calendar, script generation, and research/winners flows.
--
-- No tables are dropped. Existing features continue working.
-- New fields allow content_items to replace filtered reads of other tables over time.

-- ══════════════════════════════════════════════════════════════════
-- 1. Add unified fields to content_items
-- ══════════════════════════════════════════════════════════════════

-- Source tracking: where did this content item originate?
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source_type TEXT;
  -- values: manual | script_generator | winner_import | product_research | calendar
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source_ref_id TEXT;
  -- FK-like reference to the originating record (winner_id, skit_id, etc.)

-- Script fields
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS primary_hook TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS script_text TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS script_json JSONB;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS creative_notes TEXT;

-- Scheduling fields (replaces separate scheduled_posts for content_items)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS posting_account_id UUID;

-- Posting confirmation fields
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS post_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS posted_platform TEXT;

-- Pipeline bridge: map content_item status to recording_status for pipeline views
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS recording_status TEXT;

-- Created-by for audit trail (workspace_id is the owner, created_by is the actor)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════════════
-- 2. Add 'scripted' and 'scheduled' to valid statuses
-- ══════════════════════════════════════════════════════════════════
-- No enum constraint exists on the status column (it's TEXT with a default).
-- The type system enforces this via TypeScript. No SQL change needed.

-- ══════════════════════════════════════════════════════════════════
-- 3. Indexes for new query patterns
-- ══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_content_items_scheduled
  ON content_items(workspace_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_source
  ON content_items(workspace_id, source_type)
  WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_recording_status
  ON content_items(workspace_id, recording_status)
  WHERE recording_status IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
-- 4. content_item_events — lightweight audit log
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
    -- status_changed | script_generated | scheduled | posted | created
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_value TEXT,
  to_value TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ci_events_item
  ON content_item_events(content_item_id, created_at DESC);

-- RLS
ALTER TABLE content_item_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cie_select ON content_item_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM content_items WHERE id = content_item_id AND workspace_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY cie_service ON content_item_events FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
