/**
 * Tenant scoping helpers.
 *
 * FlashFlow is currently in single-workspace-per-user mode:
 *   workspace_id === user_id === authContext.user.id
 *
 * These helpers centralise that assumption so we can upgrade to
 * true multi-workspace later by changing only this file.
 *
 * See docs/architecture/tenant-scoping.md for full rules.
 */

// AuthContext is the shape returned by getApiAuthContext()
export interface TenantAuthContext {
  user: { id: string } | null;
  isAdmin?: boolean;
}

/**
 * Returns the authenticated user's ID.
 * Throws if the user is not authenticated — guard with requireAuth first.
 */
export function getUserId(authContext: TenantAuthContext): string {
  if (!authContext.user) {
    throw new Error('getUserId called without an authenticated user');
  }
  return authContext.user.id;
}

/**
 * Returns the workspace ID for the authenticated user.
 *
 * In single-workspace-per-user mode this is always == user ID.
 * In future multi-workspace mode this will read from the session/token.
 */
export function getWorkspaceId(authContext: TenantAuthContext): string {
  if (!authContext.user) {
    throw new Error('getWorkspaceId called without an authenticated user');
  }
  return authContext.user.id;
}

/**
 * Applies a user_id scope filter to any Supabase query builder.
 * Use for user-scoped tables (user_id column convention).
 *
 * Usage:
 *   const { data } = await scopeToUser(
 *     supabaseAdmin.from('creator_profiles').select('*'),
 *     authContext,
 *   );
 */
export function scopeToUser<T>(
  query: T & { eq: (column: string, value: string) => T },
  authContext: TenantAuthContext,
): T {
  return query.eq('user_id', getUserId(authContext));
}

/**
 * Applies a workspace_id scope filter to any Supabase query builder.
 *
 * Usage:
 *   const { data } = await scopeToWorkspace(
 *     supabaseAdmin.from('content_items').select('*'),
 *     authContext,
 *   );
 */
export function scopeToWorkspace<T>(
  query: T & { eq: (column: string, value: string) => T },
  authContext: TenantAuthContext,
): T {
  return query.eq('workspace_id', getWorkspaceId(authContext));
}

/**
 * Dev-time assertion: verifies a DB row belongs to the current tenant.
 * Throws (does NOT return 403) — only call this where data leakage
 * would be a silent bug, not a user-facing error.
 */
export function assertTenantScopedRow(
  row: { workspace_id?: string; user_id?: string } | null,
  authContext: TenantAuthContext,
  context = 'assertTenantScopedRow',
): void {
  const wid = getWorkspaceId(authContext);
  if (!row) return; // null row = not found, caller handles 404
  if (row.workspace_id && row.workspace_id !== wid) {
    throw new Error(`[${context}] Row workspace_id ${row.workspace_id} !== current workspace ${wid}`);
  }
  if (row.user_id && row.user_id !== wid) {
    throw new Error(`[${context}] Row user_id ${row.user_id} !== current workspace ${wid}`);
  }
}
