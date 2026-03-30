-- FlashFlow Render Entitlements
-- Adds render quota tracking to user_subscriptions for FlashFlow Creator/Pro plans.
-- These columns are separate from the video_editing quota columns (videos_used_this_month etc.)
-- to avoid conflating the two products.

-- ══════════════════════════════════════════════════════════════════
-- 1. Add render quota columns to user_subscriptions
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS ff_renders_per_month INTEGER;

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS ff_renders_used_this_month INTEGER NOT NULL DEFAULT 0;

-- ══════════════════════════════════════════════════════════════════
-- 2. Seed render limits for existing FF plan subscribers
--    ff_creator → 30/mo, ff_pro → 100/mo
--    All other plans get NULL (= unlimited or not applicable)
-- ══════════════════════════════════════════════════════════════════

UPDATE user_subscriptions
  SET ff_renders_per_month = 30
  WHERE plan_id = 'ff_creator' AND ff_renders_per_month IS NULL;

UPDATE user_subscriptions
  SET ff_renders_per_month = 100
  WHERE plan_id = 'ff_pro' AND ff_renders_per_month IS NULL;

-- ══════════════════════════════════════════════════════════════════
-- 3. Index for fast entitlement lookup
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_user_subs_ff_renders
  ON user_subscriptions (user_id, plan_id, ff_renders_used_this_month);

-- ══════════════════════════════════════════════════════════════════
-- 4. RPC: increment render count atomically
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_ff_render(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_subscriptions
    SET ff_renders_used_this_month = ff_renders_used_this_month + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 5. RPC: reset render count at billing period renewal
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_ff_renders(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_subscriptions
    SET ff_renders_used_this_month = 0,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;
