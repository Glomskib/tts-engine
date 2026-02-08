-- A/B Testing table for comparing content variations
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_a_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  variant_b_id UUID REFERENCES saved_skits(id) ON DELETE SET NULL,
  variant_a_label TEXT NOT NULL DEFAULT 'Variant A',
  variant_b_label TEXT NOT NULL DEFAULT 'Variant B',
  winner TEXT CHECK (winner IN ('a','b')),
  winner_reason TEXT,
  hypothesis TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their ab_tests" ON ab_tests FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ab_tests_user ON ab_tests(user_id);
CREATE INDEX idx_ab_tests_status ON ab_tests(status, created_at DESC);
