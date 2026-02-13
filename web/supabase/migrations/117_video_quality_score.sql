-- Migration 117: Add quality_score JSONB column to videos table
-- Stores structured quality assessment scores for AI-generated video review

ALTER TABLE videos ADD COLUMN IF NOT EXISTS quality_score JSONB DEFAULT NULL;

COMMENT ON COLUMN videos.quality_score IS 'Quality assessment: {product_visibility, label_legibility, prompt_accuracy, text_overlay, composition, total, notes, scored_by, scored_at}';

CREATE INDEX idx_videos_quality_score_total ON videos ((quality_score->>'total')) WHERE quality_score IS NOT NULL;
