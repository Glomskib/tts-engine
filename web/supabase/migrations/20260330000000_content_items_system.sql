-- Content Items System
-- Canonical "row" entity for the content lifecycle platform.
-- Tables: content_items, creator_briefs, content_item_assets

-- ══════════════════════════════════════════════════════════════════
-- 1. content_items
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                                       -- user_id (maps to auth.users)
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,    -- bridge to legacy pipeline
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'briefing',                           -- briefing|ready_to_record|recorded|editing|ready_to_post|posted
  due_at TIMESTAMPTZ,
  assigned_creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_editor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  brief_selected_cow_tier TEXT NOT NULL DEFAULT 'edgy',              -- safe|edgy|unhinged
  short_id TEXT NOT NULL,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  brief_doc_id TEXT,
  brief_doc_url TEXT,
  final_video_url TEXT,
  ai_description TEXT,
  hashtags TEXT[],
  caption TEXT,
  editor_notes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- 2. creator_briefs
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.creator_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  data JSONB NOT NULL,
  claim_risk_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- 3. content_item_assets
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.content_item_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,       -- raw_footage|transcript|final_video|broll|editor_notes
  source TEXT NOT NULL,     -- google_drive|upload|generated
  file_id TEXT,
  file_name TEXT,
  file_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- 4. Indexes
-- ══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_status
  ON content_items(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_due
  ON content_items(workspace_id, due_at);

CREATE INDEX IF NOT EXISTS idx_content_items_short_id
  ON content_items(short_id);

CREATE INDEX IF NOT EXISTS idx_content_items_drive_folder
  ON content_items(drive_folder_id) WHERE drive_folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_video
  ON content_items(video_id) WHERE video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_briefs_item
  ON creator_briefs(content_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_item_assets_item
  ON content_item_assets(content_item_id, kind, created_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 5. short_id trigger
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_content_item_short_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.short_id := 'FF-' || left(replace(NEW.id::text, '-', ''), 6);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_item_short_id ON content_items;
CREATE TRIGGER trg_content_item_short_id
  BEFORE INSERT ON content_items
  FOR EACH ROW EXECUTE FUNCTION set_content_item_short_id();

-- ══════════════════════════════════════════════════════════════════
-- 6. updated_at trigger
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_content_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_items_updated_at ON content_items;
CREATE TRIGGER trg_content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_content_items_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 7. RLS — content_items
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ci_select ON content_items FOR SELECT USING (
  auth.uid() = workspace_id
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY ci_insert ON content_items FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY ci_update ON content_items FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY ci_delete ON content_items FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY ci_service ON content_items FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 8. RLS — creator_briefs
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE creator_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cb_select ON creator_briefs FOR SELECT USING (
  EXISTS (SELECT 1 FROM content_items WHERE id = content_item_id AND workspace_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY cb_insert ON creator_briefs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM content_items WHERE id = content_item_id AND workspace_id = auth.uid())
);
CREATE POLICY cb_service ON creator_briefs FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- 9. RLS — content_item_assets
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE content_item_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY cia_select ON content_item_assets FOR SELECT USING (
  EXISTS (SELECT 1 FROM content_items WHERE id = content_item_id AND workspace_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY cia_insert ON content_item_assets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM content_items WHERE id = content_item_id AND workspace_id = auth.uid())
);
CREATE POLICY cia_service ON content_item_assets FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
