/**
 * Simple service API key authentication for external tools.
 *
 * This provides a straightforward Bearer token auth mechanism using a single
 * SERVICE_API_KEY env var that maps to a SERVICE_USER_ID. This is separate
 * from the more complex user-scoped API keys (ff_ak_*) stored in the database.
 *
 * Usage in API routes:
 * ```
 * const auth = await validateApiAccess(request);
 * if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * const { userId, authType } = auth;
 * ```
 */

import { getApiAuthContext } from '@/lib/supabase/api-auth';

export type AuthType = 'api_key' | 'session' | 'service_key';

export interface ApiAccessResult {
  userId: string;
  authType: AuthType;
  email?: string;
}

/**
 * Validate API access using either:
 * 1. SERVICE_API_KEY (simple env-based key for external tools)
 * 2. Existing session or ff_ak_* API key auth (via getApiAuthContext)
 *
 * Returns user ID and auth type if valid, null if unauthorized.
 */
export async function validateApiAccess(request: Request): Promise<ApiAccessResult | null> {
  // Check for SERVICE_API_KEY first (simple Bearer token)
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (match) {
      const token = match[1];
      const serviceKey = process.env.SERVICE_API_KEY;
      const serviceUserId = process.env.SERVICE_USER_ID;

      // If it matches SERVICE_API_KEY, return the service user
      if (serviceKey && serviceUserId && token === serviceKey) {
        return {
          userId: serviceUserId,
          authType: 'service_key',
        };
      }

      // If it starts with ff_ak_, it will be handled by getApiAuthContext below
    }
  }

  // Fall back to existing auth (session or ff_ak_* API keys)
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return null;
  }

  // Determine if this was API key auth (ff_ak_*) or session
  const isApiKeyAuth = authHeader && authHeader.startsWith('Bearer ff_ak_');

  return {
    userId: authContext.user.id,
    authType: isApiKeyAuth ? 'api_key' : 'session',
    email: authContext.user.email,
  };
}
