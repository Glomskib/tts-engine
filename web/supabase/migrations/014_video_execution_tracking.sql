-- 014_video_execution_tracking.sql
-- Add execution tracking fields to videos table for Script → Video workflow

-- Add execution tracking columns
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'NOT_RECORDED',
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ready_to_post_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS recording_notes text NULL,
  ADD COLUMN IF NOT EXISTS editor_notes text NULL,
  ADD COLUMN IF NOT EXISTS uploader_notes text NULL,
  ADD COLUMN IF NOT EXISTS posted_url text NULL,
  ADD COLUMN IF NOT EXISTS posted_platform text NULL,
  ADD COLUMN IF NOT EXISTS posted_account text NULL,
  ADD COLUMN IF NOT EXISTS posted_at_local text NULL,
  ADD COLUMN IF NOT EXISTS posting_error text NULL,
  ADD COLUMN IF NOT EXISTS last_status_changed_at timestamptz NOT NULL DEFAULT now();

-- Add constraint for valid recording_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'videos_recording_status_check'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_recording_status_check
      CHECK (recording_status IN ('NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED'));
  END IF;
END $$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_videos_recording_status ON public.videos(recording_status);
CREATE INDEX IF NOT EXISTS idx_videos_posted_platform ON public.videos(posted_platform) WHERE posted_platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_last_status_changed_at ON public.videos(last_status_changed_at DESC);

-- Create trigger function to update last_status_changed_at on recording_status change
CREATE OR REPLACE FUNCTION update_last_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.recording_status IS DISTINCT FROM OLD.recording_status THEN
    NEW.last_status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to allow re-running)
DROP TRIGGER IF EXISTS videos_recording_status_changed ON public.videos;
CREATE TRIGGER videos_recording_status_changed
  BEFORE UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION update_last_status_changed_at();

-- Add comments for documentation
COMMENT ON COLUMN public.videos.recording_status IS 'Execution workflow status: NOT_RECORDED, RECORDED, EDITED, READY_TO_POST, POSTED, REJECTED';
COMMENT ON COLUMN public.videos.recorded_at IS 'Timestamp when video was recorded';
COMMENT ON COLUMN public.videos.edited_at IS 'Timestamp when video editing was completed';
COMMENT ON COLUMN public.videos.ready_to_post_at IS 'Timestamp when video was marked ready to post';
COMMENT ON COLUMN public.videos.posted_at IS 'Timestamp when video was posted to platform';
COMMENT ON COLUMN public.videos.rejected_at IS 'Timestamp when video was rejected';
COMMENT ON COLUMN public.videos.recording_notes IS 'Notes from the recording phase';
COMMENT ON COLUMN public.videos.editor_notes IS 'Notes from the editor';
COMMENT ON COLUMN public.videos.uploader_notes IS 'Notes from the uploader';
COMMENT ON COLUMN public.videos.posted_url IS 'URL of the posted video on the platform';
COMMENT ON COLUMN public.videos.posted_platform IS 'Platform where video was posted (tiktok, instagram, youtube, etc)';
COMMENT ON COLUMN public.videos.posted_account IS 'Account/handle used for posting';
COMMENT ON COLUMN public.videos.posted_at_local IS 'Local time string provided by VA';
COMMENT ON COLUMN public.videos.posting_error IS 'Error message if posting failed';
COMMENT ON COLUMN public.videos.last_status_changed_at IS 'Timestamp of last recording_status change';
