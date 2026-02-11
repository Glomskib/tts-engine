-- Migration 106: Extend role system with creator, va, bot roles
-- Adds new role types and sets admin user

-- 1. Drop the existing CHECK constraint and re-add with expanded roles
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'creator', 'recorder', 'editor', 'uploader', 'va', 'bot'));

-- 2. Set Brandon as admin (insert or update)
-- Uses email lookup from auth.users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'brandon@communitycorewholesale.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 3. Set default role for any existing users without a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'creator'
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL;

-- 4. Update the helper function to return 'creator' as default
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()),
    'creator'
  );
$$;
