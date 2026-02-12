-- Migration 108: Add unsubscribe support to email_subscribers
-- Adds token-based unsubscribe for CAN-SPAM / GDPR compliance

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Index for fast token lookup during unsubscribe
CREATE INDEX IF NOT EXISTS idx_email_subscribers_unsubscribe_token
  ON email_subscribers (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;
