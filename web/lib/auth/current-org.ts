/**
 * Current-org resolution + role enforcement for multi-tenant routes.
 *
 * Gating: if `ENABLE_MULTI_TENANCY` is unset (default), every helper
 * here returns the user's personal org. Once Brandon flips the env flag,
 * the org switcher cookie (`ff_active_org`) is honored and roles are
 * enforced.
 */
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const MULTI_TENANCY_ENABLED = process.env.ENABLE_MULTI_TENANCY === '1' ||
  process.env.ENABLE_MULTI_TENANCY === 'true';

export const ORG_COOKIE = 'ff_active_org';

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface CurrentOrgResult {
  orgId: string | null;
  role: OrgRole | null;
  isPersonal: boolean;
}

/**
 * Resolve the current org for the logged-in user.
 *
 * Returns { orgId: null } if the user isn't logged in or has no org rows
 * (which shouldn't happen post-personal-org-trigger, but be defensive).
 */
export async function getCurrentOrgId(): Promise<CurrentOrgResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { orgId: null, role: null, isPersonal: false };

  // Read the cookie hint (only honored when multi-tenancy is enabled).
  const c = await cookies();
  const cookieOrgId = c.get(ORG_COOKIE)?.value;

  if (MULTI_TENANCY_ENABLED && cookieOrgId) {
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('org_id', cookieOrgId)
      .maybeSingle();
    if (membership) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, is_personal')
        .eq('id', membership.org_id)
        .maybeSingle();
      return {
        orgId: membership.org_id,
        role: membership.role as OrgRole,
        isPersonal: Boolean(org?.is_personal),
      };
    }
  }

  // Default: personal org for this user.
  const { data: personal } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('is_personal', true)
    .maybeSingle();

  if (!personal) {
    // Trigger should have created this — but if it hasn't, fail gracefully.
    return { orgId: null, role: null, isPersonal: false };
  }

  return { orgId: personal.id, role: 'owner', isPersonal: true };
}

const ROLE_RANK: Record<OrgRole, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };

export function hasRoleAtLeast(actual: OrgRole | null, required: OrgRole): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Throw a 403 if the current user's role is below `required`. Use inside
 * route handlers as a guard.
 */
export class InsufficientOrgRoleError extends Error {
  status = 403;
  constructor(public required: OrgRole, public actual: OrgRole | null) {
    super(`Insufficient role: needs ${required}, has ${actual ?? 'none'}`);
    this.name = 'InsufficientOrgRoleError';
  }
}

/**
 * Throws if the user isn't logged in (orgId is null) — caller handles 401.
 * Throws InsufficientOrgRoleError otherwise — caller handles 403.
 */
export class NotAuthenticatedError extends Error {
  status = 401;
  constructor() { super('not authenticated'); this.name = 'NotAuthenticatedError'; }
}

export async function requireOrgRole(required: OrgRole): Promise<CurrentOrgResult> {
  const ctx = await getCurrentOrgId();
  if (!ctx.orgId) {
    throw new NotAuthenticatedError();
  }
  if (!hasRoleAtLeast(ctx.role, required)) {
    throw new InsufficientOrgRoleError(required, ctx.role);
  }
  return ctx;
}
