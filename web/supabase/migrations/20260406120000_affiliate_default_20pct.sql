-- =============================================
-- Affiliate default commission rate → 20%
-- Spec: "20% recurring" (Scale System launch)
-- Existing affiliates keep whatever rate was set on their row.
-- Only the DEFAULT for new signups changes.
-- =============================================

ALTER TABLE affiliate_accounts
  ALTER COLUMN commission_rate SET DEFAULT 0.20;
