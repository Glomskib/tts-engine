import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_COOKIE_OPTIONS } from './cookie-options';
import { isAdmin } from '@/lib/isAdmin';

/**
 * Create a Supabase client for server-side operations with cookie-based auth.
 * Use this in Server Components, Route Handlers, and Server Actions.
 *
 * Single source of truth for all server-side Supabase sessions.
 * Cookie attributes are set via the shared SUPABASE_COOKIE_OPTIONS constant
 * so they're identical here and in middleware.ts.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
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
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

// Alias for backwards compatibility
export const createClient = createServerSupabaseClient;

/**
 * Get the current authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getAuthUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Get the current user's role.
 * Uses isAdmin() (app_metadata → user_metadata → ADMIN_USERS env).
 */
export async function getUserRole(): Promise<'admin' | 'recorder' | 'editor' | 'uploader' | null> {
  const user = await getAuthUser();
  if (!user) return null;

  if (isAdmin(user)) return 'admin';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return null;
  return data.role as 'admin' | 'recorder' | 'editor' | 'uploader';
}

/**
 * Get complete auth context: user + role.
 * Returns { user: null, role: null } if not authenticated.
 */
export async function getAuthContext() {
  const user = await getAuthUser();
  if (!user) return { user: null, role: null };

  if (isAdmin(user)) return { user, role: 'admin' as const };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  return {
    user,
    role: (data?.role || null) as 'admin' | 'recorder' | 'editor' | 'uploader' | null,
  };
}
