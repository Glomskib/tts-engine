-- ══════════════════════════════════════════════════════════════════
-- Creator Product Watchlist / Opportunity Radar — v1 Schema
--
-- Tracks creators to monitor + their product activity, scores
-- opportunities, and lets operators action them into FlashFlow's
-- content pipeline.
-- ══════════════════════════════════════════════════════════════════

-- ── Creator Watchlist ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.creator_watchlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,
  handle           TEXT NOT NULL,
  display_name     TEXT,
  platform         TEXT NOT NULL DEFAULT 'tiktok'
    CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'other')),
  avatar_url       TEXT,
  niche            TEXT,
  follower_count   INTEGER,
  priority         TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  tags             TEXT[] DEFAULT '{}',
  source           TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'openclaw', 'automation')),
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_creator_watchlist_workspace
  ON public.creator_watchlist(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_creator_watchlist_niche
  ON public.creator_watchlist(workspace_id, niche)
  WHERE niche IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_watchlist_priority
  ON public.creator_watchlist(workspace_id, priority);

-- ── Creator Product Observations ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.creator_product_observations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,
  creator_id               UUID NOT NULL REFERENCES public.creator_watchlist(id) ON DELETE CASCADE,
  product_name             TEXT NOT NULL,
  product_url              TEXT,
  product_image_url        TEXT,
  brand_name               TEXT,
  -- Link to existing FlashFlow product if matched
  product_id               UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source_label             TEXT,
  first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_seen               INTEGER NOT NULL DEFAULT 1,
  creator_has_posted       BOOLEAN NOT NULL DEFAULT false,
  observation_notes        TEXT,
  confidence               TEXT NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high', 'confirmed')),
  source                   TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'openclaw', 'automation')),
  created_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observations_workspace
  ON public.creator_product_observations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_observations_creator
  ON public.creator_product_observations(creator_id);
CREATE INDEX IF NOT EXISTS idx_observations_product_name
  ON public.creator_product_observations(workspace_id, product_name);
CREATE INDEX IF NOT EXISTS idx_observations_first_seen
  ON public.creator_product_observations(workspace_id, first_seen_at DESC);

-- ── Opportunities (Scored Observations) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,
  observation_id           UUID NOT NULL REFERENCES public.creator_product_observations(id) ON DELETE CASCADE,
  score                    INTEGER NOT NULL DEFAULT 0
    CHECK (score >= 0 AND score <= 100),
  score_breakdown          JSONB NOT NULL DEFAULT '{}',
  status                   TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
  action_type              TEXT
    CHECK (action_type IN ('content_item', 'experiment', 'research', NULL)),
  action_ref_id            UUID,
  reviewed_by              UUID,
  reviewed_at              TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(observation_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace_status
  ON public.opportunities(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_score
  ON public.opportunities(workspace_id, score DESC);

-- ── Updated-at triggers ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_creator_watchlist_updated') THEN
    CREATE TRIGGER trg_creator_watchlist_updated
      BEFORE UPDATE ON public.creator_watchlist
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_observations_updated') THEN
    CREATE TRIGGER trg_observations_updated
      BEFORE UPDATE ON public.creator_product_observations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_opportunities_updated') THEN
    CREATE TRIGGER trg_opportunities_updated
      BEFORE UPDATE ON public.opportunities
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
