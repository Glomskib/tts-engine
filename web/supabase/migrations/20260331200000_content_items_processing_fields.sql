-- Content Items — extended processing fields for transcript + editor notes pipeline.
-- Adds columns for storing transcript text/json, editor notes text/json,
-- error tracking, raw footage received timestamp, and idempotency guard.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS transcript_text TEXT,
  ADD COLUMN IF NOT EXISTS transcript_json JSONB,
  ADD COLUMN IF NOT EXISTS transcript_error TEXT,
  ADD COLUMN IF NOT EXISTS editor_notes_text TEXT,
  ADD COLUMN IF NOT EXISTS editor_notes_json JSONB,
  ADD COLUMN IF NOT EXISTS editor_notes_error TEXT,
  ADD COLUMN IF NOT EXISTS raw_footage_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_processed_raw_file_id TEXT;

COMMENT ON COLUMN content_items.transcript_text IS 'Plain text transcript from Whisper';
COMMENT ON COLUMN content_items.transcript_json IS 'Timestamped segments array from Whisper';
COMMENT ON COLUMN content_items.transcript_error IS 'Last transcription error message';
COMMENT ON COLUMN content_items.editor_notes_text IS 'Human-readable markdown editor notes';
COMMENT ON COLUMN content_items.editor_notes_json IS 'Structured EditorNotesJSON for UI rendering';
COMMENT ON COLUMN content_items.editor_notes_error IS 'Last editor notes generation error';
COMMENT ON COLUMN content_items.raw_footage_received_at IS 'When raw footage was first matched';
COMMENT ON COLUMN content_items.last_processed_raw_file_id IS 'Drive file ID of last processed raw footage (idempotency)';

-- Index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_content_items_last_processed_file
  ON content_items(last_processed_raw_file_id)
  WHERE last_processed_raw_file_id IS NOT NULL;
