-- Migration: creator_profiles
--
-- User-scoped table (user_id only — no workspace_id).
-- workspace_id === user_id in single-workspace-per-user mode, so we only
-- store user_id here. RLS policy: auth.uid() = user_id.
--
-- Supersedes: 20260402000003_user_creator_profiles.sql

-- Drop old table if it exists (from previous draft migration)
drop table if exists public.user_creator_profiles cascade;

create table if not exists public.creator_profiles (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references auth.users(id) on delete cascade,

  -- Tenure
  content_creation_tenure   text        check (content_creation_tenure in (
                              'less_than_3mo', '3_to_6mo', '6mo_to_1yr', '1_to_2yr', 'over_2yr'
                            )),
  tts_affiliate_tenure      text        check (tts_affiliate_tenure in (
                              'not_started', 'less_than_1mo', '1_to_3mo', '3_to_6mo', 'over_6mo'
                            )),

  -- Role & platform
  role_type                 text        check (role_type in (
                              'solo_creator', 'team_creator', 'brand_owner', 'agency'
                            )),
  tiktok_shop_status        text        check (tiktok_shop_status in (
                              'not_yet', 'just_started', 'active', 'scaling'
                            )),

  -- Volume
  current_videos_per_day    text        check (current_videos_per_day in (
                              'less_than_1', '1_to_2', '3_to_5', '6_to_10', 'over_10'
                            )),
  team_mode                 text        check (team_mode in (
                              'solo', 'small_team', 'large_team'
                            )),

  -- Goals
  primary_goal_30d          text        check (primary_goal_30d in (
                              'grow_reach', 'increase_gmv', 'build_consistency', 'improve_quality', 'scale_team'
                            )),
  target_videos_per_day     text        check (target_videos_per_day in (
                              '1_to_2', '3_to_5', '6_to_10', 'over_10'
                            )),

  -- Optional monetisation signal
  monthly_gmv_bucket        text        check (monthly_gmv_bucket in (
                              'under_1k', '1k_to_5k', '5k_to_20k', '20k_to_100k', 'over_100k'
                            )),

  -- Onboarding gate
  completed_onboarding_at   timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Unique: one profile per user
create unique index if not exists creator_profiles_user_id_idx
  on public.creator_profiles (user_id);

-- Segmentation indexes
create index if not exists creator_profiles_tts_tenure_idx
  on public.creator_profiles (tts_affiliate_tenure);
create index if not exists creator_profiles_content_tenure_idx
  on public.creator_profiles (content_creation_tenure);
create index if not exists creator_profiles_vpd_idx
  on public.creator_profiles (current_videos_per_day);
create index if not exists creator_profiles_gmv_idx
  on public.creator_profiles (monthly_gmv_bucket);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.creator_profiles enable row level security;

-- Users can only see their own profile
create policy "creator_profiles_select_own"
  on public.creator_profiles for select
  using (auth.uid() = user_id);

-- Users can insert their own profile
create policy "creator_profiles_insert_own"
  on public.creator_profiles for insert
  with check (auth.uid() = user_id);

-- Users can update their own profile
create policy "creator_profiles_update_own"
  on public.creator_profiles for update
  using (auth.uid() = user_id);

-- Users can delete their own profile
create policy "creator_profiles_delete_own"
  on public.creator_profiles for delete
  using (auth.uid() = user_id);

-- Service role bypasses RLS (supabaseAdmin client)
create policy "creator_profiles_service_role"
  on public.creator_profiles for all
  using (auth.role() = 'service_role');
