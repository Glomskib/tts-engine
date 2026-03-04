-- Drive Intake Guardrails: per-user settings, cost tracking, approval workflow
-- Depends on: 20260303200100_drive_intake_hardening.sql

-- ═══════════════════════════════════════════════════════════════════
-- 1. Per-user configurable intake settings
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drive_intake_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  max_file_mb integer NOT NULL DEFAULT 1500,
  max_video_minutes integer NOT NULL DEFAULT 60,
  allowed_mime_prefixes text[] NOT NULL DEFAULT '{video/}',
  monthly_file_cap integer NOT NULL DEFAULT 200,
  monthly_minutes_cap integer NOT NULL DEFAULT 1000,
  daily_file_cap integer NOT NULL DEFAULT 50,
  daily_minutes_cap integer NOT NULL DEFAULT 300,
  monthly_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 50.00,
  require_approval_above_mb integer,
  require_approval_above_min integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drive_intake_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intake settings"
  ON drive_intake_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on intake settings"
  ON drive_intake_settings FOR ALL
  USING (is_service_role());

CREATE INDEX IF NOT EXISTS idx_intake_settings_user
  ON drive_intake_settings (user_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Monthly usage/cost rollup table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drive_intake_usage_rollups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,  -- YYYY-MM
  total_files integer NOT NULL DEFAULT 0,
  total_minutes numeric(10,2) NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  jobs_succeeded integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  jobs_approved integer NOT NULL DEFAULT 0,
  jobs_deferred integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE drive_intake_usage_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intake rollups"
  ON drive_intake_usage_rollups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on intake rollups"
  ON drive_intake_usage_rollups FOR ALL
  USING (is_service_role());

CREATE INDEX IF NOT EXISTS idx_intake_rollups_lookup
  ON drive_intake_usage_rollups (user_id, month);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add new statuses to drive_intake_jobs
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE drive_intake_jobs DROP CONSTRAINT IF EXISTS drive_intake_jobs_status_check;
ALTER TABLE drive_intake_jobs ADD CONSTRAINT drive_intake_jobs_status_check
  CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','NEEDS_APPROVAL','DEFERRED'));

-- Add cost and approval columns to jobs
ALTER TABLE drive_intake_jobs
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(10,4),
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Atomic increment RPC for usage rollups
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_intake_rollup(
  p_user_id uuid,
  p_month text,
  p_files int DEFAULT 0,
  p_minutes numeric DEFAULT 0,
  p_bytes bigint DEFAULT 0,
  p_cost_usd numeric DEFAULT 0,
  p_status text DEFAULT 'succeeded'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO drive_intake_usage_rollups (
    user_id, month, total_files, total_minutes, total_bytes,
    estimated_cost_usd, jobs_succeeded, jobs_failed, jobs_approved, jobs_deferred,
    updated_at
  )
  VALUES (
    p_user_id, p_month, p_files, p_minutes, p_bytes,
    p_cost_usd,
    CASE WHEN p_status = 'succeeded' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'approved' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'deferred' THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    total_files = drive_intake_usage_rollups.total_files + p_files,
    total_minutes = drive_intake_usage_rollups.total_minutes + p_minutes,
    total_bytes = drive_intake_usage_rollups.total_bytes + p_bytes,
    estimated_cost_usd = drive_intake_usage_rollups.estimated_cost_usd + p_cost_usd,
    jobs_succeeded = drive_intake_usage_rollups.jobs_succeeded + CASE WHEN p_status = 'succeeded' THEN 1 ELSE 0 END,
    jobs_failed = drive_intake_usage_rollups.jobs_failed + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
    jobs_approved = drive_intake_usage_rollups.jobs_approved + CASE WHEN p_status = 'approved' THEN 1 ELSE 0 END,
    jobs_deferred = drive_intake_usage_rollups.jobs_deferred + CASE WHEN p_status = 'deferred' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;
