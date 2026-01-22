-- 009_video_events_audit.sql
-- Phase 8.2: Audit log table for video pipeline events

-- Create video_events audit table
CREATE TABLE IF NOT EXISTS public.video_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    from_status text NULL,
    to_status text NULL,
    correlation_id text NULL,
    actor text NULL,
    request_id text NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying events by video (newest first)
CREATE INDEX IF NOT EXISTS video_events_video_id_created_at_idx
ON public.video_events (video_id, created_at DESC);

-- Index for correlation ID lookups
CREATE INDEX IF NOT EXISTS video_events_correlation_id_idx
ON public.video_events (correlation_id)
WHERE correlation_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.video_events IS 'Audit log for video pipeline events (Phase 8.2)';
