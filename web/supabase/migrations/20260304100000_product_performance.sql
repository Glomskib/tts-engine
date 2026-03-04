-- Product Performance: aggregated per-product metrics updated during metrics sync
CREATE TABLE IF NOT EXISTS product_performance (
  workspace_id UUID NOT NULL,
  product_id UUID NOT NULL,
  total_posts INT NOT NULL DEFAULT 0,
  avg_views NUMERIC NOT NULL DEFAULT 0,
  avg_engagement NUMERIC NOT NULL DEFAULT 0,
  top_post_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, product_id)
);

-- Foreign keys
ALTER TABLE product_performance
  ADD CONSTRAINT fk_pp_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE product_performance
  ADD CONSTRAINT fk_pp_top_post FOREIGN KEY (top_post_id) REFERENCES content_item_posts(id) ON DELETE SET NULL;

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_pp_workspace_engagement
  ON product_performance (workspace_id, avg_engagement DESC);

-- RLS
ALTER TABLE product_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own product_performance"
  ON product_performance FOR SELECT
  USING (auth.uid() = workspace_id);

CREATE POLICY "Service role full access on product_performance"
  ON product_performance FOR ALL
  USING (auth.role() = 'service_role');
