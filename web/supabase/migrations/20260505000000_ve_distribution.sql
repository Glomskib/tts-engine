-- Video Engine Distribution Layer
--
-- Outbound posting queue + user export preferences.
-- Supports TikTok draft (V1), with direct-post and multi-channel ready.

-- ---------------------------------------------------------------------------
-- ve_distribution_jobs — outbound posting queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_distribution_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,
  run_id              UUID REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  rendered_clip_id    UUID REFERENCES public.ve_rendered_clips(id) ON DELETE CASCADE,

  channel             TEXT NOT NULL CHECK (channel IN ('tiktok','youtube','instagram','twitter','late')),
  mode                TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','direct')),

  asset_url           TEXT,
  caption             TEXT,
  hashtags            TEXT[],
  title               TEXT,

  scheduled_at        TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','submitting','processing','published','failed','cancelled')),

  provider_publish_id TEXT,
  provider_response   JSONB,
  error               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ve_dist_user   ON public.ve_distribution_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_dist_status ON public.ve_distribution_jobs(status)
  WHERE status IN ('pending','queued','submitting','processing');
CREATE INDEX IF NOT EXISTS idx_ve_dist_run    ON public.ve_distribution_jobs(run_id);

-- ---------------------------------------------------------------------------
-- ve_user_settings — per-user export preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_user_settings (
  user_id                      UUID PRIMARY KEY,
  auto_export_tiktok_draft     BOOLEAN NOT NULL DEFAULT false,
  require_review_before_export BOOLEAN NOT NULL DEFAULT true,
  default_export_mode          TEXT NOT NULL DEFAULT 'draft'
    CHECK (default_export_mode IN ('draft','direct')),
  tiktok_content_account_id    TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ve_rendered_clips: add recommended flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT false;
