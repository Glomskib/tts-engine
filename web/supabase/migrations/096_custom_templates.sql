-- Custom user templates
CREATE TABLE IF NOT EXISTS custom_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  hook_template TEXT, -- supports {{product_name}}, {{audience}}, {{benefit}} variables
  body_template TEXT,
  cta_template TEXT,
  variables TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'product_name', 'audience', 'benefit'}
  structure JSONB NOT NULL DEFAULT '{}', -- beat_count, tone, duration, etc
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_templates_user_id ON custom_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_templates_category ON custom_templates(category);

-- RLS
ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates" ON custom_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view public templates" ON custom_templates
  FOR SELECT USING (is_public = true);

CREATE POLICY "Service role full access templates" ON custom_templates
  FOR ALL USING (auth.role() = 'service_role');
