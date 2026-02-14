-- 3-tier review: APPROVED_NEEDS_EDITS + approved_at/approved_by/edit_notes

-- Expand recording_status constraint to include APPROVED_NEEDS_EDITS
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
  'APPROVED_NEEDS_EDITS',
  'READY_TO_POST',
  'POSTED',
  'REJECTED'
));

-- New columns for review tracking
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS edit_notes TEXT;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS approved_by TEXT;

COMMENT ON COLUMN videos.edit_notes IS 'Notes on what edits are needed (set when APPROVED_NEEDS_EDITS)';
COMMENT ON COLUMN videos.approved_at IS 'Timestamp of review approval (needs-edits or full approve)';
COMMENT ON COLUMN videos.approved_by IS 'Email/ID of reviewer who approved';
