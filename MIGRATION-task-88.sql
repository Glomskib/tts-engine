-- =============================================================
-- MIGRATION: Task 88 — Marketing Infrastructure
-- Run in Supabase SQL Editor
-- =============================================================

-- =============================================
-- 1. Email Queue (scheduled email sequences)
-- =============================================
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_name TEXT DEFAULT '',
  sequence TEXT NOT NULL CHECK (sequence IN ('onboarding', 'lead_magnet', 'winback', 'weekly_digest', 'upgrade_nudge')),
  step INTEGER NOT NULL DEFAULT 0,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  error TEXT DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending ON email_queue(send_at) WHERE sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_queue_email ON email_queue(user_email);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages email queue" ON email_queue
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- 2. Email Subscribers (lead magnet + marketing)
-- =============================================
CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'lead_magnet',
  subscribed BOOLEAN DEFAULT TRUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);

ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subscribers" ON email_subscribers
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- 3. Brand Invites
-- =============================================
CREATE TABLE IF NOT EXISTS brand_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  click_count INTEGER DEFAULT 0,
  signup_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_invites_code ON brand_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_brand_invites_brand ON brand_invites(brand_id);

ALTER TABLE brand_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand owners manage invites" ON brand_invites
  FOR ALL USING (
    created_by = auth.uid()
    OR auth.role() = 'service_role'
  );

-- RPC for atomic click increment
CREATE OR REPLACE FUNCTION increment_brand_invite_clicks(p_invite_code TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE brand_invites
  SET click_count = click_count + 1
  WHERE invite_code = p_invite_code AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
