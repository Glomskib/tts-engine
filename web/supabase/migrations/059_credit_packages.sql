-- ============================================================================
-- FLASHFLOW AI - CREDIT PACKAGES & UPDATED ALLOCATIONS
-- ============================================================================

-- 1. UPDATE FREE PLAN TO 10 CREDITS/MONTH
UPDATE subscription_plans
SET credits_per_month = 10,
    features = '["Access to script generator", "Basic character presets", "10 AI generations/month", "Save up to 3 skits", "Community support"]'::jsonb,
    updated_at = NOW()
WHERE id = 'free';

-- 2. CREDIT PACKAGES TABLE (purchasable credit packs)
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

-- Insert credit packages
INSERT INTO credit_packages (id, name, description, credits, price_cents, savings_percent, is_featured, sort_order) VALUES
  ('starter_pack', 'Starter Pack', 'Try out AI features', 50, 499, 0, false, 0),
  ('standard_pack', 'Standard Pack', 'Most popular choice', 150, 1199, 20, true, 1),
  ('pro_pack', 'Pro Pack', 'Best for power users', 500, 2999, 40, false, 2),
  ('enterprise_pack', 'Enterprise Pack', 'Maximum value', 2000, 9999, 50, false, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  credits = EXCLUDED.credits,
  price_cents = EXCLUDED.price_cents,
  savings_percent = EXCLUDED.savings_percent,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- RLS for credit packages (public read)
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active packages" ON credit_packages FOR SELECT USING (is_active = true);

-- 3. CREDIT PURCHASE HISTORY
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

CREATE INDEX idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX idx_credit_purchases_stripe_session ON credit_purchases(stripe_checkout_session_id);

-- RLS for credit purchases
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases" ON credit_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON credit_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Add purchased_credits column to user_credits if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_credits' AND column_name = 'purchased_credits'
  ) THEN
    ALTER TABLE user_credits ADD COLUMN purchased_credits INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 5. Function to add purchased credits
CREATE OR REPLACE FUNCTION add_purchased_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit pack purchase'
)
RETURNS TABLE (
  success BOOLEAN,
  credits_remaining INTEGER,
  message TEXT
) AS $$
DECLARE
  v_current_credits INTEGER;
  v_purchased_credits INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get current credits
  SELECT credits_remaining, COALESCE(purchased_credits, 0) INTO v_current_credits, v_purchased_credits
  FROM user_credits
  WHERE user_id = p_user_id;

  IF v_current_credits IS NULL THEN
    -- Create user_credits record if doesn't exist
    INSERT INTO user_credits (user_id, credits_remaining, purchased_credits)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      credits_remaining = user_credits.credits_remaining + p_amount,
      purchased_credits = COALESCE(user_credits.purchased_credits, 0) + p_amount,
      updated_at = NOW();

    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_current_credits + p_amount;

    UPDATE user_credits
    SET
      credits_remaining = v_new_balance,
      purchased_credits = v_purchased_credits + p_amount,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, 'purchase', p_amount, v_new_balance, p_description);

  RETURN QUERY SELECT true, v_new_balance, 'Credits added'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Updated_at trigger for new tables
DROP TRIGGER IF EXISTS trigger_credit_packages_updated_at ON credit_packages;
CREATE TRIGGER trigger_credit_packages_updated_at
  BEFORE UPDATE ON credit_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE credit_packages IS 'Purchasable credit packs';
COMMENT ON TABLE credit_purchases IS 'History of credit pack purchases';
COMMENT ON FUNCTION add_purchased_credits IS 'Adds purchased credits to user balance';
