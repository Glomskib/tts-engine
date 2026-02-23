-- TikTok Partner API Connections
-- Stores OAuth tokens from the Partner API (user.info.basic, video.list scopes).
-- Separate from tiktok_login_connections (Login Kit) and tiktok_content_connections (Content Posting).

CREATE TABLE IF NOT EXISTS public.tiktok_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tiktok_open_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  last_error TEXT,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required by callback's onConflict upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_conn_user_open_id
  ON public.tiktok_connections(user_id, tiktok_open_id);

-- One active connection per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_conn_active_user
  ON public.tiktok_connections(user_id) WHERE status = 'active';

-- Status index for queries
CREATE INDEX IF NOT EXISTS idx_tiktok_conn_status
  ON public.tiktok_connections(status);

-- RLS
ALTER TABLE public.tiktok_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connection
DROP POLICY IF EXISTS "Users can view own partner connection" ON public.tiktok_connections;
CREATE POLICY "Users can view own partner connection"
  ON public.tiktok_connections
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own connection
DROP POLICY IF EXISTS "Users can insert own partner connection" ON public.tiktok_connections;
CREATE POLICY "Users can insert own partner connection"
  ON public.tiktok_connections
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own connection
DROP POLICY IF EXISTS "Users can update own partner connection" ON public.tiktok_connections;
CREATE POLICY "Users can update own partner connection"
  ON public.tiktok_connections
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own connection
DROP POLICY IF EXISTS "Users can delete own partner connection" ON public.tiktok_connections;
CREATE POLICY "Users can delete own partner connection"
  ON public.tiktok_connections
  FOR DELETE
  USING (user_id = auth.uid());
