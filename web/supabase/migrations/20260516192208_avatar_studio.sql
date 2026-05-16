-- Avatar Studio v1 — extends brand_profiles into full avatar identities,
-- adds campaigns + scripts + generation_jobs tables.

-- 1. Extend brand_profiles with avatar identity fields
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS is_avatar boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_display_name text,
  ADD COLUMN IF NOT EXISTS avatar_appearance text,
  ADD COLUMN IF NOT EXISTS avatar_visual_recipe text,
  ADD COLUMN IF NOT EXISTS avatar_visual_reference_url text,
  ADD COLUMN IF NOT EXISTS avatar_visual_refs_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_video_style jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS heygen_custom_avatar_id text,
  ADD COLUMN IF NOT EXISTS voice_provider text,
  ADD COLUMN IF NOT EXISTS voice_clone_id text,
  ADD COLUMN IF NOT EXISTS voice_sample_urls_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_bank jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS personality text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS niche text,
  ADD COLUMN IF NOT EXISTS setup_status text DEFAULT 'identity',
  ADD COLUMN IF NOT EXISTS test_render_url text;

CREATE INDEX IF NOT EXISTS brand_profiles_avatar_idx
  ON public.brand_profiles(user_id, is_avatar)
  WHERE is_avatar = true;

-- 2. Avatar campaigns — multi-week structured content plans
CREATE TABLE IF NOT EXISTS public.avatar_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_profile_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_name text,
  product_url text,
  product_brief text,
  goal text DEFAULT 'awareness',
  duration_days integer DEFAULT 30,
  structure jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avatar_campaigns_user_idx
  ON public.avatar_campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS avatar_campaigns_brand_idx
  ON public.avatar_campaigns(brand_profile_id);

-- 3. Avatar scripts — every generated script, optionally tied to a campaign
CREATE TABLE IF NOT EXISTS public.avatar_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_profile_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.avatar_campaigns(id) ON DELETE SET NULL,
  script_type text NOT NULL,
  hook text,
  body text NOT NULL,
  cta text,
  captions text,
  hashtags text,
  status text DEFAULT 'draft',
  compliance_flags jsonb DEFAULT '[]'::jsonb,
  render_run_id text,
  render_video_url text,
  performance_json jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'manual',
  source_prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avatar_scripts_user_idx
  ON public.avatar_scripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS avatar_scripts_brand_idx
  ON public.avatar_scripts(brand_profile_id);
CREATE INDEX IF NOT EXISTS avatar_scripts_campaign_idx
  ON public.avatar_scripts(campaign_id);

-- 4. Generation jobs — the one-prompt orchestrator's job tracker
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  prompt text,
  brand_profile_id uuid REFERENCES public.brand_profiles(id) ON DELETE SET NULL,
  script_id uuid REFERENCES public.avatar_scripts(id) ON DELETE SET NULL,
  step text DEFAULT 'queued',
  steps_done jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'queued',
  progress integer DEFAULT 0,
  error_message text,
  output jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS generation_jobs_user_idx
  ON public.generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_status_idx
  ON public.generation_jobs(status);
