-- Content Items — transcript + editor notes processing status tracking
-- Enables the content-item-processing cron worker to claim and process items.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS transcript_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS editor_notes_status TEXT NOT NULL DEFAULT 'none';

-- Valid values: none | pending | processing | completed | failed

COMMENT ON COLUMN content_items.transcript_status IS 'none|pending|processing|completed|failed';
COMMENT ON COLUMN content_items.editor_notes_status IS 'none|pending|processing|completed|failed';

-- Index for the processing worker to find claimable items
CREATE INDEX IF NOT EXISTS idx_content_items_transcript_pending
  ON content_items(transcript_status)
  WHERE transcript_status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_content_items_editor_notes_pending
  ON content_items(editor_notes_status)
  WHERE editor_notes_status IN ('pending', 'processing');
