-- Migration 092: Content Calendar
-- Purpose: Add scheduling fields to videos table for content calendar functionality

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS scheduled_account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_scheduled_date ON public.videos(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_account ON public.videos(scheduled_account_id) WHERE scheduled_account_id IS NOT NULL;

COMMENT ON COLUMN public.videos.scheduled_date IS 'Date this video is scheduled to be posted (for content calendar)';
COMMENT ON COLUMN public.videos.scheduled_account_id IS 'Which TikTok account this video is scheduled for';
