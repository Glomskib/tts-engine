-- ─────────────────────────────────────────────────────────────────────────────
-- FlashFlow Footage Hub — Unified Media Asset System
-- Migration: 20260402000000_footage_hub.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE footage_stage AS ENUM (
  'raw_uploaded',
  'preprocessing',
  'ready_for_edit',
  'auto_edit_queued',
  'auto_edit_processing',
  'auto_edit_complete',
  'needs_review',
  'approved',
  'draft_ready',
  'posted',
  'failed',
  'archived'
);

CREATE TYPE footage_source_type AS ENUM (
  'clip_studio',
  'google_drive',
  'direct_upload',
  'ingestion',
  'render_output',
  'bot_upload'
);

CREATE TYPE footage_uploaded_by AS ENUM (
  'user',
  'miles_bot',
  'flash_bot',
  'admin',
  'system'
);

-- ── footage_items — central media inventory ───────────────────────────────────

CREATE TABLE IF NOT EXISTS footage_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  workspace_id          UUID NOT NULL,
  created_by            UUID,                         -- auth.users.id

  -- Lifecycle stage
  stage                 footage_stage NOT NULL DEFAULT 'raw_uploaded',

  -- File identity
  original_filename     TEXT NOT NULL,
  content_hash          TEXT,                         -- SHA-256 of file, for dedup
  storage_path          TEXT,                         -- path in Supabase Storage bucket
  storage_provider      TEXT NOT NULL DEFAULT 'supabase',
  storage_url           TEXT,                         -- public URL
  thumbnail_url         TEXT,                         -- extracted frame

  -- File properties
  byte_size             BIGINT,
  duration_sec          NUMERIC(10,3),
  resolution            TEXT,                         -- e.g. "1080x1920"
  codec                 TEXT,                         -- e.g. "h264"
  mime_type             TEXT DEFAULT 'video/mp4',

  -- Ingestion metadata
  source_type           footage_source_type NOT NULL DEFAULT 'direct_upload',
  source_ref_id         TEXT,                         -- e.g. render_job_id, ingestion_job_id
  uploaded_by           footage_uploaded_by NOT NULL DEFAULT 'user',

  -- AI-extracted metadata
  transcript_text       TEXT,
  transcript_status     TEXT DEFAULT 'none',          -- none|pending|processing|completed|failed
  keyframes             JSONB DEFAULT '[]',            -- [{url, timestamp_sec}]
  ai_analysis           JSONB,                        -- hook, caption, hashtags, etc.

  -- Auto-edit eligibility (set from workspace entitlement)
  auto_edit_eligible    BOOLEAN NOT NULL DEFAULT false,
  auto_edit_requested_at TIMESTAMPTZ,
  auto_edit_completed_at TIMESTAMPTZ,

  -- Versioning / lineage
  parent_footage_id     UUID REFERENCES footage_items(id) ON DELETE SET NULL,
  version_num           INT NOT NULL DEFAULT 1,

  -- Linkage
  content_item_id       UUID,                         -- FK to content_items (added below)
  render_job_id         UUID REFERENCES render_jobs(id) ON DELETE SET NULL,

  -- Extra metadata
  metadata              JSONB DEFAULT '{}',
  failure_reason        TEXT,

  -- Soft delete
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX footage_items_workspace_stage_idx   ON footage_items (workspace_id, stage, created_at DESC);
CREATE INDEX footage_items_content_item_idx      ON footage_items (content_item_id) WHERE content_item_id IS NOT NULL;
CREATE INDEX footage_items_render_job_idx        ON footage_items (render_job_id) WHERE render_job_id IS NOT NULL;
CREATE INDEX footage_items_parent_idx            ON footage_items (parent_footage_id) WHERE parent_footage_id IS NOT NULL;
CREATE INDEX footage_items_content_hash_idx      ON footage_items (workspace_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX footage_items_stage_idx             ON footage_items (stage, created_at DESC);
CREATE INDEX footage_items_source_type_idx       ON footage_items (source_type, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_footage_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER footage_items_updated_at
  BEFORE UPDATE ON footage_items
  FOR EACH ROW EXECUTE FUNCTION update_footage_items_updated_at();

-- ── footage_events — full audit trail ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footage_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  footage_item_id  UUID NOT NULL REFERENCES footage_items(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,           -- stage_change | upload | link | error | auto_edit_queued | etc.
  from_stage       footage_stage,
  to_stage         footage_stage,
  actor            TEXT,                    -- user id, bot name, or 'system'
  details          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX footage_events_item_idx ON footage_events (footage_item_id, created_at DESC);
CREATE INDEX footage_events_type_idx ON footage_events (event_type, created_at DESC);

-- ── Extend content_items ──────────────────────────────────────────────────────
-- Add primary_footage_id FK (nullable — backfilled over time)
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS primary_footage_id UUID REFERENCES footage_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_items_primary_footage_idx
  ON content_items (primary_footage_id) WHERE primary_footage_id IS NOT NULL;

-- ── Extend render_jobs ────────────────────────────────────────────────────────
-- Add footage_item_id for lineage tracking
ALTER TABLE render_jobs
  ADD COLUMN IF NOT EXISTS footage_item_id UUID REFERENCES footage_items(id) ON DELETE SET NULL;

-- Add output_footage_item_id — the footage_item created from this job's output
ALTER TABLE render_jobs
  ADD COLUMN IF NOT EXISTS output_footage_item_id UUID REFERENCES footage_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS render_jobs_footage_item_idx
  ON render_jobs (footage_item_id) WHERE footage_item_id IS NOT NULL;

-- ── Stage transition helper ───────────────────────────────────────────────────
-- Advance stage with validation + auto-log event
CREATE OR REPLACE FUNCTION advance_footage_stage(
  p_footage_id UUID,
  p_to_stage   footage_stage,
  p_actor      TEXT DEFAULT 'system',
  p_details    JSONB DEFAULT '{}'
)
RETURNS footage_items LANGUAGE plpgsql AS $$
DECLARE
  v_item    footage_items;
  v_allowed BOOLEAN;
BEGIN
  SELECT * INTO v_item FROM footage_items WHERE id = p_footage_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'footage_item % not found', p_footage_id;
  END IF;

  -- Allow same-stage (idempotent) or forward transitions
  -- (full validation handled in application layer — DB just logs)
  UPDATE footage_items
  SET stage = p_to_stage, updated_at = NOW()
  WHERE id = p_footage_id
  RETURNING * INTO v_item;

  INSERT INTO footage_events (footage_item_id, event_type, from_stage, to_stage, actor, details)
  VALUES (p_footage_id, 'stage_change', v_item.stage, p_to_stage, p_actor, p_details);

  RETURN v_item;
END;
$$;

-- ── Workspace auto-edit eligibility helper ────────────────────────────────────
-- Mark all footage in a workspace as eligible/ineligible
CREATE OR REPLACE FUNCTION set_workspace_auto_edit_eligible(
  p_workspace_id UUID,
  p_eligible     BOOLEAN
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
  UPDATE footage_items
  SET auto_edit_eligible = p_eligible, updated_at = NOW()
  WHERE workspace_id = p_workspace_id
    AND stage NOT IN ('posted', 'archived', 'failed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
