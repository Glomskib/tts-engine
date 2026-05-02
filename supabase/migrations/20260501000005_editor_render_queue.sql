-- ─────────────────────────────────────────────────────────────────────────────
-- Editor render-queue extension.
--
-- Adds rows usable for the AI Video Editor pipeline (web/lib/editor/pipeline.ts).
-- We REUSE the existing public.render_jobs table (created by
-- 20260401000000_render_jobs.sql) by introducing a new job_type value
-- 'editor_pipeline' and extending the JSON `payload` shape:
--   payload = {
--     edit_job_id: uuid,
--     ffmpeg_args: text[],
--     input_paths: text[],
--     output_path: text,
--   }
-- That keeps render_jobs as the single queue surface for both edit-builder
-- and editor-pipeline workloads.
--
-- This migration only adds:
--   - a helper enqueue() function for editor jobs
--   - a stale-row resetter (>10 min in 'processing'/'claimed' goes back to 'queued')
--
-- No table changes — the existing schema already covers the data we need.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_editor_render_job(
  p_edit_job_id UUID,
  p_ffmpeg_args TEXT[],
  p_input_paths TEXT[],
  p_output_path TEXT,
  p_workspace_id UUID DEFAULT NULL,
  p_priority INT DEFAULT 5
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.render_jobs (
    workspace_id, content_item_id, job_type, status, priority, payload
  ) VALUES (
    COALESCE(p_workspace_id, gen_random_uuid()),  -- editor-pipeline doesn't use workspace_id today
    NULL,
    'editor_pipeline',
    'queued',
    p_priority,
    jsonb_build_object(
      'edit_job_id', p_edit_job_id,
      'ffmpeg_args', to_jsonb(p_ffmpeg_args),
      'input_paths', to_jsonb(p_input_paths),
      'output_path', p_output_path
    )
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Health check: any render_jobs row stuck in 'processing'/'claimed' for >10
-- minutes goes back to 'queued' so a different worker can grab it. Cron
-- this every 2 minutes (Vercel cron or pg_cron).
CREATE OR REPLACE FUNCTION public.reset_stale_render_jobs_10min()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.render_jobs
  SET
    status       = 'queued',
    node_id      = NULL,
    started_at   = NULL,
    progress_pct = 0,
    progress_message = 'reset by stale-job watchdog (>10min)',
    retry_count  = retry_count + 1,
    updated_at   = NOW()
  WHERE status IN ('claimed', 'processing')
    AND COALESCE(started_at, claimed_at) < NOW() - INTERVAL '10 minutes'
    AND retry_count < max_retries;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
