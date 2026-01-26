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
 * Get authentication context for API routes.
 * Returns user info and role derived from session.
 *
 * Resolution order:
 * 1. ADMIN_USERS env (authoritative - email match = admin)
 * 2. user_roles table (if exists)
 * 3. Default: no role
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
    return { user: null, role: null, isAdmin: false, isUploader: false };
  }

  // Check ADMIN_USERS env (authoritative for admin access)
  const adminEmails = parseAdminUsersEnv();
  const userEmail = user.email?.toLowerCase();
  if (userEmail && adminEmails.has(userEmail)) {
    return {
      user: { id: user.id, email: user.email },
      role: 'admin',
      isAdmin: true,
      isUploader: true, // Admins can act as uploaders
    };
  }

  // Query user_roles table (safe - handles missing table)
  let role = await safeGetUserRole(supabaseAdmin, user.id);

  // Check UPLOADER_USERS env as fallback for uploader role
  if (!role && userEmail) {
    const uploaderEmails = parseUploaderUsersEnv();
    if (uploaderEmails.has(userEmail)) {
      role = 'uploader';
    }
  }

  return {
    user: { id: user.id, email: user.email },
    role,
    isAdmin: role === 'admin',
    isUploader: role === 'admin' || role === 'uploader',
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
