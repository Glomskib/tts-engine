-- FlashFlow Products — TikTok Shop product ID lookup
-- Table: ff_products
-- Maps short keys to TikTok product IDs for phone-first posting.

-- =============================================
-- 1. ff_products — one row per product mapping
-- =============================================
CREATE TABLE IF NOT EXISTS ff_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text NOT NULL UNIQUE,
  display_name      text,
  tiktok_product_id text NOT NULL,
  notes             text,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ff_products_key ON ff_products(key);
CREATE INDEX idx_ff_products_tiktok_product_id ON ff_products(tiktok_product_id);

-- =============================================
-- 2. RLS policies
-- =============================================

ALTER TABLE ff_products ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all products (needed for lookup)
CREATE POLICY "ff_products_select" ON ff_products
  FOR SELECT TO authenticated USING (true);

-- No direct insert/update/delete for authenticated users;
-- all writes go through service role in API routes.

-- =============================================
-- 3. updated_at trigger (reuses ff_set_updated_at from 20260223000001)
-- =============================================
CREATE TRIGGER trg_ff_products_updated
  BEFORE UPDATE ON ff_products
  FOR EACH ROW EXECUTE FUNCTION ff_set_updated_at();
