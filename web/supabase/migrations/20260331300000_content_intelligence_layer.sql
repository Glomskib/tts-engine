-- Content Intelligence Layer
-- Tables: content_item_posts, content_item_metrics_snapshots, content_item_ai_insights
-- Foundation for post attribution → metrics → AI insights → winners feedback loop.

-- ══════════════════════════════════════════════════════════════════
-- 1. content_item_posts
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_item_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,              -- tiktok|instagram|youtube|facebook|other
  post_url TEXT NOT NULL,
  platform_post_id TEXT,               -- future: extracted via platform API
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  caption_used TEXT,
  hashtags_used TEXT,
  posted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'posted',          -- posted|deleted|unknown
  metrics_source TEXT NOT NULL DEFAULT 'manual',  -- manual|posting_provider|platform_api
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cip_workspace_content_item
  ON content_item_posts(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS idx_cip_workspace_platform
  ON content_item_posts(workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_cip_workspace_posted_at
  ON content_item_posts(workspace_id, posted_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_content_item_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_item_posts_updated_at ON content_item_posts;
CREATE TRIGGER trg_content_item_posts_updated_at
  BEFORE UPDATE ON content_item_posts
  FOR EACH ROW EXECUTE FUNCTION update_content_item_posts_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 2. content_item_metrics_snapshots
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_item_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content_item_post_id UUID NOT NULL REFERENCES public.content_item_posts(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views INT,
  likes INT,
  comments INT,
  shares INT,
  saves INT,
  avg_watch_time_seconds INT,
  completion_rate NUMERIC,
  raw_json JSONB,
  source TEXT NOT NULL DEFAULT 'manual'  -- manual|posting_provider|platform_api
);

CREATE INDEX IF NOT EXISTS idx_cims_workspace_post_captured
  ON content_item_metrics_snapshots(workspace_id, content_item_post_id, captured_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 3. content_item_ai_insights
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_item_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  content_item_post_id UUID REFERENCES public.content_item_posts(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  insight_type TEXT NOT NULL,            -- postmortem|hook|next|winner_candidate
  json JSONB,
  markdown TEXT
);

CREATE INDEX IF NOT EXISTS idx_ciai_workspace_item_generated
  ON content_item_ai_insights(workspace_id, content_item_id, generated_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 4. RLS — content_item_posts
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE content_item_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cip_select ON content_item_posts FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY cip_insert ON content_item_posts FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY cip_update ON content_item_posts FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY cip_delete ON content_item_posts FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY cip_service ON content_item_posts FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 5. RLS — content_item_metrics_snapshots
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE content_item_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cims_select ON content_item_metrics_snapshots FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY cims_insert ON content_item_metrics_snapshots FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY cims_update ON content_item_metrics_snapshots FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY cims_delete ON content_item_metrics_snapshots FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY cims_service ON content_item_metrics_snapshots FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 6. RLS — content_item_ai_insights
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE content_item_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY ciai_select ON content_item_ai_insights FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY ciai_insert ON content_item_ai_insights FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY ciai_update ON content_item_ai_insights FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY ciai_delete ON content_item_ai_insights FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY ciai_service ON content_item_ai_insights FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
