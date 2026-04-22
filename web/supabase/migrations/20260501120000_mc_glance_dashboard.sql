-- Mission Control — Glance dashboard support
-- Adds:
--   1) expected_value_usd / realized_value_usd on project_tasks (for per-agent ROI)
--   2) mc_operator_feed table (Bolt pushes items here for Brandon's "On your plate" zone)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Task monetary value columns
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS expected_value_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS realized_value_usd NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_project_tasks_expected_value
  ON project_tasks (assigned_agent, created_at)
  WHERE expected_value_usd IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Operator feed — items Bolt (or any MC-authed agent) pushes for the owner
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mc_operator_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('email', 'calendar', 'approval', 'flag', 'fyi')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  title TEXT NOT NULL,
  one_line TEXT,
  action_url TEXT,
  action_label TEXT,
  lane TEXT,
  source_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mc_operator_feed_active
  ON mc_operator_feed (created_at DESC)
  WHERE dismissed_at IS NULL AND acted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mc_operator_feed_urgency
  ON mc_operator_feed (urgency, created_at DESC)
  WHERE dismissed_at IS NULL AND acted_at IS NULL;
