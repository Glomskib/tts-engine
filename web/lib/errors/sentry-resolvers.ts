/**
 * Shared Sentry context resolvers for withErrorCapture.
 *
 * These extract user, workspace, and content item IDs from requests
 * so that Sentry events include rich, searchable context.
 */

import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * Resolve the authenticated user ID from the request.
 * Returns undefined if auth fails (never throws).
 */
export async function resolveUserId(request: Request): Promise<string | undefined> {
  try {
    const { user } = await getApiAuthContext(request);
    return user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the workspace ID from the request.
 * In single-workspace mode, workspace_id === user.id.
 */
export async function resolveWorkspaceId(request: Request): Promise<string | undefined> {
  return resolveUserId(request);
}

/**
 * Resolve the content item ID from route params.
 * Works with /api/content-items/[id]/... routes.
 */
export async function resolveContentItemId(
  _request: Request,
  context?: { params?: Promise<Record<string, string>> },
): Promise<string | undefined> {
  try {
    const params = await context?.params;
    return params?.id;
  } catch {
    return undefined;
  }
}
