-- ============================================================================
-- FLASHFLOW AI - ACCOUNT SYSTEM, FEATURE GATES & VIDEO CLIENT PORTAL
-- ============================================================================

-- 1. Extend user_subscriptions with subscription_type and video tracking
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS subscription_type TEXT NOT NULL DEFAULT 'saas',
  ADD COLUMN IF NOT EXISTS videos_per_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS videos_used_this_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS videos_remaining INTEGER DEFAULT 0;

-- Add check constraint for subscription_type
DO $$ BEGIN
  ALTER TABLE user_subscriptions
    ADD CONSTRAINT user_subscriptions_type_check
    CHECK (subscription_type IN ('saas', 'video_editing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. PLAN FEATURES TABLE - What each plan can access
CREATE TABLE IF NOT EXISTS plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  limit_value INTEGER, -- NULL = unlimited, number = limit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(plan_name, feature_key)
);

-- 3. VIDEO REQUESTS TABLE - For video editing clients
CREATE TABLE IF NOT EXISTS video_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request details
  title TEXT NOT NULL,
  description TEXT,
  script_id UUID, -- linked script if any

  -- Google Drive
  source_drive_link TEXT NOT NULL,
  edited_drive_link TEXT, -- filled when editor uploads finished video

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',

  -- Assignment
  assigned_editor_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,

  -- Tracking
  priority INTEGER DEFAULT 0,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Revision tracking
  revision_count INTEGER DEFAULT 0,
  revision_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add check constraint for video_requests status
DO $$ BEGIN
  ALTER TABLE video_requests
    ADD CONSTRAINT video_requests_status_check
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'review', 'revision', 'completed', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. INSERT PLAN FEATURES

-- Clear existing features to avoid duplicates
DELETE FROM plan_features;

-- Free plan
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('free', 'skit_generator', true, NULL),
  ('free', 'basic_presets', true, NULL),
  ('free', 'all_presets', false, NULL),
  ('free', 'save_skits', true, 3),
  ('free', 'product_catalog', false, NULL),
  ('free', 'audience_intelligence', false, NULL),
  ('free', 'winners_bank', false, NULL),
  ('free', 'b_roll_generator', false, NULL),
  ('free', 'team_members', false, NULL),
  ('free', 'video_portal', false, NULL);

-- Starter plan ($9)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('starter', 'skit_generator', true, NULL),
  ('starter', 'basic_presets', true, NULL),
  ('starter', 'all_presets', true, NULL),
  ('starter', 'save_skits', true, NULL),
  ('starter', 'product_catalog', true, 5),
  ('starter', 'audience_intelligence', false, NULL),
  ('starter', 'winners_bank', false, NULL),
  ('starter', 'b_roll_generator', false, NULL),
  ('starter', 'team_members', false, NULL),
  ('starter', 'video_portal', false, NULL);

-- Creator plan ($29)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('creator', 'skit_generator', true, NULL),
  ('creator', 'basic_presets', true, NULL),
  ('creator', 'all_presets', true, NULL),
  ('creator', 'save_skits', true, NULL),
  ('creator', 'product_catalog', true, NULL),
  ('creator', 'audience_intelligence', true, NULL),
  ('creator', 'winners_bank', true, NULL),
  ('creator', 'b_roll_generator', true, NULL),
  ('creator', 'team_members', false, NULL),
  ('creator', 'video_portal', false, NULL);

-- Business plan ($59)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('business', 'skit_generator', true, NULL),
  ('business', 'basic_presets', true, NULL),
  ('business', 'all_presets', true, NULL),
  ('business', 'save_skits', true, NULL),
  ('business', 'product_catalog', true, NULL),
  ('business', 'audience_intelligence', true, NULL),
  ('business', 'winners_bank', true, NULL),
  ('business', 'b_roll_generator', true, NULL),
  ('business', 'team_members', true, 5),
  ('business', 'video_portal', false, NULL);

-- Video Starter ($150/mo - 30 videos)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('video_starter', 'skit_generator', true, NULL),
  ('video_starter', 'basic_presets', true, NULL),
  ('video_starter', 'all_presets', true, NULL),
  ('video_starter', 'save_skits', true, NULL),
  ('video_starter', 'product_catalog', true, NULL),
  ('video_starter', 'audience_intelligence', true, NULL),
  ('video_starter', 'winners_bank', true, NULL),
  ('video_starter', 'b_roll_generator', true, NULL),
  ('video_starter', 'team_members', true, 5),
  ('video_starter', 'video_portal', true, NULL);

-- Video Growth ($360/mo - 90 videos)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('video_growth', 'skit_generator', true, NULL),
  ('video_growth', 'basic_presets', true, NULL),
  ('video_growth', 'all_presets', true, NULL),
  ('video_growth', 'save_skits', true, NULL),
  ('video_growth', 'product_catalog', true, NULL),
  ('video_growth', 'audience_intelligence', true, NULL),
  ('video_growth', 'winners_bank', true, NULL),
  ('video_growth', 'b_roll_generator', true, NULL),
  ('video_growth', 'team_members', true, 10),
  ('video_growth', 'video_portal', true, NULL);

-- Video Scale ($975/mo - 300 videos)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('video_scale', 'skit_generator', true, NULL),
  ('video_scale', 'basic_presets', true, NULL),
  ('video_scale', 'all_presets', true, NULL),
  ('video_scale', 'save_skits', true, NULL),
  ('video_scale', 'product_catalog', true, NULL),
  ('video_scale', 'audience_intelligence', true, NULL),
  ('video_scale', 'winners_bank', true, NULL),
  ('video_scale', 'b_roll_generator', true, NULL),
  ('video_scale', 'team_members', true, 10),
  ('video_scale', 'video_portal', true, NULL);

-- Video Agency ($2475/mo - 900 videos)
INSERT INTO plan_features (plan_name, feature_key, is_enabled, limit_value) VALUES
  ('video_agency', 'skit_generator', true, NULL),
  ('video_agency', 'basic_presets', true, NULL),
  ('video_agency', 'all_presets', true, NULL),
  ('video_agency', 'save_skits', true, NULL),
  ('video_agency', 'product_catalog', true, NULL),
  ('video_agency', 'audience_intelligence', true, NULL),
  ('video_agency', 'winners_bank', true, NULL),
  ('video_agency', 'b_roll_generator', true, NULL),
  ('video_agency', 'team_members', true, 25),
  ('video_agency', 'video_portal', true, NULL);

-- 5. UPDATE SUBSCRIPTION PLANS TABLE with new plans
INSERT INTO subscription_plans (id, name, description, price_monthly, credits_per_month, max_products, max_team_members, max_saved_skits, features, sort_order) VALUES
  ('starter', 'Starter', 'For individual creators', 900, 75, 5, 1, -1,
   '["All character presets", "75 AI credits/month", "Unlimited saved skits", "Product catalog (5)", "Email support"]'::jsonb, 1),
  ('creator', 'Creator', 'For serious creators', 2900, 300, -1, 1, -1,
   '["Everything in Starter", "300 AI credits/month", "Audience Intelligence", "Winners Bank", "B-Roll Generator", "Priority support"]'::jsonb, 2),
  ('business', 'Business', 'For teams & agencies', 5900, 1000, -1, 5, -1,
   '["Everything in Creator", "1000 AI credits/month", "Up to 5 team members", "Shared workspaces", "Dedicated support"]'::jsonb, 3),
  ('video_starter', 'Video Starter', '30 videos per month', 15000, 300, -1, 5, -1,
   '["30 professionally edited videos/month", "Full AI suite included", "Unlimited revisions", "Fast turnaround"]'::jsonb, 10),
  ('video_growth', 'Video Growth', '90 videos per month', 36000, 1000, -1, 10, -1,
   '["90 professionally edited videos/month", "Full AI suite included", "Priority editing queue", "Dedicated editor"]'::jsonb, 11),
  ('video_scale', 'Video Scale', '300 videos per month', 97500, 999999, -1, 10, -1,
   '["300 professionally edited videos/month", "Unlimited AI credits", "Same-day turnaround", "Multiple dedicated editors"]'::jsonb, 12),
  ('video_agency', 'Video Agency', '900 videos per month', 247500, 999999, -1, 25, -1,
   '["900 professionally edited videos/month", "Unlimited AI credits", "Agency dashboard", "White-label options"]'::jsonb, 13)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  credits_per_month = EXCLUDED.credits_per_month,
  max_products = EXCLUDED.max_products,
  max_team_members = EXCLUDED.max_team_members,
  max_saved_skits = EXCLUDED.max_saved_skits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Update free plan credits
UPDATE subscription_plans SET credits_per_month = 5 WHERE id = 'free';

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_video_requests_user ON video_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_video_requests_status ON video_requests(status);
CREATE INDEX IF NOT EXISTS idx_video_requests_editor ON video_requests(assigned_editor_id);
CREATE INDEX IF NOT EXISTS idx_plan_features_plan ON plan_features(plan_name);

-- 7. RLS POLICIES
ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;

-- Plan features are publicly readable
DROP POLICY IF EXISTS "Anyone can view plan features" ON plan_features;
CREATE POLICY "Anyone can view plan features" ON plan_features
  FOR SELECT USING (true);

-- Video requests policies
DROP POLICY IF EXISTS "Users can view own video requests" ON video_requests;
CREATE POLICY "Users can view own video requests" ON video_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create video requests" ON video_requests;
CREATE POLICY "Users can create video requests" ON video_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own video requests" ON video_requests;
CREATE POLICY "Users can update own video requests" ON video_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- Editors can view and update assigned requests
DROP POLICY IF EXISTS "Editors can view assigned requests" ON video_requests;
CREATE POLICY "Editors can view assigned requests" ON video_requests
  FOR SELECT USING (auth.uid() = assigned_editor_id);

DROP POLICY IF EXISTS "Editors can update assigned requests" ON video_requests;
CREATE POLICY "Editors can update assigned requests" ON video_requests
  FOR UPDATE USING (auth.uid() = assigned_editor_id);

-- 8. FUNCTION: Deduct video from user's monthly allocation
CREATE OR REPLACE FUNCTION deduct_video(p_user_id UUID)
RETURNS TABLE (success BOOLEAN, videos_remaining INTEGER, message TEXT) AS $$
DECLARE
  v_videos_remaining INTEGER;
BEGIN
  -- Get current videos remaining
  SELECT us.videos_remaining INTO v_videos_remaining
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;

  IF v_videos_remaining IS NULL THEN
    RETURN QUERY SELECT false, 0, 'User subscription not found'::TEXT;
    RETURN;
  END IF;

  IF v_videos_remaining <= 0 THEN
    RETURN QUERY SELECT false, v_videos_remaining, 'No videos remaining this month'::TEXT;
    RETURN;
  END IF;

  -- Deduct video
  UPDATE user_subscriptions
  SET
    videos_remaining = videos_remaining - 1,
    videos_used_this_month = videos_used_this_month + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_videos_remaining - 1, 'Video deducted'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. FUNCTION: Reset monthly videos (called by cron or webhook)
CREATE OR REPLACE FUNCTION reset_monthly_videos(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    videos_used_this_month = 0,
    videos_remaining = videos_per_month,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND subscription_type = 'video_editing';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Updated_at trigger for video_requests
DROP TRIGGER IF EXISTS trigger_video_requests_updated_at ON video_requests;
CREATE TRIGGER trigger_video_requests_updated_at
  BEFORE UPDATE ON video_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE plan_features IS 'Feature access flags per subscription plan';
COMMENT ON TABLE video_requests IS 'Video editing requests from clients';
COMMENT ON FUNCTION deduct_video IS 'Deducts one video from user monthly allocation';
