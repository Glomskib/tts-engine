-- Add nightly_draft_attempted_at to videos table
-- Prevents re-processing on re-run: stamped BEFORE upload attempt so even
-- if the process crashes mid-upload, the video won't be retried automatically.
-- Manual reset: UPDATE videos SET nightly_draft_attempted_at = NULL WHERE id = '<uuid>';

ALTER TABLE videos ADD COLUMN IF NOT EXISTS nightly_draft_attempted_at TIMESTAMPTZ;
