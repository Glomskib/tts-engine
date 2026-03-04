-- Research job results table.
-- Stores structured results from external_research dispatches.
-- Linked to ff_agent_dispatch via run_id.

CREATE TABLE IF NOT EXISTS public.ff_research_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_type        TEXT NOT NULL,             -- e.g. 'web_fetch', 'site_scan', 'serp_summary'
  query           TEXT NOT NULL,             -- human-readable research query
  targets         JSONB NOT NULL DEFAULT '[]', -- urls, domains, keywords
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'ok', 'error')),
  summary         JSONB,
  error           TEXT,
  requested_by    TEXT,
  run_id          TEXT,                      -- links to ff_agent_dispatch.run_id / ff_cron_runs.id
  idempotency_key TEXT NOT NULL UNIQUE,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX idx_ff_research_jobs_status ON public.ff_research_jobs(status);
CREATE INDEX idx_ff_research_jobs_job_type ON public.ff_research_jobs(job_type, created_at DESC);

COMMENT ON TABLE public.ff_research_jobs IS 'Persisted results from external_research dispatch jobs';
COMMENT ON COLUMN public.ff_research_jobs.job_type IS 'Research sub-type: web_fetch, site_scan, serp_summary, etc.';
COMMENT ON COLUMN public.ff_research_jobs.run_id IS 'Links to ff_cron_runs.id via agent dispatch';
