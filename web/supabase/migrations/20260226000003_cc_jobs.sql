-- ============================================================
-- Command Center: Job Tracker tables
-- Migration: 20260226000001_cc_jobs
-- Tables: cc_jobs, cc_job_events
-- ============================================================

-- ============================================================
-- 1. cc_jobs — freelance / outsourced job tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cc_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_url text,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead','applied','interviewing','hired','in_progress','delivered','closed')),
  platform text NOT NULL DEFAULT 'other'
    CHECK (platform IN ('upwork','fiverr','direct','other')),
  hourly_rate numeric(10,2),
  budget numeric(12,2),
  contact text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cc_jobs_status ON public.cc_jobs (status);
CREATE INDEX IF NOT EXISTS idx_cc_jobs_platform ON public.cc_jobs (platform);

ALTER TABLE public.cc_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_jobs_service_only" ON public.cc_jobs;
CREATE POLICY "cc_jobs_service_only" ON public.cc_jobs
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 2. cc_job_events — audit trail for jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cc_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.cc_jobs(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL DEFAULT 'note'
    CHECK (event_type IN ('status_change','note','created')),
  from_status text,
  to_status text,
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cc_job_events_job_id ON public.cc_job_events (job_id);

ALTER TABLE public.cc_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_job_events_service_only" ON public.cc_job_events;
CREATE POLICY "cc_job_events_service_only" ON public.cc_job_events
  FOR ALL USING (public.is_service_role());
