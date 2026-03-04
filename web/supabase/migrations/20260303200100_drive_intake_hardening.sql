-- Drive Intake Hardening: usage limits, queue protection, failure tracking
-- Depends on: 20260303200000_drive_intake_connector.sql

-- ═══════════════════════════════════════════════════════════════════
-- 1. Monthly usage tracking table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drive_intake_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL, -- YYYY-MM format
  total_files int NOT NULL DEFAULT 0,
  total_minutes numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE drive_intake_usage ENABLE ROW LEVEL SECURITY;

-- Owner can read their own usage
CREATE POLICY "Users can view own intake usage"
  ON drive_intake_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all
CREATE POLICY "Service role full access on intake usage"
  ON drive_intake_usage FOR ALL
  USING (is_service_role());

-- ═══════════════════════════════════════════════════════════════════
-- 2. Add failure_reason + next_attempt_at to jobs table
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE drive_intake_jobs
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Queue protection: claim jobs atomically (SKIP LOCKED)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION claim_intake_jobs(batch_limit int DEFAULT 5)
RETURNS SETOF drive_intake_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE drive_intake_jobs
  SET status = 'RUNNING',
      attempts = attempts + 1,
      started_at = now(),
      updated_at = now()
  WHERE id IN (
    SELECT id FROM drive_intake_jobs
    WHERE status = 'PENDING'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ORDER BY created_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Atomic usage increment function
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_intake_usage(
  p_user_id uuid,
  p_month text,
  p_files int DEFAULT 1,
  p_minutes numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO drive_intake_usage (user_id, month, total_files, total_minutes, updated_at)
  VALUES (p_user_id, p_month, p_files, p_minutes, now())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    total_files = drive_intake_usage.total_files + p_files,
    total_minutes = drive_intake_usage.total_minutes + p_minutes,
    updated_at = now();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Index for efficient job claiming
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_intake_jobs_claimable
  ON drive_intake_jobs (created_at ASC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_intake_usage_lookup
  ON drive_intake_usage (user_id, month);
