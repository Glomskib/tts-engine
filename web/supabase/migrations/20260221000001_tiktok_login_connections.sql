-- TikTok Login Kit Connections
-- Stores OAuth tokens from Login Kit (user identity / profile data).
-- Separate from tiktok_content_connections (which is for video posting).

CREATE TABLE public.tiktok_login_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  open_id TEXT NOT NULL,
  union_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One Login Kit connection per user
CREATE UNIQUE INDEX idx_tiktok_login_conn_user ON public.tiktok_login_connections(user_id);

-- Status index for queries
CREATE INDEX idx_tiktok_login_conn_status ON public.tiktok_login_connections(status);

-- RLS
ALTER TABLE public.tiktok_login_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connection
CREATE POLICY "Users can view own login connection"
  ON public.tiktok_login_connections
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own connection
CREATE POLICY "Users can insert own login connection"
  ON public.tiktok_login_connections
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own connection
CREATE POLICY "Users can update own login connection"
  ON public.tiktok_login_connections
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own connection
CREATE POLICY "Users can delete own login connection"
  ON public.tiktok_login_connections
  FOR DELETE
  USING (user_id = auth.uid());
