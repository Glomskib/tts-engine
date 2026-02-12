-- =============================================
-- PHASE 8: Consolidated Migration
-- Run AFTER existing migrations (email-queue, referral-system, task-89)
-- This adds missing RPC functions and the plan_features seed data.
-- =============================================

-- =============================================
-- 1. RPC: add_credits (used by image generation)
-- =============================================
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'credit',
  p_description TEXT DEFAULT ''
) RETURNS TABLE(credits_remaining INTEGER) AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE user_credits
  SET credits_remaining = GREATEST(0, user_credits.credits_remaining + p_amount),
      credits_used_this_period = CASE
        WHEN p_amount < 0 THEN user_credits.credits_used_this_period + ABS(p_amount)
        ELSE user_credits.credits_used_this_period
      END,
      lifetime_credits_used = CASE
        WHEN p_amount < 0 THEN COALESCE(user_credits.lifetime_credits_used, 0) + ABS(p_amount)
        ELSE COALESCE(user_credits.lifetime_credits_used, 0)
      END,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING user_credits.credits_remaining INTO v_remaining;

  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, credits_remaining, credits_used_this_period, lifetime_credits_used)
    VALUES (p_user_id, GREATEST(0, p_amount), CASE WHEN p_amount < 0 THEN ABS(p_amount) ELSE 0 END, CASE WHEN p_amount < 0 THEN ABS(p_amount) ELSE 0 END)
    RETURNING user_credits.credits_remaining INTO v_remaining;
  END IF;

  -- Log the transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_amount, p_type, p_description, v_remaining);

  RETURN QUERY SELECT v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. RPC: add_purchased_credits (used by checkout webhook)
-- =============================================
CREATE OR REPLACE FUNCTION add_purchased_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit pack purchase'
) RETURNS VOID AS $$
BEGIN
  UPDATE user_credits
  SET credits_remaining = user_credits.credits_remaining + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, credits_remaining)
    VALUES (p_user_id, p_amount);
  END IF;

  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, p_amount, 'purchase', p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. RPC: increment_affiliate_balance
-- =============================================
CREATE OR REPLACE FUNCTION increment_affiliate_balance(
  p_affiliate_id UUID,
  p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE affiliate_accounts
  SET balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = NOW()
  WHERE id = p_affiliate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. RPC: increment_referral_credits
-- =============================================
CREATE OR REPLACE FUNCTION increment_referral_credits(
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE user_subscriptions
  SET referral_credits = COALESCE(referral_credits, 0) + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. RPC: deduct_video (used by video editing flow)
-- =============================================
CREATE OR REPLACE FUNCTION deduct_video(
  p_user_id UUID
) RETURNS TABLE(success BOOLEAN, videos_remaining INTEGER, message TEXT) AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT us.videos_remaining INTO v_remaining
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'No subscription found'::TEXT;
    RETURN;
  END IF;

  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'No videos remaining'::TEXT;
    RETURN;
  END IF;

  UPDATE user_subscriptions
  SET videos_remaining = user_subscriptions.videos_remaining - 1,
      videos_used_this_month = COALESCE(user_subscriptions.videos_used_this_month, 0) + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING user_subscriptions.videos_remaining INTO v_remaining;

  RETURN QUERY SELECT TRUE, v_remaining, 'OK'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. Ensure credit_transactions table exists
-- =============================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit',
  description TEXT DEFAULT '',
  balance_after INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users view own transactions" ON credit_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Service role full access credit_transactions" ON credit_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- 7. Ensure credit_purchases table exists
-- =============================================
CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id UUID,
  credits_purchased INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users view own purchases" ON credit_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Service role full access credit_purchases" ON credit_purchases
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- 8. Ensure generated_images table exists
-- =============================================
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  style TEXT,
  aspect_ratio TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_user ON generated_images(user_id);

ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users view own images" ON generated_images
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Service role full access generated_images" ON generated_images
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- 9. Add processed_at to affiliate_payouts for idempotency (H10)
-- =============================================
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NULL;
