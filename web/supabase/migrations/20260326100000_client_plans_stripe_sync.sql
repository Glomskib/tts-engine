-- ============================================================
-- Extend client_plans for Stripe subscription sync
-- Migration: 20260326100000_client_plans_stripe_sync.sql
-- ============================================================
-- Adds columns needed to keep client_plans in sync with Stripe:
--   stripe_subscription_id, stripe_price_id, status,
--   current_period_end, priority_weight
-- Also adds a webhook idempotency table.
-- ============================================================

-- 1) New columns on client_plans
ALTER TABLE client_plans
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text,
  ADD COLUMN IF NOT EXISTS status                 text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS priority_weight        int NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_client_plans_stripe_sub
  ON client_plans(stripe_subscription_id);

-- 2) Webhook idempotency — store processed Stripe event IDs
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-expire old rows (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON stripe_webhook_events(processed_at);

-- ============================================================
-- DONE
-- ============================================================
