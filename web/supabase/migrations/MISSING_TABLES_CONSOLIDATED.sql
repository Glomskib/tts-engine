-- ============================================================================
-- CONSOLIDATED MIGRATION: Create all 19 missing tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Generated: 2026-02-10
-- ============================================================================

-- NOTE: Run each section independently if any fail due to dependency ordering.
-- All statements use CREATE TABLE IF NOT EXISTS for idempotency.

-- ============================================================================
-- 1. video_metrics (from migration 006)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.video_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  account_id uuid,
  metric_date date NOT NULL,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  clicks integer DEFAULT 0,
  orders integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(video_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_video_metrics_account_date ON public.video_metrics(account_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_video_metrics_video_date ON public.video_metrics(video_id, metric_date);

-- ============================================================================
-- 2. collections + collection_items (from migration 051)
-- ============================================================================
ALTER TABLE saved_skits ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_saved_skits_is_favorite ON saved_skits(user_id, is_favorite) WHERE is_favorite = TRUE;

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8B5CF6',
  icon TEXT DEFAULT 'folder',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_shared BOOLEAN DEFAULT FALSE,
  share_with_team BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT collections_name_length CHECK (char_length(name) <= 100)
);

CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  skit_id UUID NOT NULL REFERENCES saved_skits(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 0,
  UNIQUE(collection_id, skit_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_skit_id ON collection_items(skit_id);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own collections" ON collections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own collections" ON collections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own collections" ON collections FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own collections" ON collections FOR DELETE USING (user_id = auth.uid());

ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view items in own collections" ON collection_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_items.collection_id AND collections.user_id = auth.uid())
);
CREATE POLICY "Users can add to own collections" ON collection_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_items.collection_id AND collections.user_id = auth.uid())
);
CREATE POLICY "Users can remove from own collections" ON collection_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_items.collection_id AND collections.user_id = auth.uid())
);

-- ============================================================================
-- 3. user_activity (from migration 052)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'skit',
  entity_id UUID NULL,
  entity_name TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON public.user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON public.user_activity(action, created_at DESC);
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own activity" ON public.user_activity FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 4. script_comments (from migration 054)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.script_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skit_id UUID NOT NULL REFERENCES public.saved_skits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.script_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  beat_index INTEGER,
  selection_start INTEGER,
  selection_end INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_script_comments_skit ON public.script_comments(skit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_script_comments_parent ON public.script_comments(parent_id) WHERE parent_id IS NOT NULL;
ALTER TABLE public.script_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_skits' AND column_name = 'is_public') THEN
    ALTER TABLE public.saved_skits ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- 5. credit_packages + credit_purchases (from migration 059)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  savings_percent INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  stripe_price_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active packages" ON credit_packages FOR SELECT USING (is_active = true);

INSERT INTO credit_packages (id, name, description, credits, price_cents, savings_percent, is_featured, sort_order) VALUES
  ('starter_pack', 'Starter Pack', 'Try out AI features', 50, 499, 0, false, 0),
  ('standard_pack', 'Standard Pack', 'Most popular choice', 150, 1199, 20, true, 1),
  ('pro_pack', 'Pro Pack', 'Best for power users', 500, 2999, 40, false, 2),
  ('enterprise_pack', 'Enterprise Pack', 'Maximum value', 2000, 9999, 50, false, 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES credit_packages(id),
  credits_purchased INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases" ON credit_purchases FOR SELECT USING (auth.uid() = user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_credits' AND column_name = 'purchased_credits') THEN
    ALTER TABLE user_credits ADD COLUMN purchased_credits INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 6. client_orgs + client_org_members + client_projects (from migration 071)
-- ============================================================================
ALTER TABLE videos ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS client_user_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_priority VARCHAR(20) DEFAULT 'standard';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_videos_org_id ON videos(org_id);
CREATE INDEX IF NOT EXISTS idx_videos_project_id ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_request_id ON videos(request_id);

CREATE TABLE IF NOT EXISTS client_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  plan_name VARCHAR(50) DEFAULT 'starter',
  billing_status VARCHAR(50) DEFAULT 'active',
  videos_quota INT DEFAULT 10,
  videos_used_this_month INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE client_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages orgs" ON client_orgs FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TABLE IF NOT EXISTS client_org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES client_orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE client_org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own memberships" ON client_org_members FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role manages memberships" ON client_org_members FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TABLE IF NOT EXISTS client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES client_orgs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages projects" ON client_projects FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Members view org projects" ON client_projects FOR SELECT USING (
  org_id IN (SELECT org_id FROM client_org_members WHERE user_id = auth.uid())
);

-- ============================================================================
-- 7. winner_patterns (from migration 078)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.winner_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  top_hook_types JSONB,
  top_content_formats JSONB,
  optimal_video_length JSONB,
  best_posting_times JSONB,
  successful_hooks TEXT[],
  common_patterns TEXT[],
  underperforming_patterns TEXT[],
  total_winners INT DEFAULT 0,
  avg_engagement_rate DECIMAL(5,2),
  avg_views BIGINT,
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
ALTER TABLE public.winner_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own patterns" ON public.winner_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own patterns" ON public.winner_patterns FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 8. webhooks + webhook_deliveries (from migration 095)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Webhook',
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  max_failures INTEGER NOT NULL DEFAULT 10
);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);

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
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own webhook deliveries" ON webhook_deliveries FOR SELECT USING (
  webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid())
);
CREATE POLICY "Service role full access webhooks" ON webhooks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access deliveries" ON webhook_deliveries FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 9. custom_templates (from migration 096)
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  hook_template TEXT,
  body_template TEXT,
  cta_template TEXT,
  variables TEXT[] NOT NULL DEFAULT '{}',
  structure JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_templates_user_id ON custom_templates(user_id);
ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates" ON custom_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view public templates" ON custom_templates FOR SELECT USING (is_public = true);
CREATE POLICY "Service role full access templates" ON custom_templates FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 10. ab_test_variations (from migration 097)
-- ============================================================================
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
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ab_test_variations_test ON ab_test_variations(test_id);
ALTER TABLE ab_test_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage variations via test ownership" ON ab_test_variations FOR ALL USING (
  EXISTS (SELECT 1 FROM ab_tests WHERE ab_tests.id = ab_test_variations.test_id AND ab_tests.user_id = auth.uid())
);
CREATE POLICY "Service role full access variations" ON ab_test_variations FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS winner_variation_id UUID;
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 7;

-- ============================================================================
-- 11. trending_hashtags + trending_sounds (from migration 098)
-- ============================================================================
CREATE TABLE IF NOT EXISTS trending_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hashtag TEXT NOT NULL,
  category TEXT,
  view_count BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  spotted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trending_hashtags_user ON trending_hashtags(user_id);
ALTER TABLE trending_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own hashtags" ON trending_hashtags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access hashtags" ON trending_hashtags FOR ALL USING (auth.role() = 'service_role');

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
ALTER TABLE trending_sounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sounds" ON trending_sounds FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access sounds" ON trending_sounds FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 12. user_settings (NO existing migration — new table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  notification_email BOOLEAN DEFAULT true,
  notification_push BOOLEAN DEFAULT true,
  notification_digest TEXT DEFAULT 'daily',
  theme TEXT DEFAULT 'dark',
  timezone TEXT DEFAULT 'America/New_York',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access settings" ON user_settings FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- DONE — 19 tables created
-- ============================================================================
