-- Content Items Editing Engine — MVP Schema
-- Adds fields to support instruction-driven video editing:
-- raw input reference, edit plan, edit status, rendered output.

-- ══════════════════════════════════════════════════════════════════
-- 1. Editing engine fields on content_items
-- ══════════════════════════════════════════════════════════════════

-- Raw input video (may differ from raw_footage_url which is a Drive link)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS raw_video_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS raw_video_storage_path TEXT;

-- Free-form editing instructions (human-written or AI-refined)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS editing_instructions TEXT;

-- Structured edit plan (generated from editing_instructions + editor_notes_json + transcript)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS edit_plan_json JSONB;

-- Edit pipeline status
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS edit_status TEXT NOT NULL DEFAULT 'not_started';

-- Rendered output
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS rendered_video_url TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS rendered_video_storage_path TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS render_error TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS last_rendered_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════════
-- 2. CHECK constraint for edit_status
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE content_items
  DROP CONSTRAINT IF EXISTS chk_edit_status;

ALTER TABLE content_items
  ADD CONSTRAINT chk_edit_status CHECK (
    edit_status IN (
      'not_started',
      'planning',
      'ready_to_render',
      'rendering',
      'rendered',
      'failed'
    )
  );

-- ══════════════════════════════════════════════════════════════════
-- 3. Indexes for editing queries
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_content_items_edit_status
  ON content_items(workspace_id, edit_status)
  WHERE edit_status != 'not_started';
