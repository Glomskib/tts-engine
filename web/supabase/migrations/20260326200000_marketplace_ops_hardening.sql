-- ============================================================
-- Marketplace Ops Hardening
-- Migration: 20260326200000_marketplace_ops_hardening.sql
-- ============================================================
-- Adds:
--   1. last_heartbeat_at + stalled_at columns on edit_jobs
--   2. version column on job_deliverables (auto-increment per job)
-- ============================================================

-- A) Heartbeat + stalled detection on edit_jobs
ALTER TABLE edit_jobs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS stalled_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_edit_jobs_heartbeat
  ON edit_jobs(last_heartbeat_at)
  WHERE job_status = 'in_progress';

-- B) Deliverable versioning
ALTER TABLE job_deliverables
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

-- ============================================================
-- DONE
-- ============================================================
