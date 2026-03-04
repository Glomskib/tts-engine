-- Content Items — additional Drive media fields for Model 2 (no raw upload)
-- Adds columns for tracking raw footage and editor notes drive references.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS raw_footage_drive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_footage_url TEXT,
  ADD COLUMN IF NOT EXISTS editor_notes_drive_doc_id TEXT;

-- Index for intake worker dedup lookup
CREATE INDEX IF NOT EXISTS idx_content_items_raw_footage_file
  ON content_items(raw_footage_drive_file_id)
  WHERE raw_footage_drive_file_id IS NOT NULL;
