-- 111: Add AI_RENDERING to recording_status check constraint
-- Required for automated Runway video render pipeline

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
