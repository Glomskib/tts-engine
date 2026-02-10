-- Migration 091: TikTok Multi-Account Management
-- Purpose: Track multiple TikTok accounts (5 affiliate + 1 POD) with posting history and stats

-- ============================================================================
-- TIKTOK ACCOUNTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Account details
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('affiliate', 'pod')),
  category_focus TEXT,

  -- Stats (updated periodically)
  total_videos INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_likes BIGINT DEFAULT 0,
  total_comments BIGINT DEFAULT 0,
  total_shares BIGINT DEFAULT 0,
  avg_engagement DECIMAL(5,2) DEFAULT 0,

  -- Posting schedule
  posting_frequency TEXT DEFAULT 'daily', -- daily, twice_daily, every_other_day, weekly
  last_posted_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'flagged', 'banned')),
  status_reason TEXT, -- Why paused/flagged/banned

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_user ON public.tiktok_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_type ON public.tiktok_accounts(user_id, type);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_status ON public.tiktok_accounts(user_id, status);

-- RLS Policies
ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own accounts" ON public.tiktok_accounts;
CREATE POLICY "Users can view own accounts" ON public.tiktok_accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own accounts" ON public.tiktok_accounts;
CREATE POLICY "Users can insert own accounts" ON public.tiktok_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own accounts" ON public.tiktok_accounts;
CREATE POLICY "Users can update own accounts" ON public.tiktok_accounts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own accounts" ON public.tiktok_accounts;
CREATE POLICY "Users can delete own accounts" ON public.tiktok_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- ADD ACCOUNT_ID TO VIDEOS TABLE
-- ============================================================================

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_account ON public.videos(account_id);

-- ============================================================================
-- TRIGGER: Update account stats when video is posted
-- ============================================================================

CREATE OR REPLACE FUNCTION update_account_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total_videos count
  UPDATE public.tiktok_accounts
  SET
    total_videos = (
      SELECT COUNT(*) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    last_posted_at = GREATEST(COALESCE(last_posted_at, NEW.created_at), NEW.created_at),
    updated_at = NOW()
  WHERE id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_account_stats ON public.videos;
CREATE TRIGGER trigger_update_account_stats
  AFTER INSERT OR UPDATE OF account_id, recording_status ON public.videos
  FOR EACH ROW
  WHEN (NEW.account_id IS NOT NULL AND NEW.recording_status = 'POSTED')
  EXECUTE FUNCTION update_account_stats();

-- ============================================================================
-- TRIGGER: Update account engagement stats
-- ============================================================================

CREATE OR REPLACE FUNCTION update_account_engagement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tiktok_accounts
  SET
    total_views = (
      SELECT COALESCE(SUM(views_total), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_likes = (
      SELECT COALESCE(SUM(likes_total), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_comments = (
      SELECT COALESCE(SUM(comments_total), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    total_shares = (
      SELECT COALESCE(SUM(shares_total), 0) FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED'
    ),
    avg_engagement = (
      SELECT COALESCE(AVG(
        CASE
          WHEN views_total > 0 THEN
            ((likes_total + comments_total + shares_total)::DECIMAL / views_total) * 100
          ELSE 0
        END
      ), 0)
      FROM public.videos
      WHERE account_id = NEW.account_id AND recording_status = 'POSTED' AND views_total > 0
    ),
    updated_at = NOW()
  WHERE id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_account_engagement ON public.videos;
CREATE TRIGGER trigger_update_account_engagement
  AFTER UPDATE OF views_total, likes_total, comments_total, shares_total ON public.videos
  FOR EACH ROW
  WHEN (NEW.account_id IS NOT NULL)
  EXECUTE FUNCTION update_account_engagement();

-- ============================================================================
-- SEED DATA: Brandon's 6 TikTok Accounts
-- ============================================================================

-- Get Brandon's user_id (assuming he's the admin user)
DO $$
DECLARE
  brandon_user_id UUID;
BEGIN
  -- Try to get the first admin user
  SELECT id INTO brandon_user_id FROM auth.users LIMIT 1;

  IF brandon_user_id IS NOT NULL THEN
    -- Insert seed accounts
    INSERT INTO public.tiktok_accounts (user_id, name, handle, type, category_focus, posting_frequency, status, notes)
    VALUES
      (brandon_user_id, 'Main Wellness', '@wellnessvibes_', 'affiliate', 'Health & Wellness', 'daily', 'active', 'Primary affiliate account - broad wellness products'),
      (brandon_user_id, 'Chronic Illness Support', '@chronicwarrior', 'affiliate', 'Chronic Illness', 'daily', 'active', 'EDS, POTS, chronic pain community'),
      (brandon_user_id, 'Fitness Focus', '@fitlifehacks', 'affiliate', 'Fitness', 'daily', 'active', 'Workout gear, supplements, fitness products'),
      (brandon_user_id, 'Beauty & Skincare', '@glowupguide_', 'affiliate', 'Beauty', 'daily', 'active', 'Skincare, beauty tools, makeup'),
      (brandon_user_id, 'Home & Lifestyle', '@homevibesonly', 'affiliate', 'Home & Lifestyle', 'daily', 'active', 'Home organization, gadgets, lifestyle products'),
      (brandon_user_id, 'Print on Demand Store', '@customcreations_shop', 'pod', 'POD Products', 'daily', 'active', 'Custom designs, apparel, accessories')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Documentation
COMMENT ON TABLE public.tiktok_accounts IS 'Multi-account TikTok management: tracks 5 affiliate accounts + 1 POD account with stats and posting history';
COMMENT ON COLUMN public.videos.account_id IS 'Which TikTok account this video was posted to';
