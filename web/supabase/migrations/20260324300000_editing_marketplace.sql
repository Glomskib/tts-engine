-- ============================================================
-- Editing Marketplace + B-roll Scout Storage
-- Migration: 20260324000001_editing_marketplace.sql
-- ============================================================
-- Creates the full multi-tenant editing marketplace data model:
--   profiles, clients, memberships, VA profiles, plans, usage,
--   marketplace scripts, assets, edit jobs, feedback, deliverables,
--   events, b-roll library, and strict RLS policies.
--
-- NOTE: "mp_scripts" is used instead of "scripts" because the
-- existing scripts table (concept-based) already exists.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE mp_role AS ENUM ('client_owner', 'client_member', 'va_editor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_member_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE va_rate_mode AS ENUM ('per_video', 'base_plus_bonus');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_plan_tier AS ENUM ('pool_15', 'dedicated_30', 'scale_50', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_script_status AS ENUM (
    'draft', 'ready_to_record', 'recorded', 'queued', 'editing',
    'in_review', 'changes_requested', 'approved', 'posted',
    'blocked', 'error', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_asset_type AS ENUM (
    'raw_folder', 'raw_video', 'edited_video', 'reference',
    'broll_ai', 'broll_stock', 'broll_reference'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_job_status AS ENUM (
    'queued', 'claimed', 'in_progress', 'submitted',
    'changes_requested', 'approved', 'posted',
    'blocked', 'error', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_feedback_role AS ENUM ('client', 'va', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_deliverable_type AS ENUM ('main', 'variant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mp_event_type AS ENUM (
    'created', 'recorded', 'queued', 'claimed', 'started',
    'submitted', 'changes_requested', 'approved', 'posted',
    'blocked', 'error', 'retried', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE broll_source_type AS ENUM ('ai', 'stock', 'reference');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- A) PROFILES / ROLES / MEMBERSHIP
-- ============================================================

CREATE TABLE IF NOT EXISTS mp_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  display_name text,
  role       mp_role NOT NULL DEFAULT 'client_owner',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  client_code   text UNIQUE NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES mp_profiles(id),
  timezone      text NOT NULL DEFAULT 'America/New_York',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code);

CREATE TABLE IF NOT EXISTS client_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES mp_profiles(id) ON DELETE CASCADE,
  member_role mp_member_role NOT NULL DEFAULT 'member',
  UNIQUE (client_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_memberships_user ON client_memberships(user_id);

CREATE TABLE IF NOT EXISTS va_profiles (
  user_id    uuid PRIMARY KEY REFERENCES mp_profiles(id) ON DELETE CASCADE,
  languages  text[] NOT NULL DEFAULT '{}',
  rate_mode  va_rate_mode NOT NULL DEFAULT 'per_video',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- B) PLANS / USAGE
-- ============================================================

CREATE TABLE IF NOT EXISTS client_plans (
  client_id              uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  plan_tier              mp_plan_tier NOT NULL DEFAULT 'pool_15',
  daily_cap              int NOT NULL DEFAULT 15,
  monthly_cap            int,
  sla_hours              int NOT NULL DEFAULT 48,
  allow_variants         boolean NOT NULL DEFAULT true,
  dedicated_editor_user_id uuid REFERENCES mp_profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_usage_daily (
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date            date NOT NULL,
  submitted_count int NOT NULL DEFAULT 0,
  recorded_count  int NOT NULL DEFAULT 0,
  edited_count    int NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, date)
);

-- ============================================================
-- C) SCRIPTS / ASSETS / JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS mp_scripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title             text NOT NULL,
  script_text       text,
  notes             text,
  broll_suggestions text,
  "references"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  keep_verbatim     text,
  variation_map     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            mp_script_status NOT NULL DEFAULT 'draft',
  created_by        uuid REFERENCES mp_profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_scripts_client ON mp_scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_mp_scripts_status ON mp_scripts(status);
CREATE INDEX IF NOT EXISTS idx_mp_scripts_created_by ON mp_scripts(created_by);

CREATE TABLE IF NOT EXISTS script_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id   uuid NOT NULL REFERENCES mp_scripts(id) ON DELETE CASCADE,
  asset_type  mp_asset_type NOT NULL,
  label       text,
  url         text,
  created_by  uuid REFERENCES mp_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_assets_script ON script_assets(script_id);

CREATE TABLE IF NOT EXISTS edit_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id       uuid UNIQUE NOT NULL REFERENCES mp_scripts(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  job_status      mp_job_status NOT NULL DEFAULT 'queued',
  priority        int NOT NULL DEFAULT 0,
  claimed_by      uuid REFERENCES mp_profiles(id),
  claimed_at      timestamptz,
  started_at      timestamptz,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  posted_at       timestamptz,
  due_at          timestamptz,
  blocked_reason  text,
  error_code      text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edit_jobs_client ON edit_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_edit_jobs_status ON edit_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_edit_jobs_claimed ON edit_jobs(claimed_by);
CREATE INDEX IF NOT EXISTS idx_edit_jobs_due ON edit_jobs(due_at);

CREATE TABLE IF NOT EXISTS job_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES edit_jobs(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES mp_profiles(id),
  author_role     mp_feedback_role NOT NULL,
  message         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_feedback_job ON job_feedback(job_id);

CREATE TABLE IF NOT EXISTS job_deliverables (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES edit_jobs(id) ON DELETE CASCADE,
  deliverable_type mp_deliverable_type NOT NULL DEFAULT 'main',
  label            text,
  url              text NOT NULL,
  created_by       uuid REFERENCES mp_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_deliverables_job ON job_deliverables(job_id);

CREATE TABLE IF NOT EXISTS job_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES edit_jobs(id) ON DELETE CASCADE,
  event_type      mp_event_type NOT NULL,
  actor_user_id   uuid REFERENCES mp_profiles(id),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_type ON job_events(event_type);

-- ============================================================
-- D) B-ROLL LIBRARY
-- ============================================================

CREATE TABLE IF NOT EXISTS broll_assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash              text UNIQUE NOT NULL,
  source_type       broll_source_type NOT NULL,
  client_code       text NOT NULL,
  script_id         uuid REFERENCES mp_scripts(id) ON DELETE SET NULL,
  storage_bucket    text NOT NULL,
  storage_path      text NOT NULL,
  local_cached      boolean NOT NULL DEFAULT false,
  local_path        text,
  duration_seconds  int,
  tags              text[] NOT NULL DEFAULT '{}',
  prompt            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broll_assets_hash ON broll_assets(hash);
CREATE INDEX IF NOT EXISTS idx_broll_assets_client ON broll_assets(client_code);
CREATE INDEX IF NOT EXISTS idx_broll_assets_script ON broll_assets(script_id);

CREATE TABLE IF NOT EXISTS script_broll_links (
  script_id       uuid NOT NULL REFERENCES mp_scripts(id) ON DELETE CASCADE,
  broll_asset_id  uuid NOT NULL REFERENCES broll_assets(id) ON DELETE CASCADE,
  recommended_for text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (script_id, broll_asset_id)
);

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================

CREATE OR REPLACE FUNCTION mp_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mp_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION mp_is_va()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mp_profiles
    WHERE id = auth.uid() AND role = 'va_editor'
  );
$$;

CREATE OR REPLACE FUNCTION mp_user_client_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM client_memberships
  WHERE user_id = auth.uid();
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE mp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE broll_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_broll_links ENABLE ROW LEVEL SECURITY;

-- ----- mp_profiles -----
CREATE POLICY "mp_profiles_own" ON mp_profiles
  FOR ALL USING (id = auth.uid());
CREATE POLICY "mp_profiles_admin" ON mp_profiles
  FOR ALL USING (mp_is_admin());

-- ----- clients -----
CREATE POLICY "clients_member" ON clients
  FOR SELECT USING (id IN (SELECT mp_user_client_ids()));
CREATE POLICY "clients_owner_modify" ON clients
  FOR ALL USING (owner_user_id = auth.uid());
CREATE POLICY "clients_admin" ON clients
  FOR ALL USING (mp_is_admin());

-- ----- client_memberships -----
CREATE POLICY "memberships_own" ON client_memberships
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "memberships_client_owner" ON client_memberships
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );
CREATE POLICY "memberships_admin" ON client_memberships
  FOR ALL USING (mp_is_admin());

-- ----- va_profiles -----
CREATE POLICY "va_profiles_own" ON va_profiles
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "va_profiles_admin" ON va_profiles
  FOR ALL USING (mp_is_admin());

-- ----- client_plans -----
CREATE POLICY "plans_member" ON client_plans
  FOR SELECT USING (client_id IN (SELECT mp_user_client_ids()));
CREATE POLICY "plans_admin" ON client_plans
  FOR ALL USING (mp_is_admin());

-- ----- plan_usage_daily -----
CREATE POLICY "usage_member" ON plan_usage_daily
  FOR SELECT USING (client_id IN (SELECT mp_user_client_ids()));
CREATE POLICY "usage_admin" ON plan_usage_daily
  FOR ALL USING (mp_is_admin());

-- ----- mp_scripts -----
CREATE POLICY "scripts_client" ON mp_scripts
  FOR ALL USING (client_id IN (SELECT mp_user_client_ids()));
CREATE POLICY "scripts_va_read" ON mp_scripts
  FOR SELECT USING (
    mp_is_va() AND EXISTS (
      SELECT 1 FROM edit_jobs ej
      WHERE ej.script_id = mp_scripts.id
      AND ej.job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
    )
  );
CREATE POLICY "scripts_admin" ON mp_scripts
  FOR ALL USING (mp_is_admin());

-- ----- script_assets -----
CREATE POLICY "assets_client" ON script_assets
  FOR ALL USING (
    script_id IN (
      SELECT id FROM mp_scripts WHERE client_id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "assets_va_read" ON script_assets
  FOR SELECT USING (
    mp_is_va() AND script_id IN (
      SELECT s.id FROM mp_scripts s
      JOIN edit_jobs ej ON ej.script_id = s.id
      WHERE ej.job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
    )
  );
CREATE POLICY "assets_admin" ON script_assets
  FOR ALL USING (mp_is_admin());

-- ----- edit_jobs -----
-- Clients see only their own jobs
CREATE POLICY "jobs_client" ON edit_jobs
  FOR ALL USING (client_id IN (SELECT mp_user_client_ids()));

-- VAs: read queued jobs (job board) + full access to claimed/active jobs
CREATE POLICY "jobs_va_board" ON edit_jobs
  FOR SELECT USING (
    mp_is_va() AND job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
  );
-- VAs: update only jobs they claimed
CREATE POLICY "jobs_va_update" ON edit_jobs
  FOR UPDATE USING (
    mp_is_va() AND claimed_by = auth.uid()
  );

CREATE POLICY "jobs_admin" ON edit_jobs
  FOR ALL USING (mp_is_admin());

-- ----- job_feedback -----
CREATE POLICY "feedback_client" ON job_feedback
  FOR ALL USING (
    job_id IN (
      SELECT id FROM edit_jobs WHERE client_id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "feedback_va" ON job_feedback
  FOR ALL USING (
    mp_is_va() AND (
      author_user_id = auth.uid()
      OR job_id IN (
        SELECT id FROM edit_jobs WHERE claimed_by = auth.uid()
      )
    )
  );
CREATE POLICY "feedback_admin" ON job_feedback
  FOR ALL USING (mp_is_admin());

-- ----- job_deliverables -----
CREATE POLICY "deliverables_client" ON job_deliverables
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM edit_jobs WHERE client_id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "deliverables_va" ON job_deliverables
  FOR ALL USING (
    mp_is_va() AND job_id IN (
      SELECT id FROM edit_jobs WHERE claimed_by = auth.uid()
    )
  );
CREATE POLICY "deliverables_admin" ON job_deliverables
  FOR ALL USING (mp_is_admin());

-- ----- job_events -----
CREATE POLICY "events_client" ON job_events
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM edit_jobs WHERE client_id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "events_va" ON job_events
  FOR SELECT USING (
    mp_is_va() AND job_id IN (
      SELECT id FROM edit_jobs
      WHERE claimed_by = auth.uid()
      OR job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
    )
  );
CREATE POLICY "events_admin" ON job_events
  FOR ALL USING (mp_is_admin());

-- ----- broll_assets -----
CREATE POLICY "broll_client" ON broll_assets
  FOR SELECT USING (
    client_code IN (
      SELECT c.client_code FROM clients c
      WHERE c.id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "broll_va_read" ON broll_assets
  FOR SELECT USING (
    mp_is_va() AND script_id IN (
      SELECT s.id FROM mp_scripts s
      JOIN edit_jobs ej ON ej.script_id = s.id
      WHERE ej.job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
    )
  );
CREATE POLICY "broll_admin" ON broll_assets
  FOR ALL USING (mp_is_admin());

-- ----- script_broll_links -----
CREATE POLICY "broll_links_client" ON script_broll_links
  FOR ALL USING (
    script_id IN (
      SELECT id FROM mp_scripts WHERE client_id IN (SELECT mp_user_client_ids())
    )
  );
CREATE POLICY "broll_links_va" ON script_broll_links
  FOR SELECT USING (
    mp_is_va() AND script_id IN (
      SELECT s.id FROM mp_scripts s
      JOIN edit_jobs ej ON ej.script_id = s.id
      WHERE ej.job_status IN ('queued', 'claimed', 'in_progress', 'submitted', 'changes_requested')
    )
  );
CREATE POLICY "broll_links_admin" ON script_broll_links
  FOR ALL USING (mp_is_admin());

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION mp_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER mp_scripts_updated_at
  BEFORE UPDATE ON mp_scripts
  FOR EACH ROW EXECUTE FUNCTION mp_set_updated_at();

CREATE TRIGGER edit_jobs_updated_at
  BEFORE UPDATE ON edit_jobs
  FOR EACH ROW EXECUTE FUNCTION mp_set_updated_at();

CREATE TRIGGER client_plans_updated_at
  BEFORE UPDATE ON client_plans
  FOR EACH ROW EXECUTE FUNCTION mp_set_updated_at();

-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or service role)
-- These are idempotent INSERT ... ON CONFLICT DO NOTHING
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('broll-generated', 'broll-generated', false),
  ('broll-stock', 'broll-stock', false),
  ('broll-library', 'broll-library', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admin can do anything, clients/VAs can read their assets
CREATE POLICY "broll_storage_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id IN ('broll-generated', 'broll-stock', 'broll-library')
    AND mp_is_admin()
  );

CREATE POLICY "broll_storage_authenticated_read" ON storage.objects
  FOR SELECT USING (
    bucket_id IN ('broll-generated', 'broll-stock', 'broll-library')
    AND auth.role() = 'authenticated'
  );

-- ============================================================
-- DONE
-- ============================================================
