-- FlashFlow Video Engine V1
--
-- Affiliate-first automated short-form video pipeline with a Mode abstraction
-- that supports `affiliate` (default) and `nonprofit` without forking the engine.
-- Mode swaps scoring weights, templates, and CTAs only — pipeline is identical.
--
-- Tables prefixed `ve_` to avoid collision with the older edit-builder schema
-- (`edit_projects`, `edit_plans`) and the M4 worker queue (`ff_render_jobs`).
-- Renders are dispatched THROUGH `ff_render_jobs` — the engine does not own
-- a parallel render queue.

-- ---------------------------------------------------------------------------
-- Mode enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 've_mode') THEN
    CREATE TYPE public.ve_mode AS ENUM ('affiliate', 'nonprofit');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- ve_runs — top-level orchestrator. One row per "upload and process" submission.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  mode            public.ve_mode NOT NULL DEFAULT 'affiliate',
  preset_keys     TEXT[] NOT NULL DEFAULT '{}',  -- which templates to render (empty = mode defaults)
  status          TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','transcribing','analyzing','assembling','rendering','complete','failed')),
  target_clip_count INTEGER NOT NULL DEFAULT 4 CHECK (target_clip_count BETWEEN 1 AND 8),

  -- Mode-specific input context (product info for affiliate, mission/event for nonprofit)
  context_json    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- State machine bookkeeping
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_tick_at    TIMESTAMPTZ,
  error_message   TEXT,
  cost_cents      INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ve_runs_user_created ON public.ve_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_runs_active_tick ON public.ve_runs(last_tick_at NULLS FIRST)
  WHERE status NOT IN ('complete','failed');

-- ---------------------------------------------------------------------------
-- ve_assets — uploaded source videos. One run currently has 1 asset (V1) but
-- the schema supports multi-clip ingestion later (run_id is on the asset).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  storage_bucket  TEXT NOT NULL DEFAULT 'renders',
  storage_path    TEXT NOT NULL,
  storage_url     TEXT NOT NULL,
  original_filename TEXT,
  mime_type       TEXT,
  byte_size       BIGINT,
  duration_sec    NUMERIC(10,3),
  width           INTEGER,
  height          INTEGER,
  thumbnail_url   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ve_assets_run ON public.ve_assets(run_id);
CREATE INDEX IF NOT EXISTS idx_ve_assets_user ON public.ve_assets(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- ve_transcripts — full transcript per asset
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_transcripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES public.ve_assets(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  language        TEXT NOT NULL DEFAULT 'en',
  full_text       TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'whisper',
  duration_sec    NUMERIC(10,3),
  raw_json        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ve_transcripts_asset ON public.ve_transcripts(asset_id);
CREATE INDEX IF NOT EXISTS idx_ve_transcripts_run ON public.ve_transcripts(run_id);

-- ---------------------------------------------------------------------------
-- ve_transcript_chunks — sentence/segment level with timestamps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_transcript_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id   UUID NOT NULL REFERENCES public.ve_transcripts(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  idx             INTEGER NOT NULL,
  start_sec       NUMERIC(10,3) NOT NULL,
  end_sec         NUMERIC(10,3) NOT NULL,
  text            TEXT NOT NULL,
  features_json   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- pre-computed deterministic features
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ve_chunks_transcript_idx ON public.ve_transcript_chunks(transcript_id, idx);
CREATE INDEX IF NOT EXISTS idx_ve_chunks_run ON public.ve_transcript_chunks(run_id);

-- ---------------------------------------------------------------------------
-- ve_clip_candidates — scored segment candidates. Top N selected for render.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_clip_candidates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             UUID NOT NULL REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  asset_id           UUID NOT NULL REFERENCES public.ve_assets(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  start_sec          NUMERIC(10,3) NOT NULL,
  end_sec            NUMERIC(10,3) NOT NULL,
  text               TEXT NOT NULL DEFAULT '',
  hook_text          TEXT,                          -- the hook line (often first sentence)
  clip_type          TEXT,                          -- e.g. hook, benefit, testimonial, cta, mission
  score              NUMERIC(6,3) NOT NULL DEFAULT 0,
  score_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected           BOOLEAN NOT NULL DEFAULT FALSE,
  rank               INTEGER,                       -- 1..N when selected
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ve_candidates_run_score ON public.ve_clip_candidates(run_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_ve_candidates_run_selected ON public.ve_clip_candidates(run_id, selected, rank);

-- ---------------------------------------------------------------------------
-- ve_rendered_clips — one per (selected candidate × template). Dispatched to
-- ff_render_jobs for actual rendering.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ve_rendered_clips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES public.ve_runs(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES public.ve_clip_candidates(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL,
  template_key        TEXT NOT NULL,                 -- e.g. 'aff_tiktok_shop', 'np_event_recap'
  cta_key             TEXT,                          -- e.g. 'shop_now', 'register_now'
  mode                public.ve_mode NOT NULL,
  ff_render_job_id    UUID,                          -- FK to ff_render_jobs.id (no constraint to allow loose coupling)
  status              TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','rendering','complete','failed')),
  output_url          TEXT,
  thumbnail_url       TEXT,
  duration_sec        NUMERIC(10,3),
  error_message       TEXT,
  timeline_json       JSONB,                         -- exact Shotstack timeline submitted
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ve_rendered_run ON public.ve_rendered_clips(run_id);
CREATE INDEX IF NOT EXISTS idx_ve_rendered_job ON public.ve_rendered_clips(ff_render_job_id);
CREATE INDEX IF NOT EXISTS idx_ve_rendered_pending ON public.ve_rendered_clips(status)
  WHERE status IN ('queued','rendering');

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ve_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ve_runs_touch ON public.ve_runs;
CREATE TRIGGER trg_ve_runs_touch BEFORE UPDATE ON public.ve_runs
  FOR EACH ROW EXECUTE FUNCTION public.ve_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ve_rendered_touch ON public.ve_rendered_clips;
CREATE TRIGGER trg_ve_rendered_touch BEFORE UPDATE ON public.ve_rendered_clips
  FOR EACH ROW EXECUTE FUNCTION public.ve_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- All ve_* tables are user-scoped. Service role (used by API routes via
-- supabaseAdmin) bypasses RLS — these policies protect any direct client reads.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ve_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ve_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ve_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ve_transcript_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ve_clip_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ve_rendered_clips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_runs_owner_select' AND tablename = 've_runs') THEN
    CREATE POLICY ve_runs_owner_select ON public.ve_runs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_assets_owner_select' AND tablename = 've_assets') THEN
    CREATE POLICY ve_assets_owner_select ON public.ve_assets FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_transcripts_owner_select' AND tablename = 've_transcripts') THEN
    CREATE POLICY ve_transcripts_owner_select ON public.ve_transcripts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_chunks_owner_select' AND tablename = 've_transcript_chunks') THEN
    CREATE POLICY ve_chunks_owner_select ON public.ve_transcript_chunks FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.ve_transcripts t WHERE t.id = transcript_id AND t.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_candidates_owner_select' AND tablename = 've_clip_candidates') THEN
    CREATE POLICY ve_candidates_owner_select ON public.ve_clip_candidates FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 've_rendered_owner_select' AND tablename = 've_rendered_clips') THEN
    CREATE POLICY ve_rendered_owner_select ON public.ve_rendered_clips FOR SELECT USING (auth.uid() = user_id);
  END IF;
END$$;

COMMENT ON TABLE public.ve_runs IS
  'FlashFlow Video Engine: top-level run. mode=affiliate|nonprofit drives scoring weights, templates, and CTAs without forking the pipeline.';
COMMENT ON TABLE public.ve_clip_candidates IS
  'Scored transcript segments. Top N (selected=true, rank IS NOT NULL) are dispatched to render.';
COMMENT ON TABLE public.ve_rendered_clips IS
  'One row per template applied to one selected candidate. Renders dispatched via ff_render_jobs (M4 worker queue).';
