-- ============================================================================
-- Migration: user_creator_profiles — Creator Profile onboarding data
--
-- Stores creator segmentation data collected during onboarding wizard.
-- workspace_id = user_id (single-workspace-per-user mode).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_creator_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id            UUID NOT NULL,

  -- 1. Content creation tenure
  content_creation_tenure TEXT CHECK (content_creation_tenure IN (
    '0_3m', '3_12m', '1_2y', '2_3y', '3y_plus'
  )),

  -- 2. TikTok Shop / affiliate tenure
  tts_affiliate_tenure    TEXT CHECK (tts_affiliate_tenure IN (
    'not_started', '0_1m', '1_6m', '6_12m', '1_2y', '2_3y', '3y_plus'
  )),

  -- 3. Current posting cadence
  current_videos_per_day  TEXT CHECK (current_videos_per_day IN (
    'not_posting', '1', '2_3', '4_10', '11_20', '21_30', '31_50', '50_plus'
  )),

  -- 4. Target posting cadence
  target_videos_per_day   TEXT CHECK (target_videos_per_day IN (
    '1', '2_3', '4_10', '11_20', '21_30', '31_50', '50_plus'
  )),

  -- 5. Role type
  role_type               TEXT CHECK (role_type IN (
    'affiliate_creator', 'seller_brand', 'both', 'unsure'
  )),

  -- 6. TikTok Shop status
  tiktok_shop_status      TEXT CHECK (tiktok_shop_status IN (
    'approved', 'pending', 'no'
  )),

  -- 7. Team mode
  team_mode               TEXT CHECK (team_mode IN (
    'solo', 'solo_plus_editor', 'team_2_5', 'team_6_plus'
  )),

  -- 8. Primary 30-day goal
  primary_goal_30d        TEXT CHECK (primary_goal_30d IN (
    'increase_output', 'find_winners', 'improve_conversion',
    'build_system', 'automate_posting', 'track_and_scale'
  )),

  -- 9. Monthly GMV bucket (optional)
  monthly_gmv_bucket      TEXT CHECK (monthly_gmv_bucket IN (
    '0', 'lt_1k', '1_5k', '5_20k', '20_100k', '100k_plus'
  )),

  -- 10. Onboarding completion timestamp
  completed_onboarding_at TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_creator_profiles_user_id_unique UNIQUE (user_id)
);

-- ── Indexes for segmentation queries ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ucp_content_tenure
  ON user_creator_profiles (content_creation_tenure)
  WHERE content_creation_tenure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ucp_tts_tenure
  ON user_creator_profiles (tts_affiliate_tenure)
  WHERE tts_affiliate_tenure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ucp_gmv
  ON user_creator_profiles (monthly_gmv_bucket)
  WHERE monthly_gmv_bucket IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ucp_current_vpd
  ON user_creator_profiles (current_videos_per_day)
  WHERE current_videos_per_day IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ucp_completed
  ON user_creator_profiles (completed_onboarding_at)
  WHERE completed_onboarding_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ucp_workspace
  ON user_creator_profiles (workspace_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_creator_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
CREATE POLICY ucp_select ON public.user_creator_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own profile
CREATE POLICY ucp_insert ON public.user_creator_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY ucp_update ON public.user_creator_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY ucp_delete ON public.user_creator_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass (cron jobs, admin operations)
CREATE POLICY ucp_service ON public.user_creator_profiles
  FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ucp_updated_at
  BEFORE UPDATE ON public.user_creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMIT;
