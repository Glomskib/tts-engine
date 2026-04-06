-- ============================================================================
-- LaunchSync: Amazon → TikTok product launch + affiliate + content tracking
-- ============================================================================

-- ─── Product Launches ────────────────────────────────────────────────────────
-- A "launch" is a campaign to take a product and push it on TikTok
-- via solo creator mode or agency/brand mode with affiliates.

CREATE TABLE IF NOT EXISTS product_launches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES auth.users(id),
  product_id    uuid REFERENCES products(id),
  brand_id      uuid REFERENCES brands(id),

  -- Product info (can override product table or be standalone)
  title         text NOT NULL,
  asin          text,                          -- Amazon ASIN
  source_url    text,                          -- Amazon/other product URL
  tiktok_url    text,                          -- TikTok shop listing
  image_url     text,
  cost_per_unit numeric(10,2),
  selling_price numeric(10,2),

  -- Launch config
  mode          text NOT NULL DEFAULT 'solo'
                CHECK (mode IN ('solo', 'agency')),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN (
                  'draft',           -- setting up
                  'generating',      -- AI generating hooks/scripts
                  'ready',           -- content ready, not yet live
                  'active',          -- actively posting/distributing
                  'scaling',         -- winner found, scaling up
                  'paused',          -- temporarily halted
                  'completed'        -- campaign finished
                )),

  -- Targets
  target_videos     int DEFAULT 10,
  target_affiliates int DEFAULT 0,

  -- AI-generated content seeds
  hooks         jsonb DEFAULT '[]',           -- [{text, angle, style}]
  scripts       jsonb DEFAULT '[]',           -- [{title, hook, body, cta, tone}]
  angles        jsonb DEFAULT '[]',           -- [{angle, description}]
  creator_brief text,

  -- Performance (rolled up)
  total_videos_created  int DEFAULT 0,
  total_videos_posted   int DEFAULT 0,
  total_views           bigint DEFAULT 0,
  total_orders          int DEFAULT 0,
  total_revenue         numeric(12,2) DEFAULT 0,
  best_video_views      bigint DEFAULT 0,

  -- Metadata
  notes         text,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launches_workspace ON product_launches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_launches_product   ON product_launches(product_id);
CREATE INDEX IF NOT EXISTS idx_launches_status    ON product_launches(status);

ALTER TABLE product_launches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own launches"
  ON product_launches FOR ALL
  USING (auth.uid() = workspace_id)
  WITH CHECK (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on launches"
  ON product_launches FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Launch Affiliates ───────────────────────────────────────────────────────
-- People invited to create content for a specific launch.

CREATE TABLE IF NOT EXISTS launch_affiliates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id     uuid NOT NULL REFERENCES product_launches(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES auth.users(id),

  -- Affiliate info
  name          text NOT NULL,
  email         text,
  tiktok_handle text,
  platform      text DEFAULT 'tiktok'
                CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'other')),

  -- Invite
  invite_code   text UNIQUE,
  invite_status text DEFAULT 'pending'
                CHECK (invite_status IN ('pending', 'accepted', 'declined', 'removed')),
  invited_at    timestamptz DEFAULT now(),
  accepted_at   timestamptz,

  -- Tracking
  user_id       uuid REFERENCES auth.users(id),  -- if they have a FlashFlow account
  commission_pct numeric(5,2) DEFAULT 0,

  -- Performance (rolled up)
  videos_created  int DEFAULT 0,
  videos_posted   int DEFAULT 0,
  total_views     bigint DEFAULT 0,
  total_orders    int DEFAULT 0,
  total_revenue   numeric(12,2) DEFAULT 0,

  -- Metadata
  notes         text,
  status        text DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'top_performer', 'dropped')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_aff_launch ON launch_affiliates(launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_aff_workspace ON launch_affiliates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_launch_aff_invite ON launch_affiliates(invite_code);

ALTER TABLE launch_affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own launch affiliates"
  ON launch_affiliates FOR ALL
  USING (auth.uid() = workspace_id)
  WITH CHECK (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on launch affiliates"
  ON launch_affiliates FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Launch Content ──────────────────────────────────────────────────────────
-- Tracks every piece of content created for a launch, by whom, and its status.

CREATE TABLE IF NOT EXISTS launch_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id       uuid NOT NULL REFERENCES product_launches(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES auth.users(id),

  -- Who
  affiliate_id    uuid REFERENCES launch_affiliates(id),
  creator_name    text,                           -- display name fallback

  -- What
  content_item_id uuid REFERENCES content_items(id),
  title           text,
  hook_text       text,
  script_text     text,
  video_url       text,
  thumbnail_url   text,

  -- Status
  status          text DEFAULT 'idea'
                  CHECK (status IN (
                    'idea',
                    'script_ready',
                    'assigned',
                    'recording',
                    'recorded',
                    'editing',
                    'ready_to_post',
                    'posted',
                    'performing',
                    'winner',
                    'failed'
                  )),

  -- Performance
  platform        text DEFAULT 'tiktok',
  platform_video_id text,
  posted_at       timestamptz,
  views           bigint DEFAULT 0,
  likes           int DEFAULT 0,
  comments        int DEFAULT 0,
  shares          int DEFAULT 0,
  orders          int DEFAULT 0,
  revenue         numeric(12,2) DEFAULT 0,
  is_winner       boolean DEFAULT false,

  -- Metadata
  notes           text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_content_launch ON launch_content(launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_content_aff    ON launch_content(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_launch_content_status ON launch_content(status);
CREATE INDEX IF NOT EXISTS idx_launch_content_ws     ON launch_content(workspace_id);

ALTER TABLE launch_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own launch content"
  ON launch_content FOR ALL
  USING (auth.uid() = workspace_id)
  WITH CHECK (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on launch content"
  ON launch_content FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Auto-update triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_launch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_launches_updated_at
    BEFORE UPDATE ON product_launches
    FOR EACH ROW EXECUTE FUNCTION update_launch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_launch_aff_updated_at
    BEFORE UPDATE ON launch_affiliates
    FOR EACH ROW EXECUTE FUNCTION update_launch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_launch_content_updated_at
    BEFORE UPDATE ON launch_content
    FOR EACH ROW EXECUTE FUNCTION update_launch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Add ASIN column to products if missing ──────────────────────────────────

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS asin text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin) WHERE asin IS NOT NULL;
