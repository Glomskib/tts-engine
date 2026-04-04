-- Migration: TikTok Draft Export tracking on content_items
-- Purpose: Track draft export status when sending rendered videos to TikTok inbox
-- Note: content_items may not exist yet (created in 20260330000000_content_items_system.sql).
-- If so, deferred migration 20260330000003_tiktok_draft_export_deferred.sql applies these columns.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'content_items') THEN
    ALTER TABLE public.content_items
    ADD COLUMN IF NOT EXISTS tiktok_draft_status TEXT CHECK (
      tiktok_draft_status IS NULL OR
      tiktok_draft_status IN ('pending', 'processing', 'sent', 'failed')
    ),
    ADD COLUMN IF NOT EXISTS tiktok_draft_publish_id TEXT,
    ADD COLUMN IF NOT EXISTS tiktok_draft_account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tiktok_draft_error TEXT,
    ADD COLUMN IF NOT EXISTS tiktok_draft_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS tiktok_draft_completed_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_content_items_tiktok_draft_status
      ON public.content_items(tiktok_draft_status)
      WHERE tiktok_draft_status IS NOT NULL;

    COMMENT ON COLUMN public.content_items.tiktok_draft_status IS 'Draft export status: pending, processing, sent, failed';
    COMMENT ON COLUMN public.content_items.tiktok_draft_publish_id IS 'TikTok publish_id from inbox/video/init for tracking';
    COMMENT ON COLUMN public.content_items.tiktok_draft_account_id IS 'Which TikTok account the draft was sent to';
    COMMENT ON COLUMN public.content_items.tiktok_draft_error IS 'Last draft export error message';
    COMMENT ON COLUMN public.content_items.tiktok_draft_requested_at IS 'When draft export was requested';
    COMMENT ON COLUMN public.content_items.tiktok_draft_completed_at IS 'When draft export completed (sent to inbox)';
  END IF;
END $$;
