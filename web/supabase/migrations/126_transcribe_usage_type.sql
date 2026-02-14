-- Migration 126: Add usage_type to transcribe_usage
-- Tracks what kind of AI feature was used: transcription, recommendation, rewrite
-- All types share the same daily rate limit pool

ALTER TABLE public.transcribe_usage
  ADD COLUMN IF NOT EXISTS usage_type TEXT DEFAULT 'transcription';

-- Allow null url_transcribed for non-transcription AI uses
ALTER TABLE public.transcribe_usage
  ALTER COLUMN url_transcribed DROP NOT NULL;

COMMENT ON COLUMN public.transcribe_usage.usage_type IS 'Type of AI usage: transcription, recommendation, rewrite';
