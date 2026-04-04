-- Add deferred FK from product_performance.top_post_id -> content_item_posts(id)
-- This was deferred from 20260304100000_product_performance.sql because content_item_posts
-- didn't exist yet at that migration timestamp.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_pp_top_post' AND table_name = 'product_performance'
  ) THEN
    ALTER TABLE product_performance
      ADD CONSTRAINT fk_pp_top_post FOREIGN KEY (top_post_id) REFERENCES content_item_posts(id) ON DELETE SET NULL;
  END IF;
END $$;
