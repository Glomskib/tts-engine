-- Winner Patterns Engine
-- Normalized winning content patterns detected from performance metrics.
-- Feeds back into Content Studio and brief generation.

-- ══════════════════════════════════════════════════════════════════
-- 1. winner_patterns_v2 — normalized, granular winner patterns
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.winner_patterns_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',          -- tiktok|instagram|youtube
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  hook_text TEXT,                                    -- extracted hook text
  hook_pattern_id UUID REFERENCES public.hook_patterns(id) ON DELETE SET NULL,
  format_tag TEXT,                                   -- ugc|voiceover|slideshow|skit|tutorial|review|etc.
  length_bucket TEXT,                                -- micro(<15s)|short(15-30s)|medium(30-60s)|long(60s+)
  cta_tag TEXT,                                      -- link_in_bio|comment|shop|none
  score NUMERIC(6, 2) NOT NULL DEFAULT 0,           -- composite performance score
  sample_size INT NOT NULL DEFAULT 0,
  avg_views NUMERIC DEFAULT 0,
  avg_engagement_rate NUMERIC(6, 2) DEFAULT 0,
  last_win_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite unique key for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_wpv2_upsert_key
  ON winner_patterns_v2(
    workspace_id,
    platform,
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(hook_text, ''),
    COALESCE(format_tag, ''),
    COALESCE(length_bucket, '')
  );

CREATE INDEX IF NOT EXISTS idx_wpv2_workspace_score
  ON winner_patterns_v2(workspace_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_wpv2_workspace_platform
  ON winner_patterns_v2(workspace_id, platform);

CREATE INDEX IF NOT EXISTS idx_wpv2_workspace_product
  ON winner_patterns_v2(workspace_id, product_id)
  WHERE product_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_wpv2_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wpv2_updated_at ON winner_patterns_v2;
CREATE TRIGGER trg_wpv2_updated_at
  BEFORE UPDATE ON winner_patterns_v2
  FOR EACH ROW EXECUTE FUNCTION update_wpv2_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 2. winner_pattern_evidence — links patterns to content items/posts
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.winner_pattern_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_pattern_id UUID NOT NULL REFERENCES public.winner_patterns_v2(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.content_item_posts(id) ON DELETE SET NULL,
  metric_snapshot_id UUID REFERENCES public.content_item_metrics_snapshots(id) ON DELETE SET NULL,
  contribution_score NUMERIC(6, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wpe_pattern
  ON winner_pattern_evidence(winner_pattern_id);

CREATE INDEX IF NOT EXISTS idx_wpe_content_item
  ON winner_pattern_evidence(content_item_id)
  WHERE content_item_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
-- 3. RLS — winner_patterns_v2
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE winner_patterns_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY wpv2_select ON winner_patterns_v2 FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY wpv2_insert ON winner_patterns_v2 FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY wpv2_update ON winner_patterns_v2 FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY wpv2_delete ON winner_patterns_v2 FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY wpv2_service ON winner_patterns_v2 FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 4. RLS — winner_pattern_evidence
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE winner_pattern_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY wpe_select ON winner_pattern_evidence FOR SELECT USING (
  EXISTS (SELECT 1 FROM winner_patterns_v2 wp WHERE wp.id = winner_pattern_id AND wp.workspace_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY wpe_insert ON winner_pattern_evidence FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM winner_patterns_v2 wp WHERE wp.id = winner_pattern_id AND wp.workspace_id = auth.uid())
);
CREATE POLICY wpe_update ON winner_pattern_evidence FOR UPDATE USING (
  EXISTS (SELECT 1 FROM winner_patterns_v2 wp WHERE wp.id = winner_pattern_id AND wp.workspace_id = auth.uid())
);
CREATE POLICY wpe_delete ON winner_pattern_evidence FOR DELETE USING (
  EXISTS (SELECT 1 FROM winner_patterns_v2 wp WHERE wp.id = winner_pattern_id AND wp.workspace_id = auth.uid())
);
CREATE POLICY wpe_service ON winner_pattern_evidence FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
