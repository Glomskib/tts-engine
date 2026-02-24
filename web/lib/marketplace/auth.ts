import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { MpRole } from './types';

export interface MpAuthContext {
  userId: string;
  email: string;
  displayName: string | null;
  role: MpRole;
  clientIds: string[];
  primaryClientId: string | null;
}

/**
 * Get marketplace auth context. Returns null if user has no mp_profiles row.
 * Does NOT redirect — caller decides what to do.
 */
export async function getMpAuthContext(): Promise<MpAuthContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const sb = await createServerSupabaseClient();

  // Use service-role-like approach: query mp_profiles directly
  const { data: profile } = await sb
    .from('mp_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const { data: memberships } = await sb
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id);

  const clientIds = (memberships || []).map((m: { client_id: string }) => m.client_id);

  return {
    userId: user.id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role as MpRole,
    clientIds,
    primaryClientId: clientIds[0] || null,
  };
}

/**
 * Require auth for client portal. Redirects to /login if not authed.
 * Returns "not-provisioned" if authed but no mp_profiles row.
 */
export async function requireClientAuth(): Promise<MpAuthContext | 'not-provisioned'> {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const ctx = await getMpAuthContext();
  if (!ctx) return 'not-provisioned';

  if (!['client_owner', 'client_member', 'admin'].includes(ctx.role)) {
    return 'not-provisioned';
  }

  return ctx;
}

/**
 * Require auth for VA portal. Redirects to /login if not authed.
 * Returns "not-provisioned" if authed but wrong role.
 */
export async function requireVaAuth(): Promise<MpAuthContext | 'not-provisioned'> {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const ctx = await getMpAuthContext();
  if (!ctx) return 'not-provisioned';

  if (!['va_editor', 'admin'].includes(ctx.role)) {
    return 'not-provisioned';
  }

  return ctx;
}
