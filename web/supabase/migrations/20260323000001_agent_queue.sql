-- ============================================================
-- Agent Queue: claim-based work queue with atomic locking
-- Migration: 20260323000001_agent_queue
--
-- Replaces draft migration 20260322200000_agent_queue.
-- ============================================================

-- Drop the draft table if it exists (never held production data)
DROP TABLE IF EXISTS public.agent_queue CASCADE;

-- ============================================================
-- 1. ff_agent_queue — agent work items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_agent_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES public.ff_issue_reports(id) ON DELETE SET NULL,
  task_type text NOT NULL
    CHECK (task_type IN ('bug_fix', 'rollback', 'config_patch', 'investigation')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'running', 'done', 'failed')),
  priority int NOT NULL DEFAULT 500,        -- 100=critical, 500=medium, 900=low
  worker_id text,                            -- set on claim
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,                    -- set when status → running
  finished_at timestamptz,                   -- set when status → done or failed
  result_json jsonb,                         -- worker output
  error text                                 -- error message if failed
);

-- Compound index for claim query: find highest-priority pending tasks
CREATE INDEX idx_ff_agent_queue_claim
  ON public.ff_agent_queue (status, priority ASC, created_at ASC);

-- FK lookup
CREATE INDEX idx_ff_agent_queue_issue_id
  ON public.ff_agent_queue (issue_id);

-- RLS + service role policy
ALTER TABLE public.ff_agent_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_agent_queue_service_write" ON public.ff_agent_queue;
CREATE POLICY "ff_agent_queue_service_write" ON public.ff_agent_queue
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 2. ff_claim_next_task — atomic claim with FOR UPDATE SKIP LOCKED
-- ============================================================
CREATE OR REPLACE FUNCTION ff_claim_next_task(p_worker_id text)
RETURNS SETOF ff_agent_queue
LANGUAGE plpgsql AS $$
DECLARE
  v_task ff_agent_queue;
BEGIN
  SELECT * INTO v_task
  FROM ff_agent_queue
  WHERE status = 'pending'
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE ff_agent_queue
  SET status = 'claimed', worker_id = p_worker_id
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  RETURN NEXT v_task;
END;
$$;

-- ============================================================
-- 3. Documentation updates
-- ============================================================

-- Expanded issue lifecycle (no constraint change — status is a plain text column):
--   new → triaged → in_progress → pr_open → deployed → verified → closed
--   (+ dismissed at any point)
COMMENT ON TABLE public.ff_issue_reports IS
  'Issue reports. Status lifecycle: new → triaged → in_progress → pr_open → deployed → verified → closed (+ dismissed)';

-- Expanded action types (no constraint — action_type is a plain text column):
--   intake | triage | assign | resolve | dismiss | enqueue
COMMENT ON TABLE public.ff_issue_actions IS
  'Actions taken on issues. action_type values: intake, triage, assign, resolve, dismiss, enqueue';
