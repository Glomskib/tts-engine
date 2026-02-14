import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTikTokLoginClient, TikTokLoginClient } from '@/lib/tiktok-login';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * GET /api/tiktok/connect
 * Starts TikTok Login Kit OAuth flow.
 * Stores {user_id, state} in HTTP-only cookie, then redirects to TikTok.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.redirect(new URL('/login?redirect=/admin/settings/tiktok', url.origin));
  }

  const client = getTikTokLoginClient();
  if (!client.isConfigured()) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=tiktok_login_not_configured', url.origin)
    );
  }

  // Generate random state for CSRF protection
  const state = TikTokLoginClient.generateState();

  // Store user_id and state in HTTP-only cookie (needed at callback)
  const cookieStore = await cookies();
  const stateData = JSON.stringify({ user_id: authContext.user.id, state });
  cookieStore.set('tiktok_login_oauth', stateData, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const authUrl = client.getAuthorizationUrl(state);

  return NextResponse.redirect(authUrl);
}
