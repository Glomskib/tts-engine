import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase client for server-side operations with cookie-based auth.
 * Use this in Server Components, Route Handlers, and Server Actions.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required. " +
      "Add it to your .env.local file or Vercel environment variables."
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required. " +
      "Add it to your .env.local file or Vercel environment variables."
    );
  }

  return createServerClient(
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
            // In Server Components, cookies cannot be set
            // This is expected when called from a Server Component
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
 * Get the current user's role from the user_roles table.
 * Returns null if not authenticated or no role found.
 */
export async function getUserRole(): Promise<'admin' | 'recorder' | 'editor' | 'uploader' | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();

  // First check ADMIN_USERS env for legacy admin support
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (user.email && adminUsers.includes(user.email)) {
    return 'admin';
  }

  // Query user_roles table
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    // Default to null (no role) if not found
    return null;
  }

  return data.role as 'admin' | 'recorder' | 'editor' | 'uploader';
}

/**
 * Get complete auth context: user + role.
 * Returns { user: null, role: null } if not authenticated.
 */
export async function getAuthContext() {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, role: null };
  }

  const supabase = await createServerSupabaseClient();

  // Check ADMIN_USERS env
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (user.email && adminUsers.includes(user.email)) {
    return { user, role: 'admin' as const };
  }

  // Query user_roles table
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
