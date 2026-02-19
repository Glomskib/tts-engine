-- ============================================================
-- Command Center v2: Additional tables from refined requirements
-- initiatives, agent_runs, risk_tier on tasks, score on ideas
-- ============================================================

-- ── 1. initiatives ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'business',  -- business, personal, nonprofit
  status text NOT NULL DEFAULT 'active',  -- active, paused, done
  owner_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_initiatives_status ON public.initiatives (status);

ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "initiatives_service_only" ON public.initiatives;
CREATE POLICY "initiatives_service_only" ON public.initiatives
  FOR ALL USING (public.is_service_role());

-- ── 2. Link cc_projects to initiatives ─────────────────────────
ALTER TABLE public.cc_projects
  ADD COLUMN IF NOT EXISTS initiative_id uuid REFERENCES public.initiatives(id) ON DELETE SET NULL;

-- ── 3. risk_tier on project_tasks ──────────────────────────────
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS risk_tier text NOT NULL DEFAULT 'low';

-- ── 4. score on ideas ──────────────────────────────────────────
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS score numeric;

-- ── 5. agent_runs (LLM cost + agent visibility) ────────────────
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  related_type text,         -- initiative, project, task, idea, null
  related_id uuid,
  action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',  -- queued, running, completed, failed
  started_at timestamptz,
  ended_at timestamptz,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  model_primary text,
  model_used text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON public.agent_runs (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON public.agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON public.agent_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_related ON public.agent_runs (related_type, related_id);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_service_only" ON public.agent_runs;
CREATE POLICY "agent_runs_service_only" ON public.agent_runs
  FOR ALL USING (public.is_service_role());

-- ── 6. Link finance_transactions to initiatives ────────────────
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS initiative_id uuid REFERENCES public.initiatives(id) ON DELETE SET NULL;

-- ── 7. Add 'inbox' and 'researching' to ideas status options ───
-- (status is text, no enum to alter – just documenting valid values)
-- Valid: inbox, queued, researching, researched, ready, building, shipped, killed
