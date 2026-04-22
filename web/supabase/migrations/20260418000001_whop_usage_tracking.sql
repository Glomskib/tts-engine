-- ============================================================
-- Whop usage tracking: extend ff_entitlements with per-cycle
-- counters + period_start so plan limits can be enforced without
-- touching the video pipeline.
-- ============================================================

-- 1. Allow 'starter' as a first-class plan name alongside existing tiers.
ALTER TABLE public.ff_entitlements
  DROP CONSTRAINT IF EXISTS ff_entitlements_plan_check;

ALTER TABLE public.ff_entitlements
  ADD CONSTRAINT ff_entitlements_plan_check
  CHECK (plan IN ('free','starter','lite','pro','business','brand','agency'));

-- 2. Usage counters + cycle anchor.
ALTER TABLE public.ff_entitlements
  ADD COLUMN IF NOT EXISTS clips_generated       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS videos_processed      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_period_start  TIMESTAMPTZ;

COMMENT ON COLUMN public.ff_entitlements.clips_generated IS
  'Clips produced during the current billing cycle. Reset on membership.activated.';
COMMENT ON COLUMN public.ff_entitlements.videos_processed IS
  'Source videos processed during the current billing cycle. Reset on membership.activated.';
COMMENT ON COLUMN public.ff_entitlements.current_period_start IS
  'Anchor for the current billing cycle. Set from Whop membership renewal.';

-- 3. Atomic increment helpers (used by lib/whop/plan-limits.ts).
CREATE OR REPLACE FUNCTION public.ff_increment_clip_usage(p_user_id UUID)
RETURNS public.ff_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.ff_entitlements;
BEGIN
  UPDATE public.ff_entitlements
    SET clips_generated = clips_generated + 1,
        updated_at      = now()
    WHERE user_id = p_user_id
    RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ff_increment_video_usage(p_user_id UUID)
RETURNS public.ff_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.ff_entitlements;
BEGIN
  UPDATE public.ff_entitlements
    SET videos_processed = videos_processed + 1,
        updated_at       = now()
    WHERE user_id = p_user_id
    RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ff_increment_clip_usage(UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION public.ff_increment_video_usage(UUID) TO service_role;
