-- ============================================================
-- FinOps Extension: add correlation_id + endpoint to ff_usage_events
-- Migration: 20260221000001_finops_extend
-- ============================================================

-- Add correlation_id for cross-system tracing (links to ff_generations.correlation_id)
ALTER TABLE public.ff_usage_events
  ADD COLUMN IF NOT EXISTS correlation_id text;

-- Add endpoint so we know which API route generated the cost
ALTER TABLE public.ff_usage_events
  ADD COLUMN IF NOT EXISTS endpoint text;

-- Index on correlation_id for join lookups
CREATE INDEX IF NOT EXISTS idx_ff_usage_events_correlation_id
  ON public.ff_usage_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index on endpoint for per-endpoint cost queries
CREATE INDEX IF NOT EXISTS idx_ff_usage_events_endpoint
  ON public.ff_usage_events (endpoint)
  WHERE endpoint IS NOT NULL;
