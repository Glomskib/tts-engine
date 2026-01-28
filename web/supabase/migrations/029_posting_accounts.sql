-- Migration 029: Posting Accounts
-- Purpose: Create posting_accounts table for TikTok posting account management
-- and add posting_account_id to videos table

-- Create posting_accounts table
CREATE TABLE IF NOT EXISTS public.posting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  account_code text NOT NULL UNIQUE,
  platform text DEFAULT 'tiktok',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on account_code for lookups
CREATE INDEX IF NOT EXISTS idx_posting_accounts_code ON public.posting_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_posting_accounts_active ON public.posting_accounts(is_active) WHERE is_active = true;

-- Seed the 5 accounts
INSERT INTO public.posting_accounts (display_name, account_code, platform, is_active) VALUES
  ('BKAdventures0', 'BKADV0', 'tiktok', true),
  ('Health.Kate', 'HEALTHK', 'tiktok', true),
  ('HolisticNaturalLiving', 'HNLIVE', 'tiktok', true),
  ('Holistic Lifestyle', 'HOLIFE', 'tiktok', true),
  ('Kat.Gl', 'KATGL', 'tiktok', true)
ON CONFLICT (account_code) DO NOTHING;

-- Add posting_account_id to videos table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'posting_account_id') THEN
    ALTER TABLE public.videos ADD COLUMN posting_account_id uuid REFERENCES public.posting_accounts(id);
  END IF;
END $$;

-- Create index on posting_account_id for joins
CREATE INDEX IF NOT EXISTS idx_videos_posting_account ON public.videos(posting_account_id);

-- Create team_members table for display name mapping
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE, -- auth user id or email prefix
  display_name text NOT NULL,
  role text, -- 'editor', 'creator', 'uploader', etc.
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed known team members
INSERT INTO public.team_members (user_id, display_name, role, is_active) VALUES
  ('editor1', 'Denver', 'editor', true),
  ('creator1', 'Brandon', 'creator', true),
  ('creator2', 'Katlyn', 'creator', true),
  ('editor2', 'Editor 2', 'editor', true),
  ('uploader1', 'Uploader', 'uploader', true)
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Create index for team member lookups
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
