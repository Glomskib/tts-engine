/**
 * @module api-auth
 *
 * Canonical server-side auth module for all API routes.
 *
 * Usage:
 *   import { getApiAuthContext } from '@/lib/supabase/api-auth';
 *   const auth = await getApiAuthContext(request);
 *   if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', ...);
 *
 * `getApiAuthContext()` supports:
 *   - API key auth (Bearer ff_ak_* tokens)
 *   - Raw Supabase JWT auth (Bearer eyJ... tokens)
 *   - Cookie-based session auth (default fallback)
 *
 * All API routes should use this function instead of calling
 * `createServerSupabaseClient()` or parsing Bearer tokens directly.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyApiKeyFromRequest } from '@/lib/api-keys';
import { isAdmin as checkIsAdmin, getAdminRoleSource } from '@/lib/isAdmin';
export { getAdminRoleSource };

export type UserRole = 'admin' | 'free' | 'creator_lite' | 'creator_pro' | 'brand' | 'agency';

export interface AuthContext {
  user: {
    id: string;
    email: string | undefined;
  } | null;
  role: UserRole | null;
  isAdmin: boolean;
  isUploader: boolean;
}


/**
 * Safely get user role from user_roles table.
 * Returns null if table doesn't exist or query fails.
 */
async function safeGetUserRole(
  supabase: typeof supabaseAdmin,
  userId: string
): Promise<UserRole | null> {
  try {
    // Note: table may not exist in all environments - error handled below
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (error) return null;
    return (data?.role as UserRole) ?? null;
  } catch {
    // Table doesn't exist or other error
    return null;
  }
}

/**
 * Resolve role for a given user ID and email.
 * Shared between session auth and API key auth paths.
 *
 * Admin check order (via isAdmin from lib/isAdmin.ts):
 *   1. app_metadata.role === 'admin'
 *   2. user_metadata.role === 'admin'
 *   3. Email in ADMIN_USERS env
 */
async function resolveUserRole(
  userId: string,
  email: string | undefined,
  supabaseUser?: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }
): Promise<AuthContext> {
  // Build a minimal User-like object for the isAdmin helper
  const userLike = { id: userId, email, app_metadata: supabaseUser?.app_metadata ?? {}, user_metadata: supabaseUser?.user_metadata ?? {} } as Parameters<typeof checkIsAdmin>[0];
  const adminOk = checkIsAdmin(userLike);

  if (adminOk) {
    return {
      user: { id: userId, email },
      role: 'admin',
      isAdmin: true,
      isUploader: true,
    };
  }

  let role = await safeGetUserRole(supabaseAdmin, userId);

  // Default to 'free' if no role found
  if (!role) {
    role = 'free';
  }

  return {
    user: { id: userId, email },
    role,
    isAdmin: role === 'admin',
    isUploader: role === 'admin',
  };
}

/**
 * Get authentication context for API routes.
 * Returns user info and role derived from session or API key.
 *
 * When `request` is provided and contains a Bearer ff_ak_* token,
 * API key auth is used. Otherwise falls back to cookie-based session auth.
 *
 * Resolution order for role:
 * 1. ADMIN_USERS env (authoritative - email match = admin)
 * 2. user_roles table (if exists)
 * 3. Default: no role
 */
export async function getApiAuthContext(request?: Request): Promise<AuthContext> {
  // API key auth path: check Authorization header or x-api-key header
  if (request) {
    const authHeader = request.headers.get('authorization');
    const xApiKey = request.headers.get('x-api-key');
    if ((authHeader && authHeader.startsWith('Bearer ff_ak_')) || (xApiKey && xApiKey.startsWith('ff_ak_'))) {
      const keyResult = await verifyApiKeyFromRequest(request);
      if (!keyResult) {
        return { user: null, role: null, isAdmin: false, isUploader: false };
      }

      // Look up user email + metadata for role resolution
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(keyResult.userId);
      const supaUser = userData?.user;

      return resolveUserRole(keyResult.userId, supaUser?.email, supaUser ?? undefined);
    }
  }

  // Raw Supabase JWT token path (programmatic access, scripts, external tools)
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ') && !authHeader.startsWith('Bearer ff_ak_')) {
      const token = authHeader.slice(7);
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          return resolveUserRole(user.id, user.email, user);
        }
      } catch {
        // Invalid/expired token — fall through to session auth
      }
    }
  }

  // Session auth path (existing behavior)
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
    return { user: null, role: null, isAdmin: false, isUploader: false };
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Cannot set cookies in API routes during response
          }
        },
      },
    }
  );

  // Get authenticated user (verifies JWT with Supabase, not just local decode)
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null, isAdmin: false, isUploader: false };
  }

  return resolveUserRole(user.id, user.email, user);
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
    RECORDED: ['admin'],
    EDITED: ['admin'],
    READY_TO_POST: ['admin'],
    POSTED: ['admin'],
    REJECTED: ['admin'],
  };

  const allowedRoles = allowedTransitions[targetStatus];
  return allowedRoles ? allowedRoles.includes(role) : false;
}
