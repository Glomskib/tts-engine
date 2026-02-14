-- Referral system: referral_codes + referral_redemptions
-- Replaces the ad-hoc referrals table with a proper two-table design.

-- ── 1. Referral codes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'referral' CHECK (type IN ('referral', 'affiliate')),
  uses INTEGER DEFAULT 0,
  max_uses INTEGER, -- null = unlimited
  reward_type TEXT DEFAULT 'credits',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- ── 2. Referral redemptions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID REFERENCES referral_codes(id),
  referrer_user_id UUID NOT NULL,
  referred_user_id UUID NOT NULL,
  reward_given BOOLEAN DEFAULT false,
  reward_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_user_id) -- one referral per new user
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer ON referral_redemptions(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referred ON referral_redemptions(referred_user_id);

-- ── 3. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own referral codes
CREATE POLICY "Users can view own referral codes"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Service role handles inserts/updates (via supabaseAdmin)
CREATE POLICY "Service role full access on referral_codes"
  ON referral_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own redemptions as referrer"
  ON referral_redemptions FOR SELECT
  USING (auth.uid() = referrer_user_id);

CREATE POLICY "Users can view own redemption as referred"
  ON referral_redemptions FOR SELECT
  USING (auth.uid() = referred_user_id);

CREATE POLICY "Service role full access on referral_redemptions"
  ON referral_redemptions FOR ALL
  USING (auth.role() = 'service_role');
