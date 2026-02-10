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
-- Migration 092: Content Calendar
-- Purpose: Add scheduling fields to videos table for content calendar functionality

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS scheduled_account_id UUID REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_scheduled_date ON public.videos(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_account ON public.videos(scheduled_account_id) WHERE scheduled_account_id IS NOT NULL;

COMMENT ON COLUMN public.videos.scheduled_date IS 'Date this video is scheduled to be posted (for content calendar)';
COMMENT ON COLUMN public.videos.scheduled_account_id IS 'Which TikTok account this video is scheduled for';
-- Migration 093: Competitor Tracking
-- Purpose: Track competitor TikTok accounts and analyze their content patterns

-- ============================================================================
-- COMPETITORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Competitor details
  name TEXT NOT NULL,
  tiktok_handle TEXT NOT NULL,
  category TEXT,
  notes TEXT,

  -- Aggregated stats (updated periodically)
  total_videos_tracked INTEGER DEFAULT 0,
  avg_views BIGINT DEFAULT 0,
  avg_engagement DECIMAL(5,2) DEFAULT 0,
  top_hook_pattern TEXT,

  -- Tracking
  last_checked_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_user ON public.competitors(user_id);
CREATE INDEX IF NOT EXISTS idx_competitors_handle ON public.competitors(user_id, tiktok_handle);

-- RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own competitors" ON public.competitors;
CREATE POLICY "Users can manage own competitors" ON public.competitors
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- COMPETITOR VIDEOS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitor_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,

  -- Video details
  tiktok_url TEXT NOT NULL,
  title TEXT,
  hook_text TEXT,
  content_type TEXT,

  -- Performance
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2),

  -- Analysis
  ai_analysis JSONB,

  -- Metadata
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_videos_competitor ON public.competitor_videos(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_videos_views ON public.competitor_videos(competitor_id, views DESC);

-- RLS
ALTER TABLE public.competitor_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can view competitor videos" ON public.competitor_videos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can insert competitor videos" ON public.competitor_videos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can update competitor videos" ON public.competitor_videos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete competitor videos" ON public.competitor_videos;
CREATE POLICY "Users can delete competitor videos" ON public.competitor_videos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.competitors
      WHERE competitors.id = competitor_videos.competitor_id
        AND competitors.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update competitor stats when videos are added/updated
CREATE OR REPLACE FUNCTION update_competitor_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.competitors
  SET
    total_videos_tracked = (
      SELECT COUNT(*) FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id
    ),
    avg_views = (
      SELECT COALESCE(AVG(views), 0)::BIGINT FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id
    ),
    avg_engagement = (
      SELECT COALESCE(AVG(
        CASE
          WHEN views > 0 THEN ((likes + comments + shares)::DECIMAL / views) * 100
          ELSE 0
        END
      ), 0)
      FROM public.competitor_videos
      WHERE competitor_id = NEW.competitor_id AND views > 0
    ),
    updated_at = NOW()
  WHERE id = NEW.competitor_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_competitor_stats ON public.competitor_videos;
CREATE TRIGGER trigger_update_competitor_stats
  AFTER INSERT OR UPDATE OF views, likes, comments, shares ON public.competitor_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_competitor_stats();

-- Calculate engagement rate for competitor videos
CREATE OR REPLACE FUNCTION calc_competitor_engagement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.views > 0 THEN
    NEW.engagement_rate := ((NEW.likes + NEW.comments + NEW.shares)::DECIMAL / NEW.views) * 100;
  ELSE
    NEW.engagement_rate := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_competitor_engagement ON public.competitor_videos;
CREATE TRIGGER trigger_calc_competitor_engagement
  BEFORE INSERT OR UPDATE OF views, likes, comments, shares ON public.competitor_videos
  FOR EACH ROW
  EXECUTE FUNCTION calc_competitor_engagement();

COMMENT ON TABLE public.competitors IS 'Tracked TikTok competitor accounts for pattern analysis';
COMMENT ON TABLE public.competitor_videos IS 'Individual videos from tracked competitors';
-- Migration 094: Extend Notifications System
-- Purpose: Add new columns and types for pipeline events, winner detection, VA activity
-- Builds on migration 017 which created the base notifications table

-- Add new columns to existing table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Backfill: copy is_read to read for existing rows
UPDATE public.notifications SET read = is_read WHERE read IS NULL;

-- Drop old type constraint and add expanded one
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'handoff', 'assigned', 'status_changed', 'script_attached', 'comment',
    'va_submission', 'winner_detected', 'brand_quota', 'pipeline_idle',
    'drive_new_video', 'competitor_viral', 'system', 'info'
  ));

-- New index for the read column
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read) WHERE read = FALSE;

-- Allow service role inserts
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.notifications IS 'In-app notifications for pipeline events, winners, VA activity, and workflow handoffs';
-- Webhook subscriptions for real-time updates
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Webhook',
  url TEXT NOT NULL,
  secret TEXT, -- HMAC signing secret
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'video.status_changed', 'winner.detected'}
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  -- Auto-disable after too many failures
  max_failures INTEGER NOT NULL DEFAULT 10
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

-- Webhook delivery log (last 30 days)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status_code INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can only see their own webhooks
CREATE POLICY "Users can manage own webhooks" ON webhooks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own webhook deliveries" ON webhook_deliveries
  FOR SELECT USING (
    webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid())
  );

-- Service role can do everything (for dispatch)
CREATE POLICY "Service role full access webhooks" ON webhooks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access deliveries" ON webhook_deliveries
  FOR ALL USING (auth.role() = 'service_role');
-- Custom user templates
CREATE TABLE IF NOT EXISTS custom_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  hook_template TEXT, -- supports {{product_name}}, {{audience}}, {{benefit}} variables
  body_template TEXT,
  cta_template TEXT,
  variables TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'product_name', 'audience', 'benefit'}
  structure JSONB NOT NULL DEFAULT '{}', -- beat_count, tone, duration, etc
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_templates_user_id ON custom_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_templates_category ON custom_templates(category);

-- RLS
ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates" ON custom_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view public templates" ON custom_templates
  FOR SELECT USING (is_public = true);

CREATE POLICY "Service role full access templates" ON custom_templates
  FOR ALL USING (auth.role() = 'service_role');
-- Migration 097: A/B Test Variations with video linking and performance tracking
-- Extends existing ab_tests (migration 087) with per-variation video performance

CREATE TABLE IF NOT EXISTS ab_test_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Variation',
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  skit_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  hook_text TEXT,
  script_preview TEXT,
  account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  posting_time TIMESTAMPTZ,
  -- Performance (synced from video stats)
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_variations_test ON ab_test_variations(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_variations_video ON ab_test_variations(video_id);

ALTER TABLE ab_test_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variations via test ownership" ON ab_test_variations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM ab_tests WHERE ab_tests.id = ab_test_variations.test_id AND ab_tests.user_id = auth.uid())
  );

CREATE POLICY "Service role full access variations" ON ab_test_variations
  FOR ALL USING (auth.role() = 'service_role');

-- Add winner_variation_id to ab_tests
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS winner_variation_id UUID REFERENCES ab_test_variations(id) ON DELETE SET NULL;
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 7;

COMMENT ON TABLE ab_test_variations IS 'Individual variations in an A/B test with linked videos and performance data';
-- Migration 098: Trending Hashtags & Sounds Tracker

CREATE TABLE IF NOT EXISTS trending_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hashtag TEXT NOT NULL,
  category TEXT,
  view_count BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0, -- percentage growth
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_hashtags_user ON trending_hashtags(user_id);
CREATE INDEX IF NOT EXISTS idx_trending_hashtags_growth ON trending_hashtags(growth_rate DESC);

ALTER TABLE trending_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own hashtags" ON trending_hashtags
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access hashtags" ON trending_hashtags
  FOR ALL USING (auth.role() = 'service_role');

-- Trending sounds
CREATE TABLE IF NOT EXISTS trending_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sound_name TEXT NOT NULL,
  sound_url TEXT,
  creator TEXT,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_sounds_user ON trending_sounds(user_id);
CREATE INDEX IF NOT EXISTS idx_trending_sounds_growth ON trending_sounds(growth_rate DESC);

ALTER TABLE trending_sounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sounds" ON trending_sounds
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access sounds" ON trending_sounds
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE trending_hashtags IS 'Tracked trending TikTok hashtags with growth metrics';
COMMENT ON TABLE trending_sounds IS 'Tracked trending TikTok sounds with growth metrics';
-- Migration 099: Revenue & ROI Tracking Columns
-- Adds estimated/actual revenue and production cost to videos for ROI calculation

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS estimated_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS actual_revenue DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS production_cost DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.videos.estimated_revenue IS 'Estimated revenue from this video (projected)';
COMMENT ON COLUMN public.videos.actual_revenue IS 'Actual confirmed revenue from this video';
COMMENT ON COLUMN public.videos.production_cost IS 'Cost to produce this video (VA, editing, etc)';
