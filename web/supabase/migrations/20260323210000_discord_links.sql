-- ============================================================
-- Discord Account Links: ff_discord_links
-- Migration: 20260323210000_discord_links
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ff_discord_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  discord_username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_role_sync timestamptz
);

-- Unique index on discord_user_id — one Discord account per FlashFlow user
CREATE UNIQUE INDEX IF NOT EXISTS idx_ff_discord_links_discord_user_id
  ON public.ff_discord_links (discord_user_id);

-- RLS
ALTER TABLE public.ff_discord_links ENABLE ROW LEVEL SECURITY;

-- Service role has full access (implicit via supabaseAdmin)

-- Users can read their own link
DROP POLICY IF EXISTS "discord_links_select_own" ON public.ff_discord_links;
CREATE POLICY "discord_links_select_own" ON public.ff_discord_links
  FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own link
DROP POLICY IF EXISTS "discord_links_delete_own" ON public.ff_discord_links;
CREATE POLICY "discord_links_delete_own" ON public.ff_discord_links
  FOR DELETE USING (auth.uid() = user_id);
