-- ══════════════════════════════════════════════════════════════════
-- High-Volume Readiness — Missing Indexes
-- Adds indexes on content_items for brand_id, product_id, created_at
-- and limits on experiments queries.
-- ══════════════════════════════════════════════════════════════════

-- content_items: brand_id (used in list/filter queries)
CREATE INDEX IF NOT EXISTS idx_content_items_brand_id
  ON public.content_items(brand_id)
  WHERE brand_id IS NOT NULL;

-- content_items: product_id (used in list/filter queries)
CREATE INDEX IF NOT EXISTS idx_content_items_product_id
  ON public.content_items(product_id)
  WHERE product_id IS NOT NULL;

-- content_items: created_at DESC (used in list ordering)
CREATE INDEX IF NOT EXISTS idx_content_items_created_at
  ON public.content_items(created_at DESC);

-- videos: compound index for recording_status + last_status_changed_at
-- Used by queue-health and pipeline queries
CREATE INDEX IF NOT EXISTS idx_videos_recording_status_changed
  ON public.videos(recording_status, last_status_changed_at DESC)
  WHERE recording_status IS NOT NULL;
