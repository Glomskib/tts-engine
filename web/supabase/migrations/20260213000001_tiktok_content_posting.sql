-- Migration: TikTok Content Posting API
-- Purpose: Store OAuth tokens for TikTok Content Posting API (separate from Shop API)
--          and track auto-posting status on videos

-- ============================================================================
-- TIKTOK CONTENT CONNECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_content_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the posting account (tiktok_accounts table)
  account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE CASCADE NOT NULL,

  -- OAuth2 tokens (TikTok Content Posting API uses PKCE + authorization_code)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,

  -- TikTok user info (from /v2/user/info)
  open_id TEXT,
  display_name TEXT,

  -- Creator info (from /v2/post/publish/creator_info/query)
  -- Stores allowed privacy levels, comment/duet/stitch settings
  creator_info JSONB,

  -- Default posting settings
  privacy_level TEXT DEFAULT 'SELF_ONLY',

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One content connection per posting account
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_content_conn_account
  ON public.tiktok_content_connections(account_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_content_conn_status
  ON public.tiktok_content_connections(status);

-- RLS
ALTER TABLE public.tiktok_content_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own content connections" ON public.tiktok_content_connections;
CREATE POLICY "Users can view own content connections" ON public.tiktok_content_connections
  FOR SELECT USING (
    account_id IN (SELECT id FROM public.tiktok_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own content connections" ON public.tiktok_content_connections;
CREATE POLICY "Users can insert own content connections" ON public.tiktok_content_connections
  FOR INSERT WITH CHECK (
    account_id IN (SELECT id FROM public.tiktok_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own content connections" ON public.tiktok_content_connections;
CREATE POLICY "Users can update own content connections" ON public.tiktok_content_connections
  FOR UPDATE USING (
    account_id IN (SELECT id FROM public.tiktok_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own content connections" ON public.tiktok_content_connections;
CREATE POLICY "Users can delete own content connections" ON public.tiktok_content_connections
  FOR DELETE USING (
    account_id IN (SELECT id FROM public.tiktok_accounts WHERE user_id = auth.uid())
  );

-- ============================================================================
-- ADD POSTING STATUS COLUMNS TO VIDEOS TABLE
-- ============================================================================

ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS tiktok_publish_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_post_status TEXT CHECK (
  tiktok_post_status IS NULL OR
  tiktok_post_status IN ('pending', 'uploading', 'processing', 'published', 'failed')
),
ADD COLUMN IF NOT EXISTS auto_post_attempted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_post_error TEXT;

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_videos_tiktok_post_status
  ON public.videos(tiktok_post_status)
  WHERE tiktok_post_status IS NOT NULL;

COMMENT ON TABLE public.tiktok_content_connections IS 'OAuth tokens for TikTok Content Posting API (video upload/publish), linked to tiktok_accounts';
COMMENT ON COLUMN public.videos.tiktok_publish_id IS 'TikTok Content Posting API publish_id for tracking upload status';
COMMENT ON COLUMN public.videos.tiktok_post_status IS 'Auto-posting status: pending, uploading, processing, published, failed';
COMMENT ON COLUMN public.videos.auto_post_attempted_at IS 'When the auto-post was last attempted';
COMMENT ON COLUMN public.videos.auto_post_error IS 'Last auto-posting error message';
