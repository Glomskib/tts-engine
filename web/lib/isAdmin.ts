/**
 * Canonical isAdmin helper — single source of truth for admin access.
 *
 * Resolution order:
 *   1. app_metadata.role === 'admin'   (set by Supabase admin or service role)
 *   2. user_metadata.role === 'admin'  (set during signup or by user)
 *   3. Email in ADMIN_USERS env var    (comma-separated allowlist, authoritative fallback)
 *
 * Importable from both server and client contexts; env var is only evaluated
 * server-side (ADMIN_USERS is not a NEXT_PUBLIC_ var).
 */
import type { User } from '@supabase/supabase-js';

export type AdminRoleSource = 'app_metadata' | 'user_metadata' | 'allowlist' | 'none';

export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  // Only trust server-controlled app_metadata (not user-writable user_metadata)
  if (user.app_metadata?.role === 'admin') return true;

  const allowlist = process.env.ADMIN_USERS || '';
  const adminEmails = allowlist.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return true;

  return false;
}

export function getAdminRoleSource(user: User | null | undefined): AdminRoleSource {
  if (!user) return 'none';
  if (user.app_metadata?.role === 'admin') return 'app_metadata';
  const allowlist = process.env.ADMIN_USERS || '';
  const adminEmails = allowlist.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return 'allowlist';
  return 'none';
}
