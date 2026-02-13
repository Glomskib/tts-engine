-- 110: Add render tracking columns and AI_RENDERING status to videos table
-- Stores Runway (or other provider) render task IDs for automated video generation

ALTER TABLE videos ADD COLUMN IF NOT EXISTS render_task_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS render_provider TEXT;

COMMENT ON COLUMN videos.render_task_id IS 'External render task ID (e.g. Runway task ID)';
COMMENT ON COLUMN videos.render_provider IS 'Render provider name (e.g. runway)';

-- Expand recording_status check constraint to include AI_RENDERING
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_recording_status_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_recording_status_check
CHECK (recording_status IN (
  'NOT_RECORDED',
  'NEEDS_SCRIPT',
  'GENERATING_SCRIPT',
  'AI_RENDERING',
  'RECORDED',
  'EDITED',
  'READY_TO_POST',
  'POSTED',
  'REJECTED'
));
