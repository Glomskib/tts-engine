-- Migration: Email Queue + Subscribers
-- Task 88 Phase 2-3
-- Run in Supabase SQL Editor

-- =============================================
-- Email Queue (for scheduled email sequences)
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
-- Email Subscribers (lead magnet + marketing)
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
