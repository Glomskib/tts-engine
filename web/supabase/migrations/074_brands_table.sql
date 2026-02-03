-- Migration 074: Brands table for agency management
-- This creates a proper brands entity separate from the products table

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  website TEXT,
  description TEXT,

  -- Brand guidelines
  colors JSONB DEFAULT '[]', -- Array of hex colors
  tone_of_voice TEXT,
  target_audience TEXT,
  guidelines TEXT,

  -- For agencies: quotas and tracking
  monthly_video_quota INT DEFAULT 0, -- 0 = unlimited
  videos_this_month INT DEFAULT 0,
  quota_reset_day INT DEFAULT 1, -- Day of month to reset

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brands_user ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(user_id, name);

-- RLS policies
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brands" ON brands
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brands" ON brands
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brands" ON brands
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brands" ON brands
  FOR DELETE USING (auth.uid() = user_id);

-- Link products to brands (add foreign key column)
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brands_updated_at ON brands;
CREATE TRIGGER brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION update_brands_updated_at();

-- Comment
COMMENT ON TABLE brands IS 'Brand entities for organizing products and tracking agency quotas';
