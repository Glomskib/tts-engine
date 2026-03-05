import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

/**
 * Resolve TikTok client key from environment.
 * Checks TIKTOK_PARTNER_CLIENT_KEY first, falls back to TIKTOK_CLIENT_KEY.
 */
function resolveTikTokClientKey(): string {
  const partner = process.env.TIKTOK_PARTNER_CLIENT_KEY?.trim();
  const standard = process.env.TIKTOK_CLIENT_KEY?.trim();

  if (partner) return partner;
  if (standard) {
    console.log('[tiktok/auth] Using TIKTOK_CLIENT_KEY (TIKTOK_PARTNER_CLIENT_KEY not set)');
    return standard;
  }

  throw new Error(
    'TikTok client key missing. Set TIKTOK_PARTNER_CLIENT_KEY or TIKTOK_CLIENT_KEY in your environment.'
  );
}

/**
 * Resolve TikTok redirect URI.
 * Uses TIKTOK_REDIRECT_URI env var, or falls back to constructing from NEXT_PUBLIC_APP_URL.
 */
function resolveTikTokRedirectUri(requestUrl: string): string {
  const envUri = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (envUri) return envUri;

  // Fallback: derive from app URL or request origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/tiktok/callback`;
  }

  // Last resort: use request origin
  const origin = new URL(requestUrl).origin;
  console.warn(`[tiktok/auth] TIKTOK_REDIRECT_URI not set, deriving from request origin: ${origin}`);
  return `${origin}/api/tiktok/callback`;
}

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const clientKey = resolveTikTokClientKey();
    const redirectUri = resolveTikTokRedirectUri(request.url);

    // Validate client key format (should be alphanumeric, typically 15-30 chars)
    if (!/^[A-Za-z0-9_-]+$/.test(clientKey)) {
      console.error(`[tiktok/auth] client_key contains invalid characters (length=${clientKey.length})`);
      return createApiErrorResponse(
        'CONFIG_ERROR',
        'TikTok client key has invalid format. Check env vars for trailing whitespace or special characters.',
        500,
        correlationId
      );
    }

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
      ? clientKey.slice(0, 6) + '***'
      : '***';
    console.log(
      `[tiktok/auth] Redirecting to TikTok OAuth ` +
      `(client_key=${maskedKey}, len=${clientKey.length}, ` +
      `redirect_uri=${redirectUri}, scope=${scope}, ` +
      `cid=${correlationId})`
    );

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
