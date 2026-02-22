-- Migration: Add product_id, visual_tags, mc_doc_id, creator_style_id to ff_trending_items

ALTER TABLE ff_trending_items
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS visual_tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS mc_doc_id TEXT,
  ADD COLUMN IF NOT EXISTS creator_style_id UUID REFERENCES style_creators(id) ON DELETE SET NULL;

-- Index for creator fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_ff_trending_items_creator_style
  ON ff_trending_items(creator_style_id)
  WHERE creator_style_id IS NOT NULL;
