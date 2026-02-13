-- Winner patterns: captures what worked from the render pipeline
-- When Brandon marks a video as a winner, the full context is saved here
-- so generate-skit can learn from proven render+script combinations.

DROP TABLE IF EXISTS winner_patterns;

CREATE TABLE winner_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  persona_name TEXT,
  hook_text TEXT,
  full_script TEXT,
  render_prompt TEXT,
  quality_score JSONB,
  render_provider TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_winner_patterns_product ON winner_patterns(product_id);
CREATE INDEX idx_winner_patterns_persona ON winner_patterns(persona_name) WHERE persona_name IS NOT NULL;
