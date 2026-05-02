-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenancy: organizations + memberships.
--
-- This migration ONLY creates the tables, types, the auto-personal-org
-- trigger, and helper functions. It does NOT yet rewrite RLS on existing
-- user-scoped tables — that's intentionally gated behind the
-- `ENABLE_MULTI_TENANCY` env flag in the app layer so we can roll this out
-- carefully.
--
-- Backfill behavior:
--   - On migration apply: every existing auth.users row gets a personal org
--     of type='creator' with the user as owner.
--   - On future signups: a trigger creates the personal org automatically.
--
-- IMPORTANT: when Brandon flips ENABLE_MULTI_TENANCY=1, run the FOLLOWUP
-- migration `20260501000004_multi_tenancy_rls.sql` (created alongside this
-- one) which adds org_id columns + updates RLS policies. Splitting them
-- means a busted RLS rewrite can't lock everyone out before we've vetted
-- it on a preview branch.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_type') THEN
    CREATE TYPE organization_type AS ENUM ('creator', 'brand', 'agency');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_member_role') THEN
    CREATE TYPE organization_member_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type organization_type NOT NULL DEFAULT 'creator',
  plan_tier TEXT NOT NULL DEFAULT 'free',
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Feature flag scope: when false, this org is hidden from the org-switcher
  -- (used during the auto-personal-org backfill to keep the UI quiet until
  -- ENABLE_MULTI_TENANCY=1).
  is_personal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON public.organizations (type);

CREATE OR REPLACE FUNCTION public.organizations_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_set_updated_at();

-- Memberships --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role organization_member_role NOT NULL DEFAULT 'editor',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members (org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members (user_id);

-- Org invites (pending — acceptance creates the membership row) -----------

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role organization_member_role NOT NULL DEFAULT 'editor',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.organization_invites (token);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create personal org on user signup.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_personal_org_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    'My Workspace'
  );

  INSERT INTO public.organizations (name, type, owner_user_id, is_personal, plan_tier)
  VALUES (v_name, 'creator', NEW.id, TRUE, 'free')
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role, joined_at)
  VALUES (v_org_id, NEW.id, 'owner', NOW())
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_personal_org_for_new_user ON auth.users;
CREATE TRIGGER trg_create_personal_org_for_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_personal_org_for_new_user();

-- Backfill existing users (idempotent — only inserts when missing) --------

INSERT INTO public.organizations (name, type, owner_user_id, is_personal, plan_tier)
SELECT
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email, 'My Workspace'),
  'creator',
  u.id,
  TRUE,
  'free'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o
  WHERE o.owner_user_id = u.id AND o.is_personal = TRUE
);

INSERT INTO public.organization_members (org_id, user_id, role, joined_at)
SELECT o.id, o.owner_user_id, 'owner', NOW()
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.org_id = o.id AND m.user_id = o.owner_user_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is_org_member(p_org_id) — used by RLS in the followup migration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_role(p_org_id UUID, p_role organization_member_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND (
        role = p_role OR
        -- owner outranks all
        (p_role <> 'owner' AND role = 'owner') OR
        -- admin outranks editor/viewer
        (p_role IN ('editor', 'viewer') AND role = 'admin') OR
        -- editor outranks viewer
        (p_role = 'viewer' AND role = 'editor')
      )
  );
$$;

-- RLS on the org tables themselves ----------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_member_read ON public.organizations;
CREATE POLICY organizations_member_read
  ON public.organizations
  FOR SELECT
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_owner_update ON public.organizations;
CREATE POLICY organizations_owner_update
  ON public.organizations
  FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_members_self_read ON public.organization_members;
CREATE POLICY org_members_self_read
  ON public.organization_members
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_role(org_id, 'admin'));

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_invites_admin_read ON public.organization_invites;
CREATE POLICY org_invites_admin_read
  ON public.organization_invites
  FOR SELECT
  USING (public.is_org_role(org_id, 'admin'));
