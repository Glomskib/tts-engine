-- ============================================================================
-- FLASHFLOW AI - SUBSCRIPTIONS & CREDITS SYSTEM
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. SUBSCRIPTION PLANS TABLE
-- Defines available plans and their credit allocations
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL DEFAULT 0,        -- Price in cents
  price_yearly INTEGER NOT NULL DEFAULT 0,         -- Price in cents (yearly)
  credits_per_month INTEGER NOT NULL DEFAULT 0,
  max_products INTEGER DEFAULT 10,
  max_team_members INTEGER DEFAULT 1,
  max_saved_skits INTEGER DEFAULT 3,
  features JSONB DEFAULT '[]'::jsonb,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, credits_per_month, max_products, max_team_members, max_saved_skits, features, sort_order) VALUES
  ('free', 'Free', 'Try the platform', 0, 0, 0, 3, 1, 3, 
   '["Access to script generator", "Basic character presets", "5 AI generations total", "Save up to 3 skits", "Community support"]'::jsonb, 0),
  ('starter', 'Starter', 'For individual creators', 2900, 27600, 100, 10, 1, -1, 
   '["Everything in Free", "All character presets", "100 AI generations/month", "Unlimited saved skits", "Product catalog (10 products)", "Export to all formats", "Email support"]'::jsonb, 1),
  ('pro', 'Pro', 'For power users', 7900, 75600, 500, -1, 1, -1, 
   '["Everything in Starter", "500 AI generations/month", "Product catalog (unlimited)", "Custom character presets", "Audience personas", "Winners pattern library", "Priority support", "API access"]'::jsonb, 2),
  ('team', 'Team', 'For agencies & brands', 19900, 190800, 2000, -1, 10, -1, 
   '["Everything in Pro", "2,000 AI generations/month", "Up to 10 team members", "Shared workspaces", "Brand guidelines enforcement", "Usage analytics", "Dedicated support", "Custom integrations"]'::jsonb, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  credits_per_month = EXCLUDED.credits_per_month,
  max_products = EXCLUDED.max_products,
  max_team_members = EXCLUDED.max_team_members,
  max_saved_skits = EXCLUDED.max_saved_skits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();


-- 2. USER SUBSCRIPTIONS TABLE
-- Tracks each user's current subscription status
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused')),
  billing_period TEXT DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  -- Dates
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure one subscription per user
  UNIQUE(user_id)
);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX idx_user_subscriptions_stripe_subscription ON user_subscriptions(stripe_subscription_id);


-- 3. USER CREDITS TABLE
-- Tracks credit balance and usage
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Credit balances
  credits_remaining INTEGER NOT NULL DEFAULT 5,    -- Free users start with 5
  credits_used_this_period INTEGER NOT NULL DEFAULT 0,
  lifetime_credits_used INTEGER NOT NULL DEFAULT 0,
  -- Free trial tracking
  free_credits_total INTEGER NOT NULL DEFAULT 5,
  free_credits_used INTEGER NOT NULL DEFAULT 0,
  -- Period tracking
  period_start TIMESTAMPTZ DEFAULT NOW(),
  period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One credit record per user
  UNIQUE(user_id)
);

CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);


-- 4. CREDIT TRANSACTIONS TABLE
-- Audit log of all credit changes
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Transaction details
  type TEXT NOT NULL CHECK (type IN ('generation', 'refund', 'purchase', 'bonus', 'reset', 'subscription_renewal')),
  amount INTEGER NOT NULL,  -- Positive = add, negative = deduct
  balance_after INTEGER NOT NULL,
  -- Context
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Related entities
  skit_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);


-- 5. RLS POLICIES

-- Subscription Plans - public read
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON subscription_plans FOR SELECT USING (is_active = true);

-- User Subscriptions - users can only see their own
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription" ON user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON user_subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- User Credits - users can only see their own
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credits" ON user_credits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credits" ON user_credits FOR UPDATE USING (auth.uid() = user_id);

-- Credit Transactions - users can only see their own
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 6. FUNCTIONS

-- Function to initialize credits for new users
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create subscription record (free plan)
  INSERT INTO user_subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Create credits record (5 free credits)
  INSERT INTO user_credits (user_id, credits_remaining, free_credits_total, free_credits_used)
  VALUES (NEW.id, 5, 5, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Log the initial credit grant
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (NEW.id, 'bonus', 5, 5, 'Welcome bonus - 5 free generations');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create credits on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_init_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_init_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_credits();


-- Function to deduct credits (called by API)
CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id UUID,
  p_description TEXT DEFAULT 'AI generation',
  p_skit_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  credits_remaining INTEGER,
  message TEXT
) AS $$
DECLARE
  v_current_credits INTEGER;
  v_plan_id TEXT;
  v_is_free_user BOOLEAN;
BEGIN
  -- Get current credits
  SELECT uc.credits_remaining, us.plan_id
  INTO v_current_credits, v_plan_id
  FROM user_credits uc
  JOIN user_subscriptions us ON us.user_id = uc.user_id
  WHERE uc.user_id = p_user_id;
  
  -- Check if user has credits
  IF v_current_credits IS NULL THEN
    RETURN QUERY SELECT false, 0, 'User not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_current_credits <= 0 THEN
    RETURN QUERY SELECT false, v_current_credits, 'No credits remaining'::TEXT;
    RETURN;
  END IF;
  
  v_is_free_user := (v_plan_id = 'free');
  
  -- Deduct credit
  UPDATE user_credits
  SET 
    credits_remaining = credits_remaining - 1,
    credits_used_this_period = credits_used_this_period + 1,
    lifetime_credits_used = lifetime_credits_used + 1,
    free_credits_used = CASE WHEN v_is_free_user THEN free_credits_used + 1 ELSE free_credits_used END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, skit_id)
  VALUES (p_user_id, 'generation', -1, v_current_credits - 1, p_description, p_skit_id);
  
  RETURN QUERY SELECT true, v_current_credits - 1, 'Credit deducted'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to add credits (for purchases, bonuses, subscription renewals)
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT 'Credits added'
)
RETURNS TABLE (
  success BOOLEAN,
  credits_remaining INTEGER,
  message TEXT
) AS $$
DECLARE
  v_current_credits INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get current credits
  SELECT credits_remaining INTO v_current_credits
  FROM user_credits
  WHERE user_id = p_user_id;
  
  IF v_current_credits IS NULL THEN
    RETURN QUERY SELECT false, 0, 'User not found'::TEXT;
    RETURN;
  END IF;
  
  v_new_balance := v_current_credits + p_amount;
  
  -- Add credits
  UPDATE user_credits
  SET 
    credits_remaining = v_new_balance,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description);
  
  RETURN QUERY SELECT true, v_new_balance, 'Credits added'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to reset monthly credits (called by cron or subscription webhook)
CREATE OR REPLACE FUNCTION reset_monthly_credits(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_plan_credits INTEGER;
  v_plan_id TEXT;
BEGIN
  -- Get user's plan
  SELECT us.plan_id, sp.credits_per_month
  INTO v_plan_id, v_plan_credits
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id AND us.status = 'active';
  
  IF v_plan_id IS NULL OR v_plan_id = 'free' THEN
    RETURN; -- Free users don't get monthly resets
  END IF;
  
  -- Reset credits
  UPDATE user_credits
  SET 
    credits_remaining = v_plan_credits,
    credits_used_this_period = 0,
    period_start = NOW(),
    period_end = NOW() + INTERVAL '30 days',
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the reset
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'subscription_renewal', v_plan_credits, v_plan_credits, 'Monthly credit reset');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. UPDATED_AT TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER trigger_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER trigger_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_credits_updated_at ON user_credits;
CREATE TRIGGER trigger_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 8. COMMENTS
COMMENT ON TABLE subscription_plans IS 'Available subscription plans with pricing and feature limits';
COMMENT ON TABLE user_subscriptions IS 'User subscription status and Stripe integration';
COMMENT ON TABLE user_credits IS 'User credit balances and usage tracking';
COMMENT ON TABLE credit_transactions IS 'Audit log of all credit changes';
COMMENT ON FUNCTION deduct_credit IS 'Safely deducts one credit from user balance';
COMMENT ON FUNCTION add_credits IS 'Adds credits to user balance with logging';
COMMENT ON FUNCTION reset_monthly_credits IS 'Resets credits for subscription renewal';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
