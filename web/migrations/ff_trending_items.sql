-- Migration: Create ff_trending_items table for Daily Virals trending data
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ff_trending_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'daily_virals',
  run_date DATE NOT NULL,
  rank INT NOT NULL,
  product_name TEXT NOT NULL,
  tiktok_product_id TEXT,
  category TEXT,
  gmv_velocity TEXT,
  views TEXT,
  hook_text TEXT,
  on_screen_hook TEXT,
  script_snippet TEXT,
  visual_notes TEXT,
  source_url TEXT NOT NULL DEFAULT '',
  screenshot_urls JSONB,
  raw JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one entry per source + date + rank (enables upserts)
ALTER TABLE ff_trending_items
  ADD CONSTRAINT ff_trending_items_source_date_rank_key
  UNIQUE (source, run_date, rank);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ff_trending_items_run_date ON ff_trending_items(run_date);
CREATE INDEX IF NOT EXISTS idx_ff_trending_items_source ON ff_trending_items(source);
CREATE INDEX IF NOT EXISTS idx_ff_trending_items_source_date ON ff_trending_items(source, run_date);

-- Enable Row Level Security (read-only for anon, full access for service role)
ALTER TABLE ff_trending_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read trending items"
  ON ff_trending_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role has full access (handled automatically by Supabase)
