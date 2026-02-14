-- B-roll library: make every clip reusable across products.
-- Adds AI-generated tags for semantic matching, used_count for LRU-style reuse,
-- and cross-product indexes so library lookups are fast.

ALTER TABLE broll_clips
  ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS tags JSONB,
  ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;

-- Update source constraint to allow 'stock' for imported clips
ALTER TABLE broll_clips DROP CONSTRAINT IF EXISTS broll_clips_source_check;
ALTER TABLE broll_clips
  ADD CONSTRAINT broll_clips_source_check
  CHECK (source IN ('runway', 'library', 'upload', 'stock'));

-- Cross-product library lookup: find reusable done clips by tag
CREATE INDEX IF NOT EXISTS idx_broll_library_reusable
  ON broll_clips (status, reusable)
  WHERE status = 'done' AND reusable = true;

-- GIN index on tags for JSONB containment queries (@>)
CREATE INDEX IF NOT EXISTS idx_broll_tags_gin
  ON broll_clips USING gin (tags);

COMMENT ON COLUMN broll_clips.reusable IS 'If true, clip is available for cross-product reuse';
COMMENT ON COLUMN broll_clips.tags IS 'AI-generated: {scene, action, product_type, lighting, mood}';
COMMENT ON COLUMN broll_clips.used_count IS 'Times this clip has been reused in compositions';
