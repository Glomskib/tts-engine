-- Agent dispatch log with idempotency constraint.
-- Used by POST /api/internal/agent-dispatch to track and deduplicate
-- job executions requested by external agents (e.g. OpenClaw).

CREATE TABLE public.ff_agent_dispatch (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | ok | error | skipped
  run_id          TEXT,                              -- links to ff_cron_runs.id
  summary         JSONB,
  error           TEXT,
  requested_by    TEXT,                              -- e.g. 'openclaw'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  UNIQUE(job_type, idempotency_key)
);

CREATE INDEX idx_ff_agent_dispatch_job_status ON public.ff_agent_dispatch(job_type, status);
