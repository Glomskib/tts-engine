-- ============================================================================
-- FIX USER INITIALIZATION TRIGGER
-- Makes the trigger more robust with proper error handling
-- ============================================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created_init_credits ON auth.users;

-- Create improved function with error handling
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

  -- Always return NEW to allow user creation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created_init_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_credits();

-- Ensure RLS policies exist for service role operations
-- These allow the trigger (running as SECURITY DEFINER) to insert records

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION initialize_user_credits() TO postgres, service_role;

-- Ensure the trigger function can bypass RLS
ALTER FUNCTION initialize_user_credits() SET search_path = public;

-- Add policy for service role if not exists (for callback fallback)
DO $$
BEGIN
  -- Check and create subscription insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_subscriptions'
    AND policyname = 'Service role can insert subscriptions'
  ) THEN
    CREATE POLICY "Service role can insert subscriptions" ON user_subscriptions
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;

  -- Check and create credits insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_credits'
    AND policyname = 'Service role can insert credits'
  ) THEN
    CREATE POLICY "Service role can insert credits" ON user_credits
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Policy creation warning: %', SQLERRM;
END;
$$;

-- Comment
COMMENT ON FUNCTION initialize_user_credits() IS 'Initializes subscription and credits for new users with error handling';
