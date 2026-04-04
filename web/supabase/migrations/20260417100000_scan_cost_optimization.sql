-- Scan Cost Optimization: Cheap Probe + Hash-Based Change Detection
--
-- Adds fingerprint/probe fields to creator_sources for two-stage scanning:
-- Stage A (probe): cheap check → compare fingerprint → stop if unchanged
-- Stage B (full fetch): only when fingerprint differs

-- ── Fingerprint & probe fields on creator_sources ────────────────────

ALTER TABLE public.creator_sources
  ADD COLUMN IF NOT EXISTS last_probe_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_probe_status TEXT DEFAULT 'none'
    CHECK (last_probe_status IN ('none', 'unchanged', 'changed', 'error', 'unsupported')),
  ADD COLUMN IF NOT EXISTS last_source_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS last_full_fetch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_no_change INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_probes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_full_fetches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_probe_savings INTEGER NOT NULL DEFAULT 0;

-- ── Extended scan log fields ─────────────────────────────────────────

-- Expand status CHECK to include new statuses
ALTER TABLE public.creator_scan_log
  DROP CONSTRAINT IF EXISTS creator_scan_log_status_check;
ALTER TABLE public.creator_scan_log
  ADD CONSTRAINT creator_scan_log_status_check
    CHECK (status IN (
      'success', 'partial', 'error', 'rate_limited', 'no_change',
      'new_products', 'dispatched', 'updated',
      'probe_unchanged', 'probe_changed', 'probe_error'
    ));

ALTER TABLE public.creator_scan_log
  ADD COLUMN IF NOT EXISTS scan_mode TEXT DEFAULT 'full_fetch'
    CHECK (scan_mode IN ('probe', 'full_fetch', 'legacy')),
  ADD COLUMN IF NOT EXISTS changed BOOLEAN,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS observations_updated INTEGER DEFAULT 0;

-- ── Expand last_check_status to include probe statuses ───────────────

ALTER TABLE public.creator_sources
  DROP CONSTRAINT IF EXISTS creator_sources_last_check_status_check;
ALTER TABLE public.creator_sources
  ADD CONSTRAINT creator_sources_last_check_status_check
    CHECK (last_check_status IN (
      'pending', 'success', 'partial', 'error', 'rate_limited',
      'probe_unchanged', 'probe_changed', 'probe_error'
    ));
