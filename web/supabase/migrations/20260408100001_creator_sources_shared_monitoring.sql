-- ══════════════════════════════════════════════════════════════════
-- Creator Sources — Shared Global Monitoring Infrastructure
--
-- Centralises creator monitoring so the same creator is never
-- scanned redundantly across multiple workspaces.
-- ══════════════════════════════════════════════════════════════════

-- ── Global Creator Source (one record per platform+handle) ─────

CREATE TABLE IF NOT EXISTS public.creator_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform         TEXT NOT NULL DEFAULT 'tiktok'
    CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'other')),
  handle           TEXT NOT NULL,
  display_name     TEXT,
  avatar_url       TEXT,
  follower_count   INTEGER,
  -- Monitoring state
  monitoring_status TEXT NOT NULL DEFAULT 'active'
    CHECK (monitoring_status IN ('active', 'paused', 'stale', 'error')),
  last_checked_at  TIMESTAMPTZ,
  next_check_at    TIMESTAMPTZ,
  last_check_status TEXT DEFAULT 'pending'
    CHECK (last_check_status IN ('pending', 'success', 'partial', 'error', 'rate_limited')),
  last_check_error TEXT,
  check_count      INTEGER NOT NULL DEFAULT 0,
  -- How many workspaces actively watch this creator
  active_watcher_count INTEGER NOT NULL DEFAULT 0,
  -- Highest entitled scan cadence (hours between scans)
  scan_interval_hours INTEGER NOT NULL DEFAULT 24,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_creator_sources_next_check
  ON public.creator_sources(next_check_at ASC)
  WHERE monitoring_status = 'active';

CREATE INDEX IF NOT EXISTS idx_creator_sources_platform_handle
  ON public.creator_sources(platform, handle);

-- ── Link watchlist entries to shared sources ────────────────────

ALTER TABLE public.creator_watchlist
  ADD COLUMN IF NOT EXISTS creator_source_id UUID REFERENCES public.creator_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_source
  ON public.creator_watchlist(creator_source_id)
  WHERE creator_source_id IS NOT NULL;

-- ── Link observations to shared sources ─────────────────────────

ALTER TABLE public.creator_product_observations
  ADD COLUMN IF NOT EXISTS creator_source_id UUID REFERENCES public.creator_sources(id) ON DELETE SET NULL;

-- ── Scan log for audit + cost tracking ──────────────────────────

CREATE TABLE IF NOT EXISTS public.creator_scan_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_source_id UUID NOT NULL REFERENCES public.creator_sources(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'error', 'rate_limited', 'no_change')),
  products_found   INTEGER DEFAULT 0,
  new_observations INTEGER DEFAULT 0,
  duration_ms      INTEGER,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_log_source
  ON public.creator_scan_log(creator_source_id, created_at DESC);

-- ── Updated-at trigger for creator_sources ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_creator_sources_updated') THEN
    CREATE TRIGGER trg_creator_sources_updated
      BEFORE UPDATE ON public.creator_sources
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── Function: recalculate watcher count + scan interval ─────────

CREATE OR REPLACE FUNCTION public.recalc_creator_source_watchers(p_source_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.creator_sources
  SET
    active_watcher_count = (
      SELECT COUNT(*) FROM public.creator_watchlist
      WHERE creator_source_id = p_source_id AND is_active = true
    ),
    updated_at = now()
  WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql;
