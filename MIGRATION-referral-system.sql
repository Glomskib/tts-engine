-- =============================================
-- MIGRATION: Referral System + Promo Codes
-- FlashFlow AI — Task 87
-- Run in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. ADD REFERRAL FIELDS TO USER_SUBSCRIPTIONS
--    (no profiles table exists — user data is in user_subscriptions)
-- =============================================

ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE DEFAULT NULL;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referred_by TEXT DEFAULT NULL;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_credits INTEGER DEFAULT 0;

-- =============================================
-- 2. REFERRAL TRACKING TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'converted', 'expired')),
  -- pending = link clicked but no signup
  -- signed_up = user created account
  -- converted = user upgraded to paid plan
  -- expired = 30 day window passed without conversion
  credited BOOLEAN DEFAULT FALSE,
  -- TRUE when referrer has been given their free month
  click_count INTEGER DEFAULT 0,
  signed_up_at TIMESTAMPTZ DEFAULT NULL,
  converted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- =============================================
-- 3. PROMO CODE SYSTEM
-- =============================================

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('free_trial_extension', 'discount_percent', 'discount_fixed', 'free_months', 'creator_seed')),
  -- free_trial_extension = extends trial period (for referral signups)
  -- discount_percent = percentage off first month (for affiliate codes like JANESCRIPT)
  -- discount_fixed = fixed dollar amount off
  -- free_months = X months free on a specific plan
  -- creator_seed = free Pro access for seeded creators
  value NUMERIC NOT NULL,
  -- For free_trial_extension: number of extra days
  -- For discount_percent: percentage (20 = 20% off)
  -- For discount_fixed: dollar amount
  -- For free_months: number of months
  -- For creator_seed: number of months free Pro
  plan_restriction TEXT DEFAULT NULL,
  -- NULL = applies to any plan
  -- 'pro' = only applies to Pro plan
  -- 'agency' = only applies to Agency plan
  max_uses INTEGER DEFAULT NULL,
  -- NULL = unlimited uses
  current_uses INTEGER DEFAULT 0,
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- If this promo code belongs to an affiliate creator
  expires_at TIMESTAMPTZ DEFAULT NULL,
  -- NULL = never expires
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
  -- Flexible field for tracking: campaign name, creator name, etc.
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_creator ON promo_codes(creator_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = TRUE;

-- Promo code redemptions (track who used what)
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id)
  -- Each user can only redeem a specific code once
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_code ON promo_redemptions(promo_code_id);

-- =============================================
-- 4. ROW LEVEL SECURITY
-- =============================================

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can see their own referrals
CREATE POLICY "Users view own referrals" ON referrals
  FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access referrals" ON referrals
  FOR ALL USING (auth.role() = 'service_role');

-- Anyone can read active promo codes (to validate at signup)
CREATE POLICY "Anyone can read active promos" ON promo_codes
  FOR SELECT USING (is_active = TRUE);

-- Service role manages promo codes
CREATE POLICY "Service role full access promos" ON promo_codes
  FOR ALL USING (auth.role() = 'service_role');

-- Users can see their own redemptions
CREATE POLICY "Users view own redemptions" ON promo_redemptions
  FOR SELECT USING (user_id = auth.uid());

-- Service role manages redemptions
CREATE POLICY "Service role full access redemptions" ON promo_redemptions
  FOR ALL USING (auth.role() = 'service_role');
