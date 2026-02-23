-- ============================================================
-- ff_entitlements: single source of truth for paid plan status
-- Migration: 128_ff_entitlements
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.ff_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','lite','pro','business','brand','agency')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','canceled','past_due')),
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_ff_entitlements_stripe_customer
  ON public.ff_entitlements (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_ff_entitlements_stripe_subscription
  ON public.ff_entitlements (stripe_subscription_id);

-- 3. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION ff_entitlements_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ff_entitlements_updated_at ON public.ff_entitlements;
CREATE TRIGGER trg_ff_entitlements_updated_at
  BEFORE UPDATE ON public.ff_entitlements
  FOR EACH ROW EXECUTE FUNCTION ff_entitlements_updated_at();

-- 4. RLS + policies
ALTER TABLE public.ff_entitlements ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
DROP POLICY IF EXISTS "ff_entitlements_own_read" ON public.ff_entitlements;
CREATE POLICY "ff_entitlements_own_read" ON public.ff_entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access (webhooks, admin)
DROP POLICY IF EXISTS "ff_entitlements_service_write" ON public.ff_entitlements;
CREATE POLICY "ff_entitlements_service_write" ON public.ff_entitlements
  FOR ALL USING (public.is_service_role());

-- 5. Extend initialize_user_credits() to create entitlement row on signup
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create subscription record (free plan)
  BEGIN
    INSERT INTO user_subscriptions (user_id, plan_id, subscription_type, status)
    VALUES (NEW.id, 'free', 'saas', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create subscription for user %: %', NEW.id, SQLERRM;
  END;

  -- Create credits record (5 free credits)
  BEGIN
    INSERT INTO user_credits (
      user_id,
      credits_remaining,
      free_credits_total,
      free_credits_used,
      credits_used_this_period,
      lifetime_credits_used,
      period_start,
      period_end
    )
    VALUES (
      NEW.id,
      5,
      5,
      0,
      0,
      0,
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create credits for user %: %', NEW.id, SQLERRM;
  END;

  -- Log the initial credit grant (non-critical)
  BEGIN
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
    VALUES (NEW.id, 'bonus', 5, 5, 'Welcome bonus - 5 free generations');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to log credit transaction for user %: %', NEW.id, SQLERRM;
  END;

  -- Create entitlement record (free plan)
  BEGIN
    INSERT INTO ff_entitlements (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create entitlement for user %: %', NEW.id, SQLERRM;
  END;

  -- Always return NEW to allow user creation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure grants are preserved
GRANT EXECUTE ON FUNCTION initialize_user_credits() TO postgres, service_role;
ALTER FUNCTION initialize_user_credits() SET search_path = public;

-- 6. Backfill from existing user_subscriptions
INSERT INTO ff_entitlements (user_id, plan, status, current_period_end, stripe_customer_id, stripe_subscription_id)
SELECT
  us.user_id,
  CASE us.plan_id
    WHEN 'creator_lite' THEN 'lite'
    WHEN 'creator_pro'  THEN 'pro'
    WHEN 'free'         THEN 'free'
    WHEN 'business'     THEN 'business'
    WHEN 'brand'        THEN 'brand'
    WHEN 'agency'       THEN 'agency'
    ELSE 'free'
  END,
  CASE
    WHEN us.status IN ('active', 'canceled', 'past_due') THEN us.status
    WHEN us.status = 'cancelled' THEN 'canceled'
    ELSE 'active'
  END,
  uc.period_end,
  us.stripe_customer_id,
  us.stripe_subscription_id
FROM user_subscriptions us
LEFT JOIN user_credits uc ON uc.user_id = us.user_id
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE public.ff_entitlements IS 'Single source of truth for user plan entitlements, decoupled from video editing quotas';
