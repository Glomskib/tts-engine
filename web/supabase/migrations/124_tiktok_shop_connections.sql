-- Migration 124: TikTok Shop API Connections
-- Purpose: Store OAuth2 tokens and shop info for TikTok Shop Open API integration

CREATE TABLE IF NOT EXISTS public.tiktok_shop_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- OAuth2 tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,

  -- Seller / Shop info (from token response + getAuthorizedShops)
  open_id TEXT,
  seller_name TEXT,
  seller_base_region TEXT,
  shop_id TEXT,
  shop_name TEXT,
  shop_cipher TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One connection per user (can expand later)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_shop_conn_user
  ON public.tiktok_shop_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_shop_conn_status
  ON public.tiktok_shop_connections(status);

-- RLS
ALTER TABLE public.tiktok_shop_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tiktok shop connections" ON public.tiktok_shop_connections;
CREATE POLICY "Users can view own tiktok shop connections" ON public.tiktok_shop_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tiktok shop connections" ON public.tiktok_shop_connections;
CREATE POLICY "Users can insert own tiktok shop connections" ON public.tiktok_shop_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tiktok shop connections" ON public.tiktok_shop_connections;
CREATE POLICY "Users can update own tiktok shop connections" ON public.tiktok_shop_connections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tiktok shop connections" ON public.tiktok_shop_connections;
CREATE POLICY "Users can delete own tiktok shop connections" ON public.tiktok_shop_connections
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.tiktok_shop_connections IS 'Stores TikTok Shop Open API OAuth2 tokens and shop metadata per user';
