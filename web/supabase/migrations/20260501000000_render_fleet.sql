-- FlashFlow render fleet: M4 Mac workers pull jobs and run ffmpeg with VideoToolbox.
-- Workers don't expose any port — they poll these tables and atomically claim jobs.
-- Shotstack remains as fallback for jobs that exceed worker capacity.
--
-- Tables are prefixed ff_render_* to avoid colliding with the edit-builder's
-- unrelated `render_jobs` table from 20260428000000_edit_builder_schema.sql.

-- Clean up any partial state from a prior failed run of this migration
-- (when these were briefly named without the ff_ prefix).
DROP TABLE IF EXISTS public.render_workers CASCADE;
DROP FUNCTION IF EXISTS public.claim_next_render_job(UUID);
DROP FUNCTION IF EXISTS public.reap_stale_render_jobs();

CREATE TABLE IF NOT EXISTS public.ff_render_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT NOT NULL UNIQUE,
  tailscale_ip TEXT,
  cpu_brand TEXT,
  os_version TEXT,
  ffmpeg_version TEXT,
  concurrency_max INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'draining', 'offline')),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  jobs_failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ff_render_workers_status_heartbeat
  ON public.ff_render_workers(status, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS public.ff_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Job source / requester
  user_id UUID,
  correlation_id TEXT,
  kind TEXT NOT NULL DEFAULT 'shotstack_timeline',
  priority INTEGER NOT NULL DEFAULT 100,

  -- Input payload (Shotstack-shaped timeline + output spec)
  timeline JSONB NOT NULL,
  output_spec JSONB NOT NULL DEFAULT '{"format":"mp4","resolution":"hd","aspectRatio":"9:16","fps":30}'::jsonb,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'rendering', 'uploading', 'done', 'failed', 'fallback_shotstack')),
  claimed_by UUID REFERENCES public.ff_render_workers(id),
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,

  -- Output
  output_url TEXT,
  output_bytes BIGINT,
  duration_ms INTEGER,
  ffmpeg_log TEXT,
  error TEXT,

  -- Shotstack fallback
  shotstack_render_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ff_render_jobs_pending
  ON public.ff_render_jobs(priority ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ff_render_jobs_status_created
  ON public.ff_render_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ff_render_jobs_user
  ON public.ff_render_jobs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ff_render_jobs_claimed_stale
  ON public.ff_render_jobs(claimed_at)
  WHERE status IN ('claimed', 'rendering', 'uploading');

-- Atomic claim: workers call this RPC to grab the next job.
-- Uses SKIP LOCKED so multiple workers never collide.
CREATE OR REPLACE FUNCTION public.ff_claim_next_render_job(p_worker_id UUID)
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
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Reaper: returns stuck jobs (claimed > 5min, no heartbeat update) to pending.
CREATE OR REPLACE FUNCTION public.ff_reap_stale_render_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH reaped AS (
    UPDATE public.ff_render_jobs
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        claimed_by = NULL,
        claimed_at = NULL,
        error = COALESCE(error, '') || ' [reaped: stale claim]',
        updated_at = NOW()
    WHERE status IN ('claimed', 'rendering', 'uploading')
      AND claimed_at < NOW() - INTERVAL '5 minutes'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM reaped;
  RETURN v_count;
END;
$$;

ALTER TABLE public.ff_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ff_render_workers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ff_render_jobs IS
  'FlashFlow video render queue. Local M4 workers (ff_render_workers) pull pending jobs and run ffmpeg+VideoToolbox. Shotstack fallback when workers offline.';

COMMENT ON TABLE public.ff_render_workers IS
  'Registry of FlashFlow local Mac render workers. Heartbeats every 30s. Stale workers (no beat in 2min) are treated as offline.';

-- Storage bucket for rendered outputs.
-- Public read so customers can stream MP4s directly; writes via service role only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'renders',
  'renders',
  true,
  524288000,  -- 500 MB
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
ON CONFLICT (id) DO NOTHING;
