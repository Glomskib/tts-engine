-- ============================================================
-- FinOps: tool_usage_events table + estimated flag
-- Migration: 20260302000002_finops_tool_events_and_estimated
-- ============================================================

-- A) Add estimated flag to ff_usage_events
ALTER TABLE public.ff_usage_events
  ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;

-- B) Create tool_usage_events for non-LLM tool spend (HeyGen, ElevenLabs, etc.)
CREATE TABLE IF NOT EXISTS public.tool_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tool_name text NOT NULL,             -- heygen | elevenlabs | runway | replicate
  lane text NOT NULL,
  agent_id text,
  user_id uuid,
  run_id text,
  duration_ms integer,
  success boolean DEFAULT true,
  error_code text,
  cost_usd numeric(12,6) DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tool_usage_events_created_at
  ON public.tool_usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_tool_usage_events_tool_created_at
  ON public.tool_usage_events (tool_name, created_at);

ALTER TABLE public.tool_usage_events ENABLE ROW LEVEL SECURITY;

-- Service-role-only (same pattern as ff_usage_events)
DROP POLICY IF EXISTS "tool_usage_events_service_write" ON public.tool_usage_events;
CREATE POLICY "tool_usage_events_service_write" ON public.tool_usage_events
  FOR ALL USING (public.is_service_role());
