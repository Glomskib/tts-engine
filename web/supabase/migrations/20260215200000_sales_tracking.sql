-- Sales tracking for TikTok Shop order data
-- Only create if not exists (may overlap with earlier migration)

CREATE TABLE IF NOT EXISTS public.shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TikTok order data
  tiktok_order_id TEXT NOT NULL,
  order_status TEXT,
  product_name TEXT,
  product_id TEXT,
  sku_name TEXT,
  quantity INTEGER DEFAULT 1,
  order_amount NUMERIC(12,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,
  commission_rate NUMERIC(5,2),
  buyer_message TEXT,

  -- Attribution (which video/brand/product drove this order)
  attributed_video_id UUID,
  attributed_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  attributed_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  attribution_method TEXT DEFAULT 'product_match' CHECK (attribution_method IN ('product_match', 'manual', 'api_attribution', 'time_window')),
  attribution_confidence NUMERIC(3,2) DEFAULT 0.5,

  -- Dates
  order_created_at TIMESTAMPTZ,
  order_paid_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, tiktok_order_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_brand ON shop_orders(attributed_brand_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_date ON shop_orders(user_id, order_created_at DESC);

ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own orders" ON shop_orders FOR ALL USING (auth.uid() = user_id);
