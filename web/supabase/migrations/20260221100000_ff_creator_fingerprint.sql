-- Creator-style fingerprinting tables for CLI-based pipeline.
-- Separate from the web-UI style_creators / style_creator_videos system.

-- ── ff_creator_sources: URL catalog with ingestion status ──
CREATE TABLE IF NOT EXISTS ff_creator_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_key TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_key, url)
);

CREATE INDEX IF NOT EXISTS idx_ff_creator_sources_creator_status
  ON ff_creator_sources (creator_key, status);

ALTER TABLE ff_creator_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read creator sources"
  ON ff_creator_sources FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── ff_creator_samples: per-video analysis results ──
CREATE TABLE IF NOT EXISTS ff_creator_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_key TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube')),
  url TEXT NOT NULL,
  transcript TEXT,
  ocr_text TEXT,
  visual_notes TEXT,
  hooks JSONB,
  screenshots JSONB,
  duration_seconds REAL,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_key, url)
);

CREATE INDEX IF NOT EXISTS idx_ff_creator_samples_creator
  ON ff_creator_samples (creator_key);

ALTER TABLE ff_creator_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read creator samples"
  ON ff_creator_samples FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── ff_creator_fingerprint: aggregated fingerprint per creator ──
CREATE TABLE IF NOT EXISTS ff_creator_fingerprint (
  creator_key TEXT PRIMARY KEY,
  summary TEXT,
  hook_patterns JSONB,
  structure_rules JSONB,
  banned_phrases JSONB DEFAULT '[]'::jsonb,
  do_list JSONB DEFAULT '[]'::jsonb,
  dont_list JSONB DEFAULT '[]'::jsonb,
  samples_count INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ff_creator_fingerprint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read creator fingerprints"
  ON ff_creator_fingerprint FOR SELECT
  USING (auth.role() = 'authenticated');
