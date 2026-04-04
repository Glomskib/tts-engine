-- ══════════════════════════════════════════════════════════════════
-- Brand Creative Testing Engine
-- Adds: brand_members, experiments, experiment_creatives
-- Links: content_items.experiment_id
-- ══════════════════════════════════════════════════════════════════

-- 1. brand_members — operator/client roles per brand
CREATE TABLE IF NOT EXISTS public.brand_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('operator', 'client')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_members_user ON brand_members(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_members_brand ON brand_members(brand_id);

ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
  ON brand_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Operators can view all members of their brands"
  ON brand_members FOR SELECT
  USING (
    brand_id IN (
      SELECT bm.brand_id FROM brand_members bm
      WHERE bm.user_id = auth.uid() AND bm.role = 'operator'
    )
  );

CREATE POLICY "Operators can manage members"
  ON brand_members FOR ALL
  USING (
    brand_id IN (
      SELECT bm.brand_id FROM brand_members bm
      WHERE bm.user_id = auth.uid() AND bm.role = 'operator'
    )
  );

CREATE POLICY "Service role full access on brand_members"
  ON brand_members FOR ALL
  USING (auth.role() = 'service_role');


-- 2. experiments — first-class experiment entity
CREATE TABLE IF NOT EXISTS public.experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  goal TEXT,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  hook_count INT NOT NULL DEFAULT 0,
  winner_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace ON experiments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_experiments_brand ON experiments(brand_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(workspace_id, status);

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own experiments"
  ON experiments FOR ALL
  USING (auth.uid() = workspace_id);

CREATE POLICY "Brand clients can view experiments for their brands"
  ON experiments FOR SELECT
  USING (
    brand_id IN (
      SELECT bm.brand_id FROM brand_members bm
      WHERE bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on experiments"
  ON experiments FOR ALL
  USING (auth.role() = 'service_role');

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_experiments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_experiments_updated_at
  BEFORE UPDATE ON experiments
  FOR EACH ROW EXECUTE FUNCTION update_experiments_updated_at();


-- 3. experiment_creatives — link content_items to experiments with metadata
CREATE TABLE IF NOT EXISTS public.experiment_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  hook TEXT,
  angle TEXT,
  persona TEXT,
  cta TEXT,
  is_winner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_experiment_creatives_experiment ON experiment_creatives(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_creatives_content_item ON experiment_creatives(content_item_id);

ALTER TABLE experiment_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via experiment ownership"
  ON experiment_creatives FOR ALL
  USING (
    experiment_id IN (
      SELECT e.id FROM experiments e WHERE e.workspace_id = auth.uid()
    )
  );

CREATE POLICY "Brand clients can view experiment creatives"
  ON experiment_creatives FOR SELECT
  USING (
    experiment_id IN (
      SELECT e.id FROM experiments e
      WHERE e.brand_id IN (
        SELECT bm.brand_id FROM brand_members bm WHERE bm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role full access on experiment_creatives"
  ON experiment_creatives FOR ALL
  USING (auth.role() = 'service_role');


-- 4. Add experiment_id to content_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_items' AND column_name = 'experiment_id'
  ) THEN
    ALTER TABLE public.content_items
      ADD COLUMN experiment_id UUID REFERENCES public.experiments(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_content_items_experiment ON content_items(experiment_id);
  END IF;
END $$;
