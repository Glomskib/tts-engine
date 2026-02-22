-- Migration: Plan-based roles
-- Replaces legacy internal roles with plan-based roles.
-- Role now mirrors the user's SaaS plan: free, creator_lite, creator_pro, brand, agency.

-- 1. Drop the old CHECK constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- 2. Backfill: set each user's role to match their plan_id (BEFORE adding new constraint)
--    Skip users who already have 'admin' role.
INSERT INTO public.user_roles (user_id, role)
SELECT us.user_id, us.plan_id
FROM public.user_subscriptions us
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = us.user_id AND ur.role = 'admin'
)
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role
  WHERE public.user_roles.role != 'admin';

-- 3. Any remaining rows with legacy roles (creator, recorder, editor, etc.) → set to 'free'
UPDATE public.user_roles
SET role = 'free'
WHERE role NOT IN ('admin', 'free', 'creator_lite', 'creator_pro', 'brand', 'agency');

-- 4. Any auth user with no subscription and no role gets 'free'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'free'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = u.id
);

-- 5. Now add the new CHECK constraint (all rows are clean)
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'free', 'creator_lite', 'creator_pro', 'brand', 'agency'));

-- 6. Update helper function default to 'free'
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()),
    'free'
  );
$$;
