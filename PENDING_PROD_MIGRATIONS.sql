-- FlashFlow Phase 3: Script quality metadata + daily usage tracking
--
-- Adds:
--  * saved_skits.pain_points_addressed (jsonb)   — structured pain-point addressing
--  * saved_skits.winners_referenced   (jsonb)    — winner IDs injected into prompt
--  * saved_skits.script_score         (jsonb)    — deterministic 0-100 heuristic score
--  * daily_usage table                            — per-day soft-quota tracking

-- ---------- saved_skits additions ----------
ALTER TABLE saved_skits
  ADD COLUMN IF NOT EXISTS pain_points_addressed jsonb,
  ADD COLUMN IF NOT EXISTS winners_referenced    jsonb,
  ADD COLUMN IF NOT EXISTS script_score          jsonb;

-- ---------- daily_usage ----------
CREATE TABLE IF NOT EXISTS daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  scripts_generated int NOT NULL DEFAULT 0,
  pipeline_items    int NOT NULL DEFAULT 0,
  renders           int NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date
  ON daily_usage (user_id, usage_date DESC);

ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_usage_select_self ON daily_usage;
CREATE POLICY daily_usage_select_self
  ON daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- AI Video Editor — ai_edit_jobs table
-- Tracks user-initiated video edit jobs through the processing state machine.
-- NOTE: Renamed from `edit_jobs` to avoid collision with the pre-existing
-- editing-marketplace `edit_jobs` table used by the VA workflow.

create table if not exists ai_edit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Edit',
  mode text not null default 'quick',
  status text not null default 'draft',
  error text,
  script_id uuid,
  transcript jsonb,
  assets jsonb not null default '[]'::jsonb,
  output_url text,
  preview_url text,
  mode_options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_edit_jobs_user_created
  on ai_edit_jobs (user_id, created_at desc);

create index if not exists idx_ai_edit_jobs_status
  on ai_edit_jobs (status);

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_status_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_status_check
  check (status in ('draft','uploading','transcribing','building_timeline','rendering','completed','failed'));

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_mode_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_mode_check
  check (mode in ('quick','hook','ugc','talking_head'));

create or replace function ai_edit_jobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_edit_jobs_touch on ai_edit_jobs;
create trigger trg_ai_edit_jobs_touch
  before update on ai_edit_jobs
  for each row execute function ai_edit_jobs_touch_updated_at();

alter table ai_edit_jobs enable row level security;

drop policy if exists "Users manage own ai edit jobs" on ai_edit_jobs;
create policy "Users manage own ai edit jobs"
  on ai_edit_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Phase 1 hardening: queued status + timing columns for the AI Video Editor.
-- `queued` = enqueued into Inngest, not yet picked up by a worker.
-- `started_at` / `finished_at` drive the 30-minute timeout sweeper cron.

alter table ai_edit_jobs
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

create index if not exists idx_ai_edit_jobs_started_at
  on ai_edit_jobs (started_at)
  where started_at is not null;

alter table ai_edit_jobs drop constraint if exists ai_edit_jobs_status_check;
alter table ai_edit_jobs add constraint ai_edit_jobs_status_check
  check (status in (
    'draft',
    'uploading',
    'queued',
    'transcribing',
    'building_timeline',
    'rendering',
    'completed',
    'failed'
  ));

-- Phase 2: variations engine.
-- Adds parent_job_id so variation jobs link back to the source job,
-- and adds 'variations' as a tracked daily_usage column.

alter table ai_edit_jobs
  add column if not exists parent_job_id uuid references ai_edit_jobs(id) on delete set null;

create index if not exists idx_ai_edit_jobs_parent
  on ai_edit_jobs (parent_job_id)
  where parent_job_id is not null;

alter table daily_usage
  add column if not exists variations integer not null default 0;

-- 20260427100000_ownership_rls_hardening.sql
--
-- Ownership + RLS hardening pass for the AI Video Editor + FlashFlow core
-- tables.  This migration is strictly ADDITIVE — it does not drop or modify
-- pre-existing policies.  It is safe to run repeatedly (idempotent) via
-- DO-blocks that check pg_policies before CREATE POLICY.
--
-- Covers:
--   * edit_jobs      — full CRUD ownership + same-owner parent_job_id trigger
--   * daily_usage    — missing INSERT/UPDATE/DELETE policies
--   * saved_skits    — confirms CRUD policies, adds them if absent
--   * saved_hooks    — splits the FOR ALL "manage" policy into explicit
--                      SELECT/INSERT/UPDATE/DELETE so policy auditing tools
--                      see a complete set (additive — old policy stays)
--   * winners_bank   — confirms CRUD policies, adds them if absent
--   * videos         — adds strict client_user_id=auth.uid() policies for
--                      INSERT/UPDATE/DELETE.  SELECT is already handled by
--                      the API layer (admin client) and pre-existing policies
--                      remain in place; we add an owner SELECT policy too.
--   * storage.objects (bucket `edit-jobs`) — path-prefix ownership policies
--
-- Orphan cleanup (section at bottom):
--   * edit_jobs with NULL user_id → deleted if no assets, otherwise marked
--     'failed' with a clear error.  NEVER reassigns ownership.
--   * saved_skits with NULL user_id → logged via RAISE NOTICE; the table
--     declares user_id NOT NULL so there should be zero matches.

-- =========================================================================
-- 1) ai_edit_jobs
-- =========================================================================

ALTER TABLE IF EXISTS public.ai_edit_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Explicit per-verb policies in addition to the existing "FOR ALL" policy.
  -- Having both is fine: RLS takes the OR of matching permissive policies.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_edit_jobs'
      AND policyname = 'ai_edit_jobs_select_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_select_own ON public.ai_edit_jobs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_edit_jobs'
      AND policyname = 'ai_edit_jobs_insert_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_insert_own ON public.ai_edit_jobs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_edit_jobs'
      AND policyname = 'ai_edit_jobs_update_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_update_own ON public.ai_edit_jobs
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_edit_jobs'
      AND policyname = 'ai_edit_jobs_delete_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_delete_own ON public.ai_edit_jobs
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Same-owner parent_job_id trigger.  Prevents a user from pointing a
-- variation job at a source job owned by someone else.
CREATE OR REPLACE FUNCTION public.ai_edit_jobs_enforce_parent_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_owner uuid;
BEGIN
  IF NEW.parent_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO parent_owner
  FROM public.ai_edit_jobs
  WHERE id = NEW.parent_job_id;

  IF parent_owner IS NULL THEN
    -- Parent was deleted (parent_job_id FK is ON DELETE SET NULL) — allow.
    RETURN NEW;
  END IF;

  IF parent_owner <> NEW.user_id THEN
    RAISE EXCEPTION
      'ai_edit_jobs.parent_job_id (%) is owned by a different user (%), cannot link from job owned by %',
      NEW.parent_job_id, parent_owner, NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_edit_jobs_enforce_parent_owner ON public.ai_edit_jobs;
CREATE TRIGGER trg_ai_edit_jobs_enforce_parent_owner
  BEFORE INSERT OR UPDATE OF parent_job_id, user_id ON public.ai_edit_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ai_edit_jobs_enforce_parent_owner();

-- =========================================================================
-- 2) daily_usage — base migration only had SELECT
-- =========================================================================

ALTER TABLE IF EXISTS public.daily_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_usage'
      AND policyname = 'daily_usage_insert_self'
  ) THEN
    CREATE POLICY daily_usage_insert_self ON public.daily_usage
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_usage'
      AND policyname = 'daily_usage_update_self'
  ) THEN
    CREATE POLICY daily_usage_update_self ON public.daily_usage
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_usage'
      AND policyname = 'daily_usage_delete_self'
  ) THEN
    CREATE POLICY daily_usage_delete_self ON public.daily_usage
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 3) saved_skits — confirm CRUD, add only what's missing
-- =========================================================================

ALTER TABLE IF EXISTS public.saved_skits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_skits'
      AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY saved_skits_select_own ON public.saved_skits
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_skits'
      AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY saved_skits_insert_own ON public.saved_skits
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_skits'
      AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY saved_skits_update_own ON public.saved_skits
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_skits'
      AND cmd = 'DELETE'
  ) THEN
    CREATE POLICY saved_skits_delete_own ON public.saved_skits
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 4) saved_hooks — base migration only had a single FOR ALL policy.
-- Add explicit verb policies so auditors see a full set.
-- =========================================================================

ALTER TABLE IF EXISTS public.saved_hooks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_hooks'
      AND policyname = 'saved_hooks_select_own'
  ) THEN
    CREATE POLICY saved_hooks_select_own ON public.saved_hooks
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_hooks'
      AND policyname = 'saved_hooks_insert_own'
  ) THEN
    CREATE POLICY saved_hooks_insert_own ON public.saved_hooks
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_hooks'
      AND policyname = 'saved_hooks_update_own'
  ) THEN
    CREATE POLICY saved_hooks_update_own ON public.saved_hooks
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_hooks'
      AND policyname = 'saved_hooks_delete_own'
  ) THEN
    CREATE POLICY saved_hooks_delete_own ON public.saved_hooks
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 5) winners_bank — confirm CRUD (original migration already has them;
--    we re-assert for drift safety).
-- =========================================================================

ALTER TABLE IF EXISTS public.winners_bank ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'winners_bank'
      AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY winners_bank_select_own ON public.winners_bank
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'winners_bank'
      AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY winners_bank_insert_own ON public.winners_bank
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'winners_bank'
      AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY winners_bank_update_own ON public.winners_bank
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'winners_bank'
      AND cmd = 'DELETE'
  ) THEN
    CREATE POLICY winners_bank_delete_own ON public.winners_bank
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 6) videos — pre-existing RLS only scopes SELECT via assigned_to.
-- Add strict client_user_id=auth.uid() policies.  Additive: existing
-- "Users can view their assigned videos" policy is left alone.
-- =========================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos'
      AND column_name = 'client_user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'videos'
        AND policyname = 'videos_select_own_client'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY videos_select_own_client ON public.videos
          FOR SELECT USING (client_user_id = auth.uid())
      $POL$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'videos'
        AND policyname = 'videos_insert_own_client'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY videos_insert_own_client ON public.videos
          FOR INSERT WITH CHECK (client_user_id = auth.uid())
      $POL$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'videos'
        AND policyname = 'videos_update_own_client'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY videos_update_own_client ON public.videos
          FOR UPDATE USING (client_user_id = auth.uid())
          WITH CHECK (client_user_id = auth.uid())
      $POL$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'videos'
        AND policyname = 'videos_delete_own_client'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY videos_delete_own_client ON public.videos
          FOR DELETE USING (client_user_id = auth.uid())
      $POL$;
    END IF;
  ELSE
    RAISE NOTICE 'public.videos.client_user_id not found — skipping videos RLS hardening';
  END IF;
END $$;

-- =========================================================================
-- 7) Storage bucket `edit-jobs` — path-prefix ownership policies.
-- Paths are of form `<user_id>/<job_id>/<kind>/<filename>` so the user_id
-- is always the first path segment.  storage.foldername(name)[1] returns it.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ai_edit_jobs_bucket_select_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_bucket_select_own ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'edit-jobs'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ai_edit_jobs_bucket_insert_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_bucket_insert_own ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'edit-jobs'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ai_edit_jobs_bucket_update_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_bucket_update_own ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'edit-jobs'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'edit-jobs'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'ai_edit_jobs_bucket_delete_own'
  ) THEN
    CREATE POLICY ai_edit_jobs_bucket_delete_own ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'edit-jobs'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Insufficient privilege to create storage policies — apply via Supabase dashboard if needed';
END $$;

-- =========================================================================
-- 8) Orphan cleanup — NEVER reassigns, only deletes or marks failed.
-- =========================================================================

DO $$
DECLARE
  deleted_count int := 0;
  failed_count  int := 0;
BEGIN
  -- Delete NULL-owner edit_jobs that have no assets — nothing to preserve.
  WITH del AS (
    DELETE FROM public.ai_edit_jobs
    WHERE user_id IS NULL
      AND (assets IS NULL OR assets = '[]'::jsonb OR jsonb_array_length(assets) = 0)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM del;

  -- Mark the rest as failed with a clear error message.
  WITH upd AS (
    UPDATE public.ai_edit_jobs
    SET status = 'failed',
        error  = 'Orphaned job — no owner. Please re-create.',
        finished_at = COALESCE(finished_at, now())
    WHERE user_id IS NULL
      AND status <> 'failed'
    RETURNING 1
  )
  SELECT count(*) INTO failed_count FROM upd;

  RAISE NOTICE 'ai_edit_jobs orphan sweep: % deleted (no assets), % marked failed',
    deleted_count, failed_count;

EXCEPTION WHEN undefined_column THEN
  -- user_id cannot actually be NULL because the column is NOT NULL. If a
  -- schema drift caused that to change, surface it but don't block the
  -- migration.
  RAISE NOTICE 'ai_edit_jobs orphan sweep skipped — column drift detected';
END $$;

-- saved_skits.user_id is declared NOT NULL, so we only check for drift.
DO $$
DECLARE
  orphan_skits int := 0;
BEGIN
  SELECT count(*) INTO orphan_skits
  FROM public.saved_skits
  WHERE user_id IS NULL;

  IF orphan_skits > 0 THEN
    RAISE NOTICE 'saved_skits has % rows with NULL user_id — investigate schema drift', orphan_skits;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Adds the `edits` counter column to daily_usage so checkDailyLimit('edits')
-- can actually enforce free-tier caps. Without this, the helper fails open
-- and free users are effectively unlimited on edits.

alter table public.daily_usage
  add column if not exists edits integer not null default 0;
