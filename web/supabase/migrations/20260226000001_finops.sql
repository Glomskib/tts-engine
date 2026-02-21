-- ============================================================
-- FinOps: Usage tracking, rollups, and budgets
-- Migration: 20260226000001_finops
-- Tables: ff_usage_events, ff_usage_rollups_daily, ff_budgets
-- ============================================================

-- ============================================================
-- 1. ff_usage_events — per-call token usage + cost
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,               -- flashflow | openclaw | manual
  lane text NOT NULL,                  -- FlashFlow | MMM | Zebby's World | Personal Ops | POD TTS
  agent_id text,                       -- flash | main | bmad-dev etc
  user_id uuid,
  provider text NOT NULL,              -- openai | anthropic | ollama | other
  model text NOT NULL,
  request_id text,                     -- for dedupe
  template_key text,
  prompt_version_id uuid,
  generation_id uuid REFERENCES public.ff_generations(id) ON DELETE SET NULL,
  task_id uuid,                        -- MC task id (optional)
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ff_usage_events_created_at
  ON public.ff_usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ff_usage_events_lane_created_at
  ON public.ff_usage_events (lane, created_at);
CREATE INDEX IF NOT EXISTS idx_ff_usage_events_provider_model_created_at
  ON public.ff_usage_events (provider, model, created_at);
CREATE INDEX IF NOT EXISTS idx_ff_usage_events_generation_id
  ON public.ff_usage_events (generation_id);

ALTER TABLE public.ff_usage_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own rows
DROP POLICY IF EXISTS "ff_usage_events_read_own" ON public.ff_usage_events;
CREATE POLICY "ff_usage_events_read_own" ON public.ff_usage_events
  FOR SELECT USING (
    public.is_service_role()
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

-- Insert/update only via service role
DROP POLICY IF EXISTS "ff_usage_events_service_write" ON public.ff_usage_events;
CREATE POLICY "ff_usage_events_service_write" ON public.ff_usage_events
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 2. ff_usage_rollups_daily — aggregated daily cost data
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_usage_rollups_daily (
  day date NOT NULL,
  lane text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  agent_id text NOT NULL DEFAULT '',
  template_key text NOT NULL DEFAULT '',
  calls integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, lane, provider, model, agent_id, template_key)
);

ALTER TABLE public.ff_usage_rollups_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_usage_rollups_daily_service_only" ON public.ff_usage_rollups_daily;
CREATE POLICY "ff_usage_rollups_daily_service_only" ON public.ff_usage_rollups_daily
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- 3. ff_budgets — spend thresholds + alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ff_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,                 -- global | lane | agent | template
  scope_key text,                      -- lane name, agent id, template_key
  period text NOT NULL,                -- daily | weekly | monthly
  limit_usd numeric(12,2) NOT NULL,
  soft_alert_usd numeric(12,2),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ff_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_budgets_service_only" ON public.ff_budgets;
CREATE POLICY "ff_budgets_service_only" ON public.ff_budgets
  FOR ALL USING (public.is_service_role());

-- ============================================================
-- Rollup refresh function for ff tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_ff_usage_daily_rollups(target_day date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.ff_usage_rollups_daily WHERE day = target_day;

  INSERT INTO public.ff_usage_rollups_daily
    (day, lane, provider, model, agent_id, template_key, calls, input_tokens, output_tokens, cost_usd)
  SELECT
    target_day,
    lane,
    provider,
    model,
    COALESCE(agent_id, ''),
    COALESCE(template_key, ''),
    COUNT(*)::integer,
    COALESCE(SUM(input_tokens), 0)::integer,
    COALESCE(SUM(output_tokens), 0)::integer,
    COALESCE(SUM(cost_usd), 0)
  FROM public.ff_usage_events
  WHERE created_at >= target_day::timestamptz
    AND created_at < (target_day + interval '1 day')::timestamptz
  GROUP BY lane, provider, model, COALESCE(agent_id, ''), COALESCE(template_key, '');
$$;
