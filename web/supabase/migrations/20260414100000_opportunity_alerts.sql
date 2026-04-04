-- Opportunity Alerts: proactive early-warning system for high-value opportunities.

-- ── opportunity_alerts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  trend_cluster_id UUID REFERENCES public.trend_clusters(id) ON DELETE CASCADE,
  product_name TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('ACT_NOW', 'VELOCITY_SPIKE', 'COMMUNITY_MOMENTUM')),
  recommendation TEXT,
  earlyness_score INTEGER NOT NULL DEFAULT 0,
  saturation_score INTEGER NOT NULL DEFAULT 0,
  velocity_score INTEGER NOT NULL DEFAULT 0,
  community_wins INTEGER NOT NULL DEFAULT 0,
  community_views BIGINT NOT NULL DEFAULT 0,
  best_hook TEXT,
  reason_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opp_alerts_workspace_created
  ON public.opportunity_alerts (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opp_alerts_cluster
  ON public.opportunity_alerts (trend_cluster_id);

CREATE INDEX IF NOT EXISTS idx_opp_alerts_unseen
  ON public.opportunity_alerts (workspace_id, seen_at) WHERE seen_at IS NULL;

-- ── alert_subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('ACT_NOW', 'VELOCITY_SPIKE', 'COMMUNITY_MOMENTUM', 'ALL')),
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('in_app', 'email', 'webhook')),
  destination TEXT, -- email address, webhook URL, or null for in_app
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_subs_workspace
  ON public.alert_subscriptions (workspace_id, enabled) WHERE enabled = true;

-- RLS
ALTER TABLE public.opportunity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY opp_alerts_workspace ON public.opportunity_alerts
  FOR ALL USING (workspace_id = auth.uid());

CREATE POLICY alert_subs_workspace ON public.alert_subscriptions
  FOR ALL USING (workspace_id = auth.uid());
