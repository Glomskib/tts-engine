-- ============================================================
-- Command Center: Admin-only operational dashboard tables
-- Migration: 20260218_command_center
-- Tables: usage_events, usage_daily_rollups, cc_projects,
--          project_tasks, task_events, ideas, idea_artifacts,
--          finance_accounts, finance_transactions
-- ============================================================

-- Helper: admin-only RLS policy function
-- Returns true only if the current JWT role is 'service_role'
-- (all command center access goes through supabaseAdmin / service role key)
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_setting('request.jwt.claim.role', true) = 'service_role';
$$;

-- ============================================================
-- 1. usage_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  model text NOT NULL,
  agent_id text NOT NULL DEFAULT 'unknown',
  project_id uuid,
  request_type text NOT NULL DEFAULT 'chat',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'ok',
  error_code text,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON public.usage_events (ts);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider_model ON public.usage_events (provider, model);
CREATE INDEX IF NOT EXISTS idx_usage_events_agent ON public.usage_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_project ON public.usage_events (project_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_events_service_only" ON public.usage_events;
CREATE POLICY "usage_events_service_only" ON public.usage_events
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 2. usage_daily_rollups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_daily_rollups (
  day date NOT NULL,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  agent_id text NOT NULL DEFAULT '',
  project_id uuid,
  requests integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_daily_rollups_pk
  ON public.usage_daily_rollups (day, provider, model, agent_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.usage_daily_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_daily_rollups_service_only" ON public.usage_daily_rollups;
CREATE POLICY "usage_daily_rollups_service_only" ON public.usage_daily_rollups
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 3. cc_projects (prefixed to avoid clash with any existing projects table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cc_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'active',
  owner text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cc_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_projects_service_only" ON public.cc_projects;
CREATE POLICY "cc_projects_service_only" ON public.cc_projects
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 4. project_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.cc_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assigned_agent text NOT NULL DEFAULT 'unassigned',
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks (status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_agent ON public.project_tasks (assigned_agent);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tasks_service_only" ON public.project_tasks;
CREATE POLICY "project_tasks_service_only" ON public.project_tasks
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 5. task_events (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  agent_id text NOT NULL DEFAULT 'system',
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON public.task_events (task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_ts ON public.task_events (ts);

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_events_service_only" ON public.task_events;
CREATE POLICY "task_events_service_only" ON public.task_events
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 6. ideas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  title text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued',
  mode text NOT NULL DEFAULT 'research_only',
  priority integer NOT NULL DEFAULT 3,
  last_processed_at timestamptz,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ideas_status ON public.ideas (status);
CREATE INDEX IF NOT EXISTS idx_ideas_priority ON public.ideas (priority);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ideas_service_only" ON public.ideas;
CREATE POLICY "ideas_service_only" ON public.ideas
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 7. idea_artifacts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.idea_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  artifact_type text NOT NULL,
  content_md text NOT NULL DEFAULT '',
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_idea_artifacts_idea ON public.idea_artifacts (idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_artifacts_ts ON public.idea_artifacts (ts);

ALTER TABLE public.idea_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idea_artifacts_service_only" ON public.idea_artifacts;
CREATE POLICY "idea_artifacts_service_only" ON public.idea_artifacts
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 8. finance_accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'bank',
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_accounts_service_only" ON public.finance_accounts;
CREATE POLICY "finance_accounts_service_only" ON public.finance_accounts
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 9. finance_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  direction text NOT NULL,
  amount numeric(12,2) NOT NULL,
  category text NOT NULL DEFAULT 'other',
  vendor text,
  memo text,
  project_id uuid REFERENCES public.cc_projects(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_ts ON public.finance_transactions (ts);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_account ON public.finance_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON public.finance_transactions (category);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_project ON public.finance_transactions (project_id);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_transactions_service_only" ON public.finance_transactions;
CREATE POLICY "finance_transactions_service_only" ON public.finance_transactions
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- Rollup refresh function (call from nightly job or on-demand)
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_usage_daily_rollups(target_day date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.usage_daily_rollups (day, provider, model, agent_id, project_id, requests, input_tokens, output_tokens, cost_usd, errors)
  SELECT
    target_day,
    provider,
    model,
    agent_id,
    project_id,
    COUNT(*)::integer,
    COALESCE(SUM(input_tokens), 0)::integer,
    COALESCE(SUM(output_tokens), 0)::integer,
    COALESCE(SUM(cost_usd), 0),
    COUNT(*) FILTER (WHERE status = 'error')::integer
  FROM public.usage_events
  WHERE ts >= target_day::timestamptz
    AND ts < (target_day + interval '1 day')::timestamptz
  GROUP BY provider, model, agent_id, project_id
  ON CONFLICT (day, provider, model, agent_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    requests = EXCLUDED.requests,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cost_usd = EXCLUDED.cost_usd,
    errors = EXCLUDED.errors;
$$;
