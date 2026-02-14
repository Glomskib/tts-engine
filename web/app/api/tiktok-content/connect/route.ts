import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTikTokContentClient, generateCodeVerifier, generateCodeChallenge } from '@/lib/tiktok-content';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * GET /api/tiktok-content/connect?account_id=UUID
 * Starts TikTok Content Posting OAuth flow with PKCE.
 * Stores code_verifier + account_id in HTTP-only cookie, then redirects to TikTok.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('account_id');

  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.redirect(new URL('/login?redirect=/admin/settings/tiktok', url.origin));
  }

  const client = getTikTokContentClient();
  if (!client.isConfigured()) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=tiktok_content_not_configured', url.origin)
    );
  }

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store code_verifier and account_id in HTTP-only cookie (needed at callback)
  const cookieStore = await cookies();
  const stateData = JSON.stringify({ code_verifier: codeVerifier, account_id: accountId });
  cookieStore.set('tiktok_content_oauth', stateData, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const redirectUri = `${url.origin}/api/tiktok-content/callback`;
  const authUrl = client.getAuthorizationUrl(redirectUri, codeChallenge, accountId);

  return NextResponse.redirect(authUrl);
}
