-- ============================================================================
-- FLASHFLOW AI - FINAL PRICING UPDATE
-- Updates credit allocations and video quotas to final approved values
-- ============================================================================

-- 1. Create plan_video_quotas table if not exists
CREATE TABLE IF NOT EXISTS plan_video_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL UNIQUE,
  videos_per_month INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert/Update video quotas with final pricing
INSERT INTO plan_video_quotas (plan_name, videos_per_month) VALUES
  ('video_starter', 45),
  ('video_growth', 120),
  ('video_scale', 350),
  ('video_agency', 1000)
ON CONFLICT (plan_name) DO UPDATE SET
  videos_per_month = EXCLUDED.videos_per_month,
  updated_at = NOW();

-- 3. Update subscription_plans table with final pricing
UPDATE subscription_plans SET
  price_monthly = 900,
  credits_per_month = 75,
  updated_at = NOW()
WHERE id = 'starter';

UPDATE subscription_plans SET
  price_monthly = 2900,
  credits_per_month = 300,
  updated_at = NOW()
WHERE id = 'creator';

UPDATE subscription_plans SET
  price_monthly = 5900,
  credits_per_month = 1000,
  updated_at = NOW()
WHERE id = 'business';

UPDATE subscription_plans SET
  price_monthly = 8900,
  credits_per_month = 300,
  updated_at = NOW()
WHERE id = 'video_starter';

UPDATE subscription_plans SET
  price_monthly = 19900,
  credits_per_month = 1000,
  updated_at = NOW()
WHERE id = 'video_growth';

UPDATE subscription_plans SET
  price_monthly = 49900,
  credits_per_month = 999999,
  updated_at = NOW()
WHERE id = 'video_scale';

UPDATE subscription_plans SET
  price_monthly = 115000,
  credits_per_month = 999999,
  updated_at = NOW()
WHERE id = 'video_agency';

-- 4. Update plan_features team member limits
UPDATE plan_features SET limit_value = 5 WHERE plan_name = 'business' AND feature_key = 'team_members';
UPDATE plan_features SET limit_value = 5 WHERE plan_name = 'video_starter' AND feature_key = 'team_members';
UPDATE plan_features SET limit_value = 10 WHERE plan_name = 'video_growth' AND feature_key = 'team_members';
UPDATE plan_features SET limit_value = 10 WHERE plan_name = 'video_scale' AND feature_key = 'team_members';
UPDATE plan_features SET limit_value = 25 WHERE plan_name = 'video_agency' AND feature_key = 'team_members';

-- 5. Add content_type column to video_requests if not exists
ALTER TABLE video_requests
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'scripted';

COMMENT ON COLUMN video_requests.content_type IS 'Type of content: scripted = has linked script, freestyle = talking without script, existing = pre-recorded content';

CREATE INDEX IF NOT EXISTS idx_video_requests_content_type ON video_requests(content_type);

-- 6. Update any existing video subscriptions with new quotas
UPDATE user_subscriptions SET
  videos_per_month = 45,
  videos_remaining = LEAST(videos_remaining, 45)
WHERE plan_id = 'video_starter' AND subscription_type = 'video_editing';

UPDATE user_subscriptions SET
  videos_per_month = 120,
  videos_remaining = LEAST(videos_remaining, 120)
WHERE plan_id = 'video_growth' AND subscription_type = 'video_editing';

UPDATE user_subscriptions SET
  videos_per_month = 350,
  videos_remaining = LEAST(videos_remaining, 350)
WHERE plan_id = 'video_scale' AND subscription_type = 'video_editing';

UPDATE user_subscriptions SET
  videos_per_month = 1000,
  videos_remaining = LEAST(videos_remaining, 1000)
WHERE plan_id = 'video_agency' AND subscription_type = 'video_editing';

-- Comments
COMMENT ON TABLE plan_video_quotas IS 'Monthly video quotas for video editing plans';
