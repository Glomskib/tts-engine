-- 038_audit_log.sql
-- System-wide audit log for critical mutations with correlation IDs

-- Create audit_log table for tracking system-wide mutations
CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id text NOT NULL,
    event_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NULL,
    actor text NULL,
    summary text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for correlation ID lookups (primary access pattern)
CREATE INDEX IF NOT EXISTS audit_log_correlation_id_idx
ON public.audit_log (correlation_id);

-- Index for event type queries
CREATE INDEX IF NOT EXISTS audit_log_event_type_created_at_idx
ON public.audit_log (event_type, created_at DESC);

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
ON public.audit_log (entity_type, entity_id, created_at DESC)
WHERE entity_id IS NOT NULL;

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
ON public.audit_log (created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE public.audit_log IS 'System-wide audit log for critical mutations with correlation IDs';
COMMENT ON COLUMN public.audit_log.correlation_id IS 'Unique identifier to trace related operations across requests';
COMMENT ON COLUMN public.audit_log.event_type IS 'Type of event: video.posted, hook.approved, hook.rejected, hook.winner, hook.underperform, product.updated, video.claimed, video.released';
COMMENT ON COLUMN public.audit_log.entity_type IS 'Type of entity: video, hook, product';
COMMENT ON COLUMN public.audit_log.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.audit_log.actor IS 'User or system that performed the action';
COMMENT ON COLUMN public.audit_log.summary IS 'Human-readable summary of the action (sanitized, no PII)';
