/**
 * Maps existing auth roles to dashboard role categories.
 *
 * Dashboard roles:
 *   admin  — full workspace visibility
 *   team   — operational staff (editors, recorders, uploaders, VAs)
 *   client — brand/client users (video_editing subscription)
 *   creator — default content creators
 */

import type { UserRole } from '@/contexts/AuthContext';

export type DashboardRole = 'admin' | 'team' | 'client' | 'creator';

const TEAM_ROLES: UserRole[] = ['recorder', 'editor', 'uploader', 'va'];

export function getDashboardRole(
  role: UserRole,
  isAdmin: boolean,
): DashboardRole {
  if (isAdmin || role === 'admin') return 'admin';
  if (role && TEAM_ROLES.includes(role)) return 'team';
  // 'creator' is the default for saas users
  return 'creator';
}
