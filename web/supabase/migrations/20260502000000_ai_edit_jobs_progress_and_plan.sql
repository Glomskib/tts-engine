-- AI Video Editor — progress + LLM edit plan columns.
--
-- Three things that turn this from "kinda works" into a real product:
--   1. progress_pct (0-100) + phase_message: drive a real-time progress bar
--      in the detail UI instead of just status-string flips.
--   2. edit_plan (jsonb): the LLM-generated structured plan returned by
--      the new Claude Sonnet 4 planner. Persisted so the render step is
--      deterministic and the UI can show what the AI decided + why.
--   3. 'planning' status: a new pipeline phase between 'transcribing' and
--      'building_timeline' for the LLM call.
--
-- All ADDITIVE (no drops). Safe to run repeatedly.

ALTER TABLE ai_edit_jobs
  ADD COLUMN IF NOT EXISTS progress_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase_message text,
  ADD COLUMN IF NOT EXISTS edit_plan jsonb;

-- progress_pct must be 0..100
ALTER TABLE ai_edit_jobs DROP CONSTRAINT IF EXISTS ai_edit_jobs_progress_pct_check;
ALTER TABLE ai_edit_jobs ADD CONSTRAINT ai_edit_jobs_progress_pct_check
  CHECK (progress_pct >= 0 AND progress_pct <= 100);

-- Add 'planning' to the allowed status set.
ALTER TABLE ai_edit_jobs DROP CONSTRAINT IF EXISTS ai_edit_jobs_status_check;
ALTER TABLE ai_edit_jobs ADD CONSTRAINT ai_edit_jobs_status_check
  CHECK (status IN (
    'draft',
    'uploading',
    'queued',
    'transcribing',
    'planning',
    'building_timeline',
    'rendering',
    'completed',
    'failed'
  ));
