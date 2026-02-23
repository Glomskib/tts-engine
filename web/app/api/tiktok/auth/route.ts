import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

/** Read and trim an env var; throw if empty. */
function requireEnv(name: string): string {
  const raw = process.env[name];
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const clientKey = requireEnv('TIKTOK_PARTNER_CLIENT_KEY');
    const redirectUri = requireEnv('TIKTOK_REDIRECT_URI');

    // Generate random state for CSRF protection
    const state = randomBytes(16).toString('hex');

    // Build TikTok OAuth URL manually to avoid URL-encoding commas in scope.
    // TikTok's v2 auth endpoint expects literal commas between scope values,
    // but URL.searchParams.set() encodes commas as %2C which TikTok rejects.
    const scope = 'user.info.basic,video.list';
    const params = [
      `client_key=${encodeURIComponent(clientKey)}`,
      `scope=${scope}`, // literal commas — TikTok requirement
      `response_type=code`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `state=${encodeURIComponent(state)}`,
    ].join('&');
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`;

    // Log masked diagnostics for debugging in production
    const maskedKey = clientKey.length > 6
      ? clientKey.slice(0, 2) + '***' + clientKey.slice(-4)
      : '***';
    console.log(`[tiktok/auth] Redirecting to TikTok OAuth (client_key=${maskedKey}, redirect_uri=${redirectUri}, scope=${scope}, cid=${correlationId})`);

    // Store state in cookie for verification in callback
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('tiktok_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[tiktok/auth] Error:', error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'TikTok OAuth initiation failed',
      500,
      correlationId
    );
  }
}
