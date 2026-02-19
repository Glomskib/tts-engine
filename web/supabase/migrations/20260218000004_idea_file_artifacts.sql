-- ============================================================
-- Idea File Artifacts: Add file upload columns to idea_artifacts
-- Migration: 20260218_idea_file_artifacts
-- ============================================================

-- Add nullable file-specific columns to idea_artifacts.
-- Existing text artifacts (research, plan, etc.) will have these as NULL.
-- File artifacts will have artifact_type = 'file' and these columns populated.

ALTER TABLE public.idea_artifacts
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS summary text;

-- Index for nightly job to find unprocessed file artifacts quickly
CREATE INDEX IF NOT EXISTS idx_idea_artifacts_pending_extraction
  ON public.idea_artifacts (artifact_type)
  WHERE artifact_type = 'file' AND extracted_text IS NULL;
