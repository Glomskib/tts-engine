-- render_jobs + render_nodes: Mac mini render node infrastructure
-- Phase 2: FlashFlow Mac Mini Render Node Integration

CREATE TABLE IF NOT EXISTS render_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  job_type        TEXT NOT NULL DEFAULT 'clip_render', -- clip_render | audio_extract | keyframe_analyze
  status          TEXT NOT NULL DEFAULT 'queued',      -- queued | claimed | processing | completed | failed | cancelled
  priority        INT NOT NULL DEFAULT 5,              -- 1=urgent, 5=normal, 10=low
  payload         JSONB NOT NULL DEFAULT '{}',         -- {clip_urls[], settings{}, product_id, context}
  result          JSONB,                               -- {final_video_url, analysis, keyframes[], transcript}
  node_id         TEXT,                                -- identifier of the mac mini that claimed it
  claimed_at      TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error           TEXT,
  progress_pct    INT NOT NULL DEFAULT 0,              -- 0-100
  progress_message TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for polling: node picks up queued jobs ordered by priority then age
CREATE INDEX render_jobs_queue_idx ON render_jobs (status, priority, created_at)
  WHERE status = 'queued';

-- Index for workspace job history
CREATE INDEX render_jobs_workspace_idx ON render_jobs (workspace_id, created_at DESC);

-- Index for content_item lookups
CREATE INDEX render_jobs_content_item_idx ON render_jobs (content_item_id)
  WHERE content_item_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_render_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER render_jobs_updated_at
  BEFORE UPDATE ON render_jobs
  FOR EACH ROW EXECUTE FUNCTION update_render_jobs_updated_at();

-- Atomic job claim function — uses FOR UPDATE SKIP LOCKED to prevent double-claiming
-- Returns the claimed job row or NULL if nothing available
CREATE OR REPLACE FUNCTION claim_render_job(
  p_node_id   TEXT,
  p_job_types TEXT[] DEFAULT ARRAY['clip_render']
)
RETURNS render_jobs LANGUAGE plpgsql AS $$
DECLARE
  v_job render_jobs;
BEGIN
  SELECT * INTO v_job
  FROM render_jobs
  WHERE status = 'queued'
    AND job_type = ANY(p_job_types)
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE render_jobs
  SET
    status     = 'claimed',
    node_id    = p_node_id,
    claimed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Re-queue stale jobs that were claimed but never started (node crashed before ack)
-- Called periodically; jobs claimed more than 5 minutes ago with no started_at are re-queued
CREATE OR REPLACE FUNCTION requeue_stale_render_jobs()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE render_jobs
  SET
    status       = 'queued',
    node_id      = NULL,
    claimed_at   = NULL,
    retry_count  = retry_count + 1,
    updated_at   = NOW()
  WHERE status = 'claimed'
    AND claimed_at < NOW() - INTERVAL '5 minutes'
    AND started_at IS NULL
    AND retry_count < max_retries;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mark permanently failed if max retries exceeded
  UPDATE render_jobs
  SET
    status     = 'failed',
    error      = 'Max retries exceeded — node never started processing',
    updated_at = NOW()
  WHERE status = 'claimed'
    AND claimed_at < NOW() - INTERVAL '5 minutes'
    AND started_at IS NULL
    AND retry_count >= max_retries;

  RETURN v_count;
END;
$$;

-- Also re-queue jobs stuck in 'processing' for more than 30 minutes
CREATE OR REPLACE FUNCTION requeue_stuck_render_jobs()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE render_jobs
  SET
    status       = 'queued',
    node_id      = NULL,
    claimed_at   = NULL,
    started_at   = NULL,
    progress_pct = 0,
    retry_count  = retry_count + 1,
    updated_at   = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - INTERVAL '30 minutes'
    AND retry_count < max_retries;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE render_jobs
  SET
    status     = 'failed',
    error      = 'Max retries exceeded — job timed out during processing',
    updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - INTERVAL '30 minutes'
    AND retry_count >= max_retries;

  RETURN v_count;
END;
$$;

-- Render node registry (heartbeat tracking)
-- Defined after render_jobs to allow FK reference
CREATE TABLE IF NOT EXISTS render_nodes (
  node_id         TEXT PRIMARY KEY,
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_job_id  UUID REFERENCES render_jobs(id) ON DELETE SET NULL,
  ffmpeg_version  TEXT,
  platform        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX render_nodes_last_seen_idx ON render_nodes (last_seen DESC);
