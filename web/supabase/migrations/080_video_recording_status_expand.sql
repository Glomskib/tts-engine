-- Expand recording_status check constraint to include script states
-- These are valid workflow states for videos awaiting scripts

-- Drop the old constraint
ALTER TABLE public.videos
DROP CONSTRAINT IF EXISTS videos_recording_status_check;

-- Add expanded constraint with new script-related states
ALTER TABLE public.videos
ADD CONSTRAINT videos_recording_status_check
CHECK (recording_status IN (
  'NOT_RECORDED',
  'NEEDS_SCRIPT',      -- Waiting for human to add script
  'GENERATING_SCRIPT', -- AI is generating script
  'RECORDED',
  'EDITED',
  'READY_TO_POST',
  'POSTED',
  'REJECTED'
));

-- Update column comment
COMMENT ON COLUMN public.videos.recording_status IS 'Execution workflow status: NEEDS_SCRIPT, GENERATING_SCRIPT, NOT_RECORDED, RECORDED, EDITED, READY_TO_POST, POSTED, REJECTED';
