-- 113: Add compose tracking columns and READY_FOR_REVIEW status
-- Supports the check-renders cron auto-compose pipeline

ALTER TABLE videos ADD COLUMN IF NOT EXISTS compose_render_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS runway_video_url TEXT;

COMMENT ON COLUMN videos.compose_render_id IS 'Shotstack compose render ID for text overlay + audio composition';
COMMENT ON COLUMN videos.runway_video_url IS 'Re-hosted Runway video URL in Supabase storage';

-- Expand recording_status to include READY_FOR_REVIEW
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_recording_status_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_recording_status_check
CHECK (recording_status IN (
  'NOT_RECORDED',
  'NEEDS_SCRIPT',
  'GENERATING_SCRIPT',
  'AI_RENDERING',
  'READY_FOR_REVIEW',
  'RECORDED',
  'EDITED',
  'READY_TO_POST',
  'POSTED',
  'REJECTED'
));
