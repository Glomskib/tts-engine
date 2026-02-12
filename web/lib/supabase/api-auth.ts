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
 *   - Cookie-based session auth (default)
 *   - API key auth (Bearer ff_ak_* tokens)
 *
 * All API routes should use this function instead of calling
 * `createServerSupabaseClient()` or parsing Bearer tokens directly.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyApiKeyFromRequest } from '@/lib/api-keys';

export type UserRole = 'admin' | 'creator' | 'recorder' | 'editor' | 'uploader' | 'va' | 'bot';

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
 * Parse ADMIN_USERS environment variable into a Set of lowercase emails.
 * ADMIN_USERS is authoritative - if email is in this list, user is admin.
 */
function parseAdminUsersEnv(): Set<string> {
  const raw = process.env.ADMIN_USERS || "";
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

/**
 * Parse UPLOADER_USERS environment variable into a Set of lowercase emails.
 * UPLOADER_USERS is a bootstrap allowlist for uploader role.
 */
function parseUploaderUsersEnv(): Set<string> {
  const raw = process.env.UPLOADER_USERS || "";
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
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
 */
async function resolveUserRole(
  userId: string,
  email: string | undefined
): Promise<AuthContext> {
  const adminEmails = parseAdminUsersEnv();
  const userEmail = email?.toLowerCase();

  if (userEmail && adminEmails.has(userEmail)) {
    return {
      user: { id: userId, email },
      role: 'admin',
      isAdmin: true,
      isUploader: true,
    };
  }

  let role = await safeGetUserRole(supabaseAdmin, userId);

  if (!role && userEmail) {
    const uploaderEmails = parseUploaderUsersEnv();
    if (uploaderEmails.has(userEmail)) {
      role = 'uploader';
    }
  }

  // Default to 'creator' if no role found
  if (!role) {
    role = 'creator';
  }

  return {
    user: { id: userId, email },
    role,
    isAdmin: role === 'admin',
    isUploader: role === 'admin' || role === 'uploader',
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
  // API key auth path: if request has a Bearer ff_ak_* token, use it
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ff_ak_')) {
      const keyResult = await verifyApiKeyFromRequest(request);
      if (!keyResult) {
        return { user: null, role: null, isAdmin: false, isUploader: false };
      }

      // Look up user email for role resolution
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(keyResult.userId);
      const email = userData?.user?.email;

      return resolveUserRole(keyResult.userId, email);
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
    return { user: null, role: null, isAdmin: false, isUploader: false };
  }

  return resolveUserRole(user.id, user.email);
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
