-- Fix deduct_credit to handle unlimited plans (Pro, Business, Brand, Agency)
-- These plans should never deduct credits (credits_remaining stays unchanged)

DROP FUNCTION IF EXISTS deduct_credit(uuid, text, uuid);

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
  v_current INTEGER;
  v_plan_id TEXT;
  v_is_free BOOLEAN;
  v_is_unlimited BOOLEAN;
BEGIN
  -- Lock row
  SELECT uc.credits_remaining INTO v_current
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  SELECT us.plan_id INTO v_plan_id
  FROM user_subscriptions us
  WHERE us.user_id = p_user_id;

  IF v_current IS NULL THEN
    RETURN QUERY SELECT false, 0, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Check if user has unlimited plan (Pro, Business, Brand, Agency)
  v_is_unlimited := (v_plan_id IN ('creator_pro', 'business', 'brand', 'agency'));

  -- Unlimited plans: skip deduction, always return success
  IF v_is_unlimited THEN
    -- Still track usage for analytics, but don't deduct
    UPDATE user_credits
    SET credits_used_this_period = credits_used_this_period + 1,
        lifetime_credits_used = lifetime_credits_used + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, skit_id)
    VALUES (p_user_id, 'generation', 0, v_current, p_description, p_skit_id);

    RETURN QUERY SELECT true, v_current, 'Unlimited plan - no deduction'::TEXT;
    RETURN;
  END IF;

  -- Limited plans (Free, Lite): check balance and deduct
  IF v_current <= 0 THEN
    RETURN QUERY SELECT false, v_current, 'No credits remaining'::TEXT;
    RETURN;
  END IF;

  v_is_free := (v_plan_id = 'free');

  UPDATE user_credits
  SET credits_remaining = v_current - 1,
      credits_used_this_period = credits_used_this_period + 1,
      lifetime_credits_used = lifetime_credits_used + 1,
      free_credits_used = CASE WHEN v_is_free THEN free_credits_used + 1 ELSE free_credits_used END,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, skit_id)
  VALUES (p_user_id, 'generation', -1, v_current - 1, p_description, p_skit_id);

  RETURN QUERY SELECT true, v_current - 1, 'Credit deducted'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION deduct_credit IS 'Deduct credits for Free/Lite plans. Pro/Business/Brand/Agency have unlimited credits.';
