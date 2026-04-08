-- FlashFlow Phase 3: Script quality metadata + daily usage tracking
--
-- Adds:
--  * saved_skits.pain_points_addressed (jsonb)   — structured pain-point addressing
--  * saved_skits.winners_referenced   (jsonb)    — winner IDs injected into prompt
--  * saved_skits.script_score         (jsonb)    — deterministic 0-100 heuristic score
--  * daily_usage table                            — per-day soft-quota tracking

-- ---------- saved_skits additions ----------
ALTER TABLE saved_skits
  ADD COLUMN IF NOT EXISTS pain_points_addressed jsonb,
  ADD COLUMN IF NOT EXISTS winners_referenced    jsonb,
  ADD COLUMN IF NOT EXISTS script_score          jsonb;

-- ---------- daily_usage ----------
CREATE TABLE IF NOT EXISTS daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  scripts_generated int NOT NULL DEFAULT 0,
  pipeline_items    int NOT NULL DEFAULT 0,
  renders           int NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date
  ON daily_usage (user_id, usage_date DESC);

ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_usage_select_self ON daily_usage;
CREATE POLICY daily_usage_select_self
  ON daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);
