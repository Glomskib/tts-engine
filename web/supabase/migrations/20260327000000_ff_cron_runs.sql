-- Cron heartbeat table: records every orchestrator (and future cron) invocation
-- so we can verify the cron is actually firing and spot silent failures.

create table if not exists ff_cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null check (status in ('running', 'ok', 'error')),
  http_method text,
  request_id  text,
  error       text,
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists idx_ff_cron_runs_job_started
  on ff_cron_runs (job, started_at desc);
