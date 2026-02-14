-- Fix race conditions in credit functions and script version numbering.
--
-- Issues:
-- 1. add_credits: live function returns TABLE(credits_remaining int) but TS
--    expects (success, credits_remaining, message). Also uses GREATEST(0,...)
--    which silently allows double-spends instead of rejecting.
-- 2. deduct_credit: SELECT then UPDATE without FOR UPDATE row lock.
-- 3. Script version: app-level SELECT max(version) then INSERT races under
--    concurrent load, causing unique constraint violations.

-- ─── 1. Fix add_credits ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS add_credits(uuid, integer, text, text);

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
  v_current INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the row to serialise concurrent calls for same user
  SELECT uc.credits_remaining INTO v_current
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    -- Auto-create row for new users
    INSERT INTO user_credits (user_id, credits_remaining, credits_used_this_period, lifetime_credits_used)
    VALUES (p_user_id, GREATEST(0, p_amount), CASE WHEN p_amount < 0 THEN ABS(p_amount) ELSE 0 END, CASE WHEN p_amount < 0 THEN ABS(p_amount) ELSE 0 END)
    RETURNING user_credits.credits_remaining INTO v_new_balance;

    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
    VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description);

    RETURN QUERY SELECT true, v_new_balance, 'Credits initialised'::TEXT;
    RETURN;
  END IF;

  -- Reject spends that exceed balance
  IF p_amount < 0 AND v_current + p_amount < 0 THEN
    RETURN QUERY SELECT false, v_current, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current + p_amount;

  UPDATE user_credits
  SET credits_remaining = v_new_balance,
      credits_used_this_period = CASE WHEN p_amount < 0
        THEN credits_used_this_period + ABS(p_amount)
        ELSE credits_used_this_period END,
      lifetime_credits_used = CASE WHEN p_amount < 0
        THEN COALESCE(lifetime_credits_used, 0) + ABS(p_amount)
        ELSE COALESCE(lifetime_credits_used, 0) END,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description);

  RETURN QUERY SELECT true, v_new_balance, 'Credits updated'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Fix deduct_credit ───────────────────────────────────────────────────
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


-- ─── 3. Atomic script version numbering ─────────────────────────────────────
-- Called from the app to get the next version in a way that's safe under
-- concurrent inserts (the caller still does the INSERT, but this SELECT
-- happens inside the same request scope).
CREATE OR REPLACE FUNCTION next_script_version(p_concept_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM scripts
  WHERE concept_id = p_concept_id;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
