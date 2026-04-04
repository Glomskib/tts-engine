-- Community Intelligence: community_signals + winning_hooks
-- Enables performance feedback from published videos back into the trend engine.

-- ── community_signals ──────────────────────────────────────────────
-- Records when a user posts a video for a trend-tracked product.
-- Lightweight — one row per published content item linked to a cluster.

CREATE TABLE IF NOT EXISTS public.community_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  content_item_post_id UUID REFERENCES public.content_item_posts(id) ON DELETE SET NULL,
  trend_cluster_id UUID REFERENCES public.trend_clusters(id) ON DELETE SET NULL,
  product_name TEXT,
  normalized_product_key TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_signals_cluster
  ON public.community_signals (trend_cluster_id) WHERE trend_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_signals_workspace
  ON public.community_signals (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_signals_product_key
  ON public.community_signals (normalized_product_key) WHERE normalized_product_key IS NOT NULL;

-- ── winning_hooks ──────────────────────────────────────────────────
-- Stores hooks from high-performing content, linked to product clusters.

CREATE TABLE IF NOT EXISTS public.winning_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  trend_cluster_id UUID REFERENCES public.trend_clusters(id) ON DELETE SET NULL,
  product_name TEXT,
  normalized_product_key TEXT,
  hook_text TEXT NOT NULL,
  hook_source TEXT NOT NULL DEFAULT 'extracted' CHECK (hook_source IN ('generated', 'manual', 'extracted')),
  performance_score INTEGER NOT NULL DEFAULT 0 CHECK (performance_score >= 0 AND performance_score <= 100),
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,3) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winning_hooks_cluster
  ON public.winning_hooks (trend_cluster_id) WHERE trend_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_winning_hooks_workspace_perf
  ON public.winning_hooks (workspace_id, performance_score DESC);

CREATE INDEX IF NOT EXISTS idx_winning_hooks_product_key
  ON public.winning_hooks (normalized_product_key) WHERE normalized_product_key IS NOT NULL;

-- ── Extend trend_clusters ──────────────────────────────────────────
-- Add community signal aggregates for fast access.

ALTER TABLE public.trend_clusters
  ADD COLUMN IF NOT EXISTS community_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_total_views BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_best_hook TEXT;

-- RLS (service-role bypass; workspace-scoped for direct access)
ALTER TABLE public.community_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winning_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_signals_workspace ON public.community_signals
  FOR ALL USING (workspace_id = auth.uid());

CREATE POLICY winning_hooks_workspace ON public.winning_hooks
  FOR ALL USING (workspace_id = auth.uid());
