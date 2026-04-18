-- ============================================================
-- Whop integration: extend plan tables with whop_* identifiers
-- and add idempotency ledger for Whop webhook events.
-- ============================================================

-- 1. whop_* columns on user_subscriptions (legacy plan table that getVEPlan
--    reads from). Stripe IDs stay for users who paid through Stripe; Whop IDs
--    populate when a membership lands via the Whop webhook.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS whop_user_id       TEXT,
  ADD COLUMN IF NOT EXISTS whop_membership_id TEXT,
  ADD COLUMN IF NOT EXISTS whop_product_id    TEXT;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_whop_user
  ON public.user_subscriptions (whop_user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_whop_membership
  ON public.user_subscriptions (whop_membership_id);

-- 2. Mirror the same identifiers on ff_entitlements (the new source of truth
--    used for access decisions outside VE).
ALTER TABLE public.ff_entitlements
  ADD COLUMN IF NOT EXISTS whop_user_id       TEXT,
  ADD COLUMN IF NOT EXISTS whop_membership_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ff_entitlements_whop_user
  ON public.ff_entitlements (whop_user_id);
CREATE INDEX IF NOT EXISTS idx_ff_entitlements_whop_membership
  ON public.ff_entitlements (whop_membership_id);

-- 3. whop_webhook_events: mirror of stripe_webhook_events used by
--    lib/whop/sync.ts for idempotency. Avoids double-processing the same
--    membership.activated delivery.
CREATE TABLE IF NOT EXISTS public.whop_webhook_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whop_webhook_events_type
  ON public.whop_webhook_events (event_type);

ALTER TABLE public.whop_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whop_webhook_events_service_write" ON public.whop_webhook_events;
CREATE POLICY "whop_webhook_events_service_write" ON public.whop_webhook_events
  FOR ALL USING (public.is_service_role());
