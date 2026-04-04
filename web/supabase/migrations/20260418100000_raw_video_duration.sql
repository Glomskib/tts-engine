-- Add raw_video_duration_sec to content_items
-- Stores the actual duration of the uploaded raw video (in seconds)
-- so edit plan generation uses real bounds instead of a hardcoded default.

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS raw_video_duration_sec REAL;

COMMENT ON COLUMN content_items.raw_video_duration_sec
  IS 'Duration of the uploaded raw video in seconds, detected client-side from video metadata.';
