-- Migration 101: Webhooks and Custom Templates
-- Webhooks: allow users to receive HTTP callbacks on FlashFlow events
-- Custom Templates: user-created script templates with variables

-- ============================================================================
-- WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Webhook',
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  max_failures INTEGER NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status_code INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own webhook deliveries" ON webhook_deliveries FOR SELECT USING (webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid()));
CREATE POLICY "Service role full access webhooks" ON webhooks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access deliveries" ON webhook_deliveries FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- CUSTOM TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  hook_template TEXT,
  body_template TEXT,
  cta_template TEXT,
  variables TEXT[] NOT NULL DEFAULT '{}',
  structure JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_templates_user_id ON custom_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_templates_category ON custom_templates(category);

ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates" ON custom_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view public templates" ON custom_templates FOR SELECT USING (is_public = true);
CREATE POLICY "Service role full access templates" ON custom_templates FOR ALL USING (auth.role() = 'service_role');
