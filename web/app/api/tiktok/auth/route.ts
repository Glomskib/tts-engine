import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const clientKey = process.env.TIKTOK_PARTNER_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    if (!clientKey || !redirectUri) {
      return createApiErrorResponse(
        'INTERNAL',
        'TikTok OAuth not configured. Coming soon!',
        503,
        correlationId
      );
    }

    // Generate random state for CSRF protection
    const state = randomBytes(16).toString('hex');

    // Build TikTok OAuth URL
    const scope = 'user.info.basic,video.list';
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    // Store state in cookie for verification in callback
    const response = NextResponse.redirect(authUrl.toString());
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
