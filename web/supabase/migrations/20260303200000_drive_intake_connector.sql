-- Migration: 20260303200000_drive_intake_connector
-- Google Drive Intake Connector — multi-tenant, encrypted token storage
-- Tables: drive_intake_connectors, drive_oauth_tokens, drive_intake_events, drive_intake_jobs

-- ── drive_intake_connectors ─────────────────────────────────────
-- Per-user connector configuration for Google Drive polling intake.
CREATE TABLE IF NOT EXISTS public.drive_intake_connectors (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                text NOT NULL DEFAULT 'google_drive',
  status                  text NOT NULL DEFAULT 'DISCONNECTED'
                            CHECK (status IN ('CONNECTED','DISCONNECTED','ERROR')),
  folder_id               text,
  folder_name             text,
  google_email            text,
  polling_interval_minutes integer NOT NULL DEFAULT 5,
  create_pipeline_item    boolean NOT NULL DEFAULT true,
  create_transcript       boolean NOT NULL DEFAULT true,
  create_edit_notes       boolean NOT NULL DEFAULT true,
  assign_to_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_poll_at            timestamptz,
  last_poll_error         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dic_user ON public.drive_intake_connectors (user_id);
CREATE INDEX IF NOT EXISTS idx_dic_status ON public.drive_intake_connectors (status);

ALTER TABLE public.drive_intake_connectors ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connector
DROP POLICY IF EXISTS "dic_owner" ON public.drive_intake_connectors;
CREATE POLICY "dic_owner" ON public.drive_intake_connectors
  FOR ALL USING (auth.uid() = user_id);

-- Admin/service can access all
DROP POLICY IF EXISTS "dic_service" ON public.drive_intake_connectors;
CREATE POLICY "dic_service" ON public.drive_intake_connectors
  FOR ALL USING (public.is_service_role());

-- ── drive_oauth_tokens ──────────────────────────────────────────
-- Encrypted OAuth refresh tokens — NEVER readable by client-side.
-- Only service role can read/write.
CREATE TABLE IF NOT EXISTS public.drive_oauth_tokens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'google_drive',
  access_token_enc  text,
  refresh_token_enc text NOT NULL,
  token_iv          text NOT NULL,
  token_tag         text NOT NULL,
  expiry_ts         timestamptz,
  scopes            text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Tokens: service-only. NEVER allow client reads.
DROP POLICY IF EXISTS "dot_service_only" ON public.drive_oauth_tokens;
CREATE POLICY "dot_service_only" ON public.drive_oauth_tokens
  FOR ALL USING (public.is_service_role());

-- ── drive_intake_events ─────────────────────────────────────────
-- Tracks every Drive file seen, prevents double-ingestion.
CREATE TABLE IF NOT EXISTS public.drive_intake_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'google_drive',
  drive_file_id     text NOT NULL,
  drive_file_name   text,
  drive_mime_type   text,
  drive_md5         text,
  drive_size_bytes  bigint,
  drive_modified_ts timestamptz,
  status            text NOT NULL DEFAULT 'NEW'
                      CHECK (status IN ('NEW','QUEUED','PROCESSED','SKIPPED','FAILED')),
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique: one event per user + Drive file
CREATE UNIQUE INDEX IF NOT EXISTS idx_die_user_file
  ON public.drive_intake_events (user_id, drive_file_id);

CREATE INDEX IF NOT EXISTS idx_die_status
  ON public.drive_intake_events (status, created_at DESC);

ALTER TABLE public.drive_intake_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own events
DROP POLICY IF EXISTS "die_owner_read" ON public.drive_intake_events;
CREATE POLICY "die_owner_read" ON public.drive_intake_events
  FOR SELECT USING (auth.uid() = user_id);

-- Service can do all
DROP POLICY IF EXISTS "die_service" ON public.drive_intake_events;
CREATE POLICY "die_service" ON public.drive_intake_events
  FOR ALL USING (public.is_service_role());

-- ── drive_intake_jobs ───────────────────────────────────────────
-- Processing queue: download → store → transcribe → edit notes → pipeline item.
CREATE TABLE IF NOT EXISTS public.drive_intake_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id    uuid NOT NULL REFERENCES public.drive_intake_connectors(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES public.drive_intake_events(id) ON DELETE CASCADE,
  drive_file_id   text NOT NULL,
  drive_file_name text,
  status          text NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  last_error      text,
  result          jsonb,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique: one job per user + Drive file
CREATE UNIQUE INDEX IF NOT EXISTS idx_dij_user_file
  ON public.drive_intake_jobs (user_id, drive_file_id);

CREATE INDEX IF NOT EXISTS idx_dij_status
  ON public.drive_intake_jobs (user_id, status);

CREATE INDEX IF NOT EXISTS idx_dij_connector
  ON public.drive_intake_jobs (connector_id, status);

ALTER TABLE public.drive_intake_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
DROP POLICY IF EXISTS "dij_owner_read" ON public.drive_intake_jobs;
CREATE POLICY "dij_owner_read" ON public.drive_intake_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Service can do all
DROP POLICY IF EXISTS "dij_service" ON public.drive_intake_jobs;
CREATE POLICY "dij_service" ON public.drive_intake_jobs
  FOR ALL USING (public.is_service_role());
