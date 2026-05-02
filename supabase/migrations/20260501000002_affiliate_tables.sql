-- ─────────────────────────────────────────────────────────────────────────────
-- TikTok Shop Affiliate tables — FlashFlow's Helium 10 wedge.
--
-- Two tables:
--   affiliate_collaborations — one row per join/sample/active affiliate deal
--   affiliate_commissions    — one row per commission event from TT Shop
--
-- Both are user-scoped; RLS default-denies and only allows the owner to read
-- their own rows. Writes happen via service role from API routes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enums --------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'affiliate_collab_status') THEN
    CREATE TYPE affiliate_collab_status AS ENUM (
      'discovered',     -- pulled from search, not yet joined
      'requested',      -- user asked to join / sample
      'approved',       -- TT approved
      'active',         -- collab live, can earn commission
      'paused',
      'rejected',
      'ended'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'affiliate_sample_status') THEN
    CREATE TYPE affiliate_sample_status AS ENUM (
      'none',           -- no sample requested
      'pending',
      'approved',
      'rejected',
      'shipped',
      'delivered'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'affiliate_commission_status') THEN
    CREATE TYPE affiliate_commission_status AS ENUM (
      'pending',        -- order placed, not yet settled
      'settled',        -- commission posted to seller payout
      'reversed',       -- order cancelled / refunded
      'voided'
    );
  END IF;
END$$;

-- affiliate_collaborations --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TT side identifiers
  collaboration_id TEXT,                        -- TT's id for the collaboration row
  product_id TEXT NOT NULL,
  shop_id TEXT,
  shop_cipher TEXT,                              -- which TT shop this product is from

  -- Cached display fields
  product_title TEXT,
  product_image_url TEXT,
  category_id TEXT,
  category_name TEXT,

  -- Lifecycle
  status affiliate_collab_status NOT NULL DEFAULT 'discovered',
  commission_rate NUMERIC(6,4),                  -- 0.1500 = 15%

  -- Sample fulfillment
  sample_status affiliate_sample_status NOT NULL DEFAULT 'none',
  sample_request_id TEXT,
  sample_address_id TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Best-effort raw response cache (for debugging / re-mapping later)
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_collabs_user_status
  ON public.affiliate_collaborations (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_collabs_product
  ON public.affiliate_collaborations (product_id);

CREATE OR REPLACE FUNCTION public.affiliate_collaborations_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_collabs_updated_at ON public.affiliate_collaborations;
CREATE TRIGGER trg_affiliate_collabs_updated_at
  BEFORE UPDATE ON public.affiliate_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_collaborations_set_updated_at();

ALTER TABLE public.affiliate_collaborations ENABLE ROW LEVEL SECURITY;

-- Default-deny — only the owner can read.
DROP POLICY IF EXISTS affiliate_collabs_self_read ON public.affiliate_collaborations;
CREATE POLICY affiliate_collabs_self_read
  ON public.affiliate_collaborations
  FOR SELECT
  USING (auth.uid() = user_id);

-- affiliate_commissions ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TT side identifiers
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  collaboration_id TEXT,

  -- Money — store in minor units (cents) for integer math.
  gross_cents BIGINT NOT NULL DEFAULT 0,
  commission_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',

  status affiliate_commission_status NOT NULL DEFAULT 'pending',

  posted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_user_posted
  ON public.affiliate_commissions (user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status
  ON public.affiliate_commissions (status);

CREATE OR REPLACE FUNCTION public.affiliate_commissions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_commissions_updated_at ON public.affiliate_commissions;
CREATE TRIGGER trg_affiliate_commissions_updated_at
  BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_commissions_set_updated_at();

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_commissions_self_read ON public.affiliate_commissions;
CREATE POLICY affiliate_commissions_self_read
  ON public.affiliate_commissions
  FOR SELECT
  USING (auth.uid() = user_id);
