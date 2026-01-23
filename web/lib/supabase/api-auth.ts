import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader';

export interface AuthContext {
  user: {
    id: string;
    email: string | undefined;
  } | null;
  role: UserRole | null;
  isAdmin: boolean;
}

/**
 * Get authentication context for API routes.
 * Returns user info and role derived from session.
 */
export async function getApiAuthContext(): Promise<AuthContext> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Cannot set cookies in API routes during response
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Cannot remove cookies in API routes during response
          }
        },
      },
    }
  );

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null, isAdmin: false };
  }

  // Check ADMIN_USERS env for legacy admin support
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isEnvAdmin = user.email && adminUsers.includes(user.email);

  if (isEnvAdmin) {
    return {
      user: { id: user.id, email: user.email },
      role: 'admin',
      isAdmin: true,
    };
  }

  // Query user_roles table using admin client (bypasses RLS)
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = (roleData?.role as UserRole) || null;

  return {
    user: { id: user.id, email: user.email },
    role,
    isAdmin: role === 'admin',
  };
}

/**
 * Check if the current user is allowed to bypass claim checks.
 * This is true for admins with force=true.
 */
export function canBypassClaim(authContext: AuthContext, forceRequested: boolean): boolean {
  return authContext.isAdmin && forceRequested;
}

/**
 * Check if the current user's role allows a specific recording_status transition.
 */
export function roleAllowsTransition(
  role: UserRole | null,
  targetStatus: string
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;

  const allowedTransitions: Record<string, UserRole[]> = {
    RECORDED: ['recorder', 'admin'],
    EDITED: ['editor', 'admin'],
    READY_TO_POST: ['editor', 'admin'],
    POSTED: ['uploader', 'admin'],
    REJECTED: ['recorder', 'editor', 'uploader', 'admin'],
  };

  const allowedRoles = allowedTransitions[targetStatus];
  return allowedRoles ? allowedRoles.includes(role) : false;
}
