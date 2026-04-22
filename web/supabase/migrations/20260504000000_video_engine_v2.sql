-- FlashFlow Video Engine V2
--
-- Adds: confidence layer, content packaging, intent detection, watermark,
-- per-plan snapshot, completion notifications. Extends the V1 schema in place.
--
-- All changes are additive (new columns / loosened CHECK constraints) so
-- existing V1 rows continue to work.

-- ---------------------------------------------------------------------------
-- ve_runs: intent + notification state + plan snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.ve_runs
  ADD COLUMN IF NOT EXISTS detected_intent       TEXT,
  ADD COLUMN IF NOT EXISTS notify_state          TEXT NOT NULL DEFAULT 'unsent',
  ADD COLUMN IF NOT EXISTS notification_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_id_at_run        TEXT,
  ADD COLUMN IF NOT EXISTS watermark             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_duration_sec   NUMERIC(10,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 've_runs_notify_state_chk'
  ) THEN
    ALTER TABLE public.ve_runs
      ADD CONSTRAINT ve_runs_notify_state_chk
      CHECK (notify_state IN ('unsent','sending','sent','failed','skipped'));
  END IF;
END$$;

-- Index for the notification cron — find runs that completed but haven't notified.
CREATE INDEX IF NOT EXISTS idx_ve_runs_notify_pending
  ON public.ve_runs(status, notify_state)
  WHERE status IN ('complete','failed') AND notify_state = 'unsent';

-- ---------------------------------------------------------------------------
-- ve_clip_candidates: confidence layer + insight tags
-- ---------------------------------------------------------------------------
ALTER TABLE public.ve_clip_candidates
  ADD COLUMN IF NOT EXISTS hook_strength    TEXT,
  ADD COLUMN IF NOT EXISTS suggested_use    TEXT,
  ADD COLUMN IF NOT EXISTS selection_reason TEXT,
  ADD COLUMN IF NOT EXISTS best_for         TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 've_candidates_hook_strength_chk'
  ) THEN
    ALTER TABLE public.ve_clip_candidates
      ADD CONSTRAINT ve_candidates_hook_strength_chk
      CHECK (hook_strength IS NULL OR hook_strength IN ('low','med','high'));
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- ve_rendered_clips: ready-to-paste content packaging + watermark + regen tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.ve_rendered_clips
  ADD COLUMN IF NOT EXISTS caption_text     TEXT,
  ADD COLUMN IF NOT EXISTS hashtags         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_title  TEXT,
  ADD COLUMN IF NOT EXISTS cta_suggestion   TEXT,
  ADD COLUMN IF NOT EXISTS watermark        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS package_status   TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS package_error    TEXT,
  ADD COLUMN IF NOT EXISTS regen_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variant_of_id    UUID REFERENCES public.ve_rendered_clips(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 've_rendered_package_status_chk'
  ) THEN
    ALTER TABLE public.ve_rendered_clips
      ADD CONSTRAINT ve_rendered_package_status_chk
      CHECK (package_status IN ('pending','done','failed','skipped'));
  END IF;
END$$;

-- Index for the packaging worker — find clips that need captions/hashtags.
CREATE INDEX IF NOT EXISTS idx_ve_rendered_package_pending
  ON public.ve_rendered_clips(run_id, package_status)
  WHERE package_status = 'pending';

-- ---------------------------------------------------------------------------
-- notifications: extend type CHECK to include video engine events.
-- The original constraint is unnamed; we drop the old CHECK and recreate it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  con_name TEXT;
BEGIN
  -- Find the existing type CHECK by introspection (unnamed in 017).
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%(type = %';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', con_name);
  END IF;

  -- Re-add with the wider list.
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_chk
    CHECK (type IN (
      'handoff','assigned','status_changed','script_attached','comment',
      'video_engine_complete','video_engine_failed'
    ));
END$$;

COMMENT ON COLUMN public.ve_runs.detected_intent IS
  'Auto-detected intent (affiliate|nonprofit|unknown) from transcript — surfaced to UI when it disagrees with the user-selected mode.';
COMMENT ON COLUMN public.ve_runs.watermark IS
  'Snapshot at run-creation time of whether output should carry the "Made with FlashFlow" overlay. Read from VE_LIMITS_BY_PLAN; never mutated mid-run.';
COMMENT ON COLUMN public.ve_runs.plan_id_at_run IS
  'Snapshot of the user plan when the run was created (e.g. payg, ve_starter, ve_creator, ve_pro). Used to enforce caps consistently even if plan changes mid-run.';
COMMENT ON COLUMN public.ve_clip_candidates.hook_strength IS
  'Derived bucket from final score: high (>=0.75) | med (>=0.5) | low. Drives the confidence badge in UI.';
COMMENT ON COLUMN public.ve_clip_candidates.selection_reason IS
  'One-sentence human-readable explanation of why this candidate was selected — derived from the top features in score_breakdown_json.';
COMMENT ON COLUMN public.ve_rendered_clips.caption_text IS
  'Ready-to-paste social caption generated by the packaging stage. Mode-aware (affiliate vs nonprofit prompt).';
COMMENT ON COLUMN public.ve_rendered_clips.variant_of_id IS
  'When non-null, this rendered_clip is a regeneration variant of another clip in the same run.';
