-- ─────────────────────────────────────────────────────────────────────────────
-- Unified TikTok OAuth accounts table.
--
-- Consolidates the four existing token tables (personal / shop / affiliate /
-- creator) into one. Tokens are AES-256-GCM encrypted by the application via
-- lib/crypto/encrypt.ts before insert.
--
-- NOTE: We use `tiktok_oauth_accounts` (NOT `tiktok_accounts`) because the
-- table `public.tiktok_accounts` already exists in the schema for FlashFlow's
-- account-CMS surface (name, handle, type=affiliate/pod, posting_frequency...).
-- That CMS table is unrelated to OAuth tokens and is left untouched.
--
-- Backfill is intentionally NOT executed by this migration — Brandon should
-- review and run the SELECT/INSERT block at the bottom manually after
-- confirming column names of the legacy tables match. The new table is
-- created empty so new connections start writing here immediately.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tiktok_oauth_account_type') THEN
    CREATE TYPE tiktok_oauth_account_type AS ENUM (
      'personal',
      'shop',
      'affiliate',
      'creator'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.tiktok_oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which TikTok surface this connection is for
  account_type tiktok_oauth_account_type NOT NULL,

  -- TikTok-side identifier (open_id for content API, seller_id for shop, etc.)
  tiktok_user_id TEXT NOT NULL,

  -- Optional display fields cached from the OAuth response
  display_name TEXT,
  avatar_url TEXT,

  -- Tokens are AES-256-GCM ciphertext (base64). Encrypt with lib/crypto/encrypt.ts
  -- before INSERT. Never store plaintext here.
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,

  -- Granted OAuth scopes (e.g. 'user.info.basic', 'video.publish')
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Access-token expiry (refresh-token expiry tracked separately if needed)
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,

  -- Free-form metadata (region, app version, additional ids)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, account_type, tiktok_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_accounts_user
  ON public.tiktok_oauth_accounts (user_id, account_type);

CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_accounts_expires
  ON public.tiktok_oauth_accounts (expires_at)
  WHERE expires_at IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tiktok_oauth_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tiktok_oauth_accounts_updated_at ON public.tiktok_oauth_accounts;
CREATE TRIGGER trg_tiktok_oauth_accounts_updated_at
  BEFORE UPDATE ON public.tiktok_oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tiktok_oauth_accounts_set_updated_at();

-- RLS — users can read their own accounts; writes go through service role.
ALTER TABLE public.tiktok_oauth_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiktok_oauth_accounts_self_read ON public.tiktok_oauth_accounts;
CREATE POLICY tiktok_oauth_accounts_self_read
  ON public.tiktok_oauth_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — DO NOT RUN AUTOMATICALLY.
--
-- Brandon: after verifying column names of the legacy token tables, uncomment
-- and run this block. Each legacy row should be re-encrypted with the active
-- TOKEN_ENCRYPTION_KEY by passing through a small Node script that reads,
-- encrypts via lib/crypto/encrypt.ts, and inserts. Doing it raw in SQL would
-- store plaintext (or break, if the legacy column is plaintext).
--
-- Legacy tables to consolidate (verify exact names against your schema):
--   - tiktok_tokens                    (account_type = 'personal')
--   - tiktok_shop_tokens               (account_type = 'shop')
--   - tiktok_affiliate_tokens          (account_type = 'affiliate')
--   - tiktok_creator_tokens            (account_type = 'creator')
--
-- Example shape — adjust column names to match reality:
--
-- INSERT INTO public.tiktok_oauth_accounts (
--   user_id, account_type, tiktok_user_id, display_name, avatar_url,
--   encrypted_access_token, encrypted_refresh_token, scopes,
--   expires_at, refresh_expires_at, metadata
-- )
-- SELECT
--   user_id,
--   'personal'::tiktok_oauth_account_type,
--   open_id,
--   display_name,
--   avatar_url,
--   access_token_encrypted,            -- if already encrypted; else re-encrypt in app
--   refresh_token_encrypted,
--   string_to_array(scope, ','),
--   expires_at,
--   refresh_expires_at,
--   '{}'::jsonb
-- FROM public.tiktok_tokens
-- ON CONFLICT (user_id, account_type, tiktok_user_id) DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- TikTok Shop event log (webhook receiver target).
-- One row per inbound event from /api/webhooks/tiktok-shop. Idempotency is
-- enforced via UNIQUE(provider_event_id).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tiktok_shop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  oauth_account_id UUID REFERENCES public.tiktok_oauth_accounts(id) ON DELETE SET NULL,

  -- e.g. 'order.create', 'order.status_change', 'fulfillment.update'
  event_type TEXT NOT NULL,

  -- TikTok-supplied event id (used for dedupe)
  provider_event_id TEXT,

  -- Order / shop scoped context
  shop_id TEXT,
  order_id TEXT,

  -- Raw payload as received
  payload JSONB NOT NULL,

  -- Whether the signature verified at receive time
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT,

  UNIQUE (provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_tts_events_user_received
  ON public.tiktok_shop_events (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tts_events_type
  ON public.tiktok_shop_events (event_type);
CREATE INDEX IF NOT EXISTS idx_tts_events_order
  ON public.tiktok_shop_events (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.tiktok_shop_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tts_events_self_read ON public.tiktok_shop_events;
CREATE POLICY tts_events_self_read
  ON public.tiktok_shop_events
  FOR SELECT
  USING (auth.uid() = user_id);
