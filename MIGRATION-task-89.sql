-- =============================================
-- TASK 89: AFFILIATE COMMISSION SYSTEM
-- Run in Supabase SQL Editor
-- =============================================

-- 1. Affiliate accounts — users apply to become affiliates
CREATE TABLE IF NOT EXISTS affiliate_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  commission_rate NUMERIC NOT NULL DEFAULT 0.25,
  stripe_connect_id TEXT DEFAULT NULL,
  stripe_connect_onboarded BOOLEAN DEFAULT FALSE,
  payout_email TEXT DEFAULT NULL,
  total_earned NUMERIC DEFAULT 0,
  total_paid NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  min_payout NUMERIC DEFAULT 50,
  application_note TEXT DEFAULT NULL,
  platform TEXT DEFAULT NULL,
  follower_count INTEGER DEFAULT NULL,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_user ON affiliate_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_status ON affiliate_accounts(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_stripe ON affiliate_accounts(stripe_connect_id);

-- 2. Payouts — created BEFORE commissions because commissions reference payouts
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliate_accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id TEXT DEFAULT NULL,
  stripe_payout_id TEXT DEFAULT NULL,
  commission_count INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_affiliate ON affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON affiliate_payouts(status);

-- 3. Commission records — one row per referred user charge
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliate_accounts(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID DEFAULT NULL,
  stripe_invoice_id TEXT DEFAULT NULL,
  subscription_amount NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'refunded')),
  payout_id UUID REFERENCES affiliate_payouts(id),
  period_start TIMESTAMPTZ DEFAULT NULL,
  period_end TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referred ON affiliate_commissions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_payout ON affiliate_commissions(payout_id);

-- 4. Milestone bonuses
CREATE TABLE IF NOT EXISTS affiliate_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliate_accounts(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('conversions_5', 'conversions_15', 'conversions_30')),
  bonus_amount NUMERIC NOT NULL,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  paid BOOLEAN DEFAULT FALSE,
  UNIQUE(affiliate_id, milestone_type)
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE affiliate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_milestones ENABLE ROW LEVEL SECURITY;

-- affiliate_accounts
CREATE POLICY "Users view own affiliate account" ON affiliate_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access affiliate_accounts" ON affiliate_accounts
  FOR ALL USING (auth.role() = 'service_role');

-- affiliate_commissions
CREATE POLICY "Affiliates view own commissions" ON affiliate_commissions
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliate_accounts WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access commissions" ON affiliate_commissions
  FOR ALL USING (auth.role() = 'service_role');

-- affiliate_payouts
CREATE POLICY "Affiliates view own payouts" ON affiliate_payouts
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliate_accounts WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access payouts" ON affiliate_payouts
  FOR ALL USING (auth.role() = 'service_role');

-- affiliate_milestones
CREATE POLICY "Affiliates view own milestones" ON affiliate_milestones
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliate_accounts WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access milestones" ON affiliate_milestones
  FOR ALL USING (auth.role() = 'service_role');
