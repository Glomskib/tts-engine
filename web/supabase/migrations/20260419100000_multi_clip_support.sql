-- Multi-clip editing support
-- Adds clip ordering and trim fields to content_item_assets table.
-- Clips are stored as kind='raw_clip' with sequence_index for ordering.

ALTER TABLE content_item_assets
  ADD COLUMN IF NOT EXISTS sequence_index INTEGER,
  ADD COLUMN IF NOT EXISTS trim_start_sec REAL,
  ADD COLUMN IF NOT EXISTS trim_end_sec REAL,
  ADD COLUMN IF NOT EXISTS duration_sec REAL;

-- Index for efficient clip ordering queries
CREATE INDEX IF NOT EXISTS idx_content_item_assets_clip_order
  ON content_item_assets (content_item_id, kind, sequence_index)
  WHERE kind = 'raw_clip';
