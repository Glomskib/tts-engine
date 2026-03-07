-- ============================================================================
-- Migration: Atomic job claim for ff_agent_dispatch
-- Fixes audit finding FF-AUD-008: concurrent process-jobs double-execution
--
-- The JS-side concurrency guard (SELECT running + UPDATE) has a TOCTOU race:
-- two concurrent workers can both pass the running-status check simultaneously.
--
-- Solution: a single UPDATE ... WHERE ... RETURNING that atomically:
--   1. Finds the dispatch row (by id)
--   2. Confirms no other row of the same job_type is in status='running'
--   3. Sets status='running' and returns the row — all in one atomic statement
--
-- Returns: the dispatch row if claimed, empty result if already running.
-- ============================================================================

BEGIN;

-- Drop if re-running migration
DROP FUNCTION IF EXISTS public.claim_dispatch_job(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.claim_dispatch_job(
  p_dispatch_id   uuid,
  p_job_type      text,
  p_ttl_minutes   integer DEFAULT 15
)
RETURNS SETOF public.ff_agent_dispatch
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_ttl_minutes || ' minutes')::interval;
  v_running_count integer;
BEGIN
  -- Check if there is an active running row for this job_type
  -- We only count rows newer than TTL to handle crashed workers
  SELECT COUNT(*) INTO v_running_count
  FROM public.ff_agent_dispatch
  WHERE job_type = p_job_type
    AND status = 'running'
    AND id != p_dispatch_id
    AND created_at > v_cutoff
  FOR UPDATE SKIP LOCKED; -- skip rows being updated by another transaction

  -- If another worker is actively running this job_type, don't claim
  IF v_running_count > 0 THEN
    RETURN;
  END IF;

  -- Atomically claim the dispatch row
  RETURN QUERY
  UPDATE public.ff_agent_dispatch
  SET
    status = 'running',
    updated_at = now()
  WHERE id = p_dispatch_id
    AND status = 'pending'  -- only claim if still pending
  RETURNING *;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.claim_dispatch_job(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dispatch_job(uuid, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_dispatch_job IS
  'Atomically claims a pending dispatch job. Returns the row if claimed, '
  'empty if another worker is already running the same job_type or the row '
  'is no longer pending. Replaces JS-level TOCTOU-prone SELECT+UPDATE pattern.';

COMMIT;
