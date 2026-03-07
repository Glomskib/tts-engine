/**
 * requireAdmin — server-side admin gate for API routes.
 *
 * Returns a 401/403 Response if the caller is not an authenticated admin,
 * or null if the check passes.
 *
 * Usage:
 *   const deny = requireAdmin(auth);
 *   if (deny) return deny;
 *
 * This must be called with the AuthContext from getApiAuthContext(), not
 * with any client-provided value. UI-level gating (middleware, layout) is
 * not a security control and must not be relied upon alone.
 */
import { NextResponse } from 'next/server';
import type { AuthContext } from '@/lib/supabase/api-auth';

export function requireAdmin(auth: AuthContext): Response | null {
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: 'Authentication required' },
      { status: 401 }
    );
  }
  if (!auth.isAdmin) {
    return NextResponse.json(
      { ok: false, error: 'Admin access required' },
      { status: 403 }
    );
  }
  return null;
}
