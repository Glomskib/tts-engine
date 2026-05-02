-- ─────────────────────────────────────────────────────────────────────────────
-- script_attempts: track multiple takes per scripted segment of an edit job.
--
-- Use case: user records 5 takes of "today I'm reviewing the matcha". The
-- editor pipeline picks the best automatically, but the user wants to see
-- all 5 + override if it picked wrong.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.script_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_job_id UUID NOT NULL,                       -- references ai_edit_jobs(id) — kept loose to avoid migration ordering pain
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  /** A "script group" key — same value across takes of the same scripted line. */
  script_group TEXT NOT NULL,
  script_text TEXT NOT NULL,
  take_number INT NOT NULL,                        -- 1, 2, 3, ... per group

  /** Which raw asset path this take came from (storage path, edit-jobs bucket) */
  asset_path TEXT NOT NULL,
  segment_start NUMERIC(10,3),                     -- start time within the asset (seconds)
  segment_end NUMERIC(10,3),                       -- end time

  /** AI scoring (0..1) — higher = better. Brief reason stored too. */
  ai_score NUMERIC(5,4),
  ai_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reason TEXT,

  /** User override flag — flips when user picks a different take */
  user_override_chosen BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (edit_job_id, script_group, take_number)
);

CREATE INDEX IF NOT EXISTS idx_script_attempts_edit_job
  ON public.script_attempts (edit_job_id, script_group, take_number);
CREATE INDEX IF NOT EXISTS idx_script_attempts_user
  ON public.script_attempts (user_id);

CREATE OR REPLACE FUNCTION public.script_attempts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_script_attempts_updated_at ON public.script_attempts;
CREATE TRIGGER trg_script_attempts_updated_at
  BEFORE UPDATE ON public.script_attempts
  FOR EACH ROW EXECUTE FUNCTION public.script_attempts_set_updated_at();

-- RLS: owner read; service role writes
ALTER TABLE public.script_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS script_attempts_self_read ON public.script_attempts;
CREATE POLICY script_attempts_self_read
  ON public.script_attempts
  FOR SELECT USING (auth.uid() = user_id);

-- Org-aware policy (only fires when org_id is populated post-multi-tenancy rollout)
DROP POLICY IF EXISTS script_attempts_org_member_read ON public.script_attempts;
CREATE POLICY script_attempts_org_member_read
  ON public.script_attempts
  FOR SELECT
  USING (org_id IS NOT NULL AND public.is_org_member(org_id));

DROP POLICY IF EXISTS script_attempts_self_update ON public.script_attempts;
CREATE POLICY script_attempts_self_update
  ON public.script_attempts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
