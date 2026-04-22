-- Hard capability gate for the local render fleet.
--
-- Problem this fixes:
--   ff_render_jobs rows of kind 'shotstack_timeline' carry Shotstack-shaped
--   timelines with video-asset clips. The local Mac-mini workers use ffmpeg and
--   cannot render video-asset timelines — they fail with
--   "unsupported_feature: asset type 'video'".
--
-- Before this migration, ff_claim_next_render_job(p_worker_id) took ANY pending
-- row, so shotstack_timeline jobs could be stolen by a local worker.
--
-- After: the RPC accepts p_allowed_kinds (default ['clip_render']) and only
-- claims rows whose kind is in that set. The default is the hard guard —
-- even a worker that hasn't been updated to pass the parameter will correctly
-- skip shotstack_timeline rows.

CREATE OR REPLACE FUNCTION public.ff_claim_next_render_job(
  p_worker_id UUID,
  p_allowed_kinds TEXT[] DEFAULT ARRAY['clip_render']
)
RETURNS public.ff_render_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  v_job public.ff_render_jobs;
BEGIN
  UPDATE public.ff_render_jobs
  SET status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = NOW(),
      updated_at = NOW(),
      attempts = attempts + 1
  WHERE id = (
    SELECT id FROM public.ff_render_jobs
    WHERE status = 'pending'
      AND kind = ANY(p_allowed_kinds)
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

COMMENT ON FUNCTION public.ff_claim_next_render_job(UUID, TEXT[]) IS
  'Atomic job claim for the local render fleet. Capability-gated: the RPC only returns jobs whose kind is in p_allowed_kinds (default [''clip_render'']). shotstack_timeline jobs are NEVER claimed by local workers — they require Shotstack''s video-asset renderer.';
