import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTikTokLoginClient } from '@/lib/tiktok-login';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * GET /api/tiktok/callback?code=XXX&state=YYY
 * OAuth2 callback for TikTok Login Kit.
 * Validates state, exchanges code for tokens, fetches user info, upserts to DB.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/settings/tiktok?error=${encodeURIComponent(error)}`, url.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=missing_code', url.origin)
    );
  }

  // Verify user session
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.redirect(
      new URL('/login?redirect=/admin/settings/tiktok', url.origin)
    );
  }

  // Retrieve state from cookie
  const cookieStore = await cookies();
  const oauthCookie = cookieStore.get('tiktok_login_oauth');
  if (!oauthCookie?.value) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=missing_oauth_state', url.origin)
    );
  }

  let storedUserId: string;
  let storedState: string;
  try {
    const parsed = JSON.parse(oauthCookie.value);
    storedUserId = parsed.user_id;
    storedState = parsed.state;
  } catch {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=invalid_oauth_state', url.origin)
    );
  }

  // Validate state matches (CSRF protection)
  if (state !== storedState) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=state_mismatch', url.origin)
    );
  }

  // Validate user matches the one who started the flow
  if (authContext.user.id !== storedUserId) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=user_mismatch', url.origin)
    );
  }

  // Clear the OAuth cookie
  cookieStore.delete('tiktok_login_oauth');

  const client = getTikTokLoginClient();

  try {
    // 1. Exchange code for tokens
    const tokenData = await client.exchangeCodeForTokens(code);

    // 2. Fetch user info
    let userInfo = null;
    try {
      userInfo = await client.getUserInfo(tokenData.access_token);
    } catch (infoErr) {
      console.warn('Could not fetch Login Kit user info (non-fatal):', infoErr);
    }

    // 3. Store connection in database
    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshExpiresAt = new Date(
      Date.now() + tokenData.refresh_expires_in * 1000
    ).toISOString();

    const connectionData = {
      user_id: authContext.user.id,
      open_id: tokenData.open_id,
      union_id: userInfo?.union_id || null,
      display_name: userInfo?.display_name || null,
      avatar_url: userInfo?.avatar_url || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: tokenExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      scope: tokenData.scope || 'user.info.basic',
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    // Upsert (one Login Kit connection per user)
    const { error: dbError } = await supabaseAdmin
      .from('tiktok_login_connections')
      .upsert(connectionData, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Failed to store TikTok Login connection:', dbError);
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?error=db_error', url.origin)
      );
    }

    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?login_connected=true', url.origin)
    );
  } catch (err) {
    console.error('TikTok Login Kit OAuth error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(
        `/admin/settings/tiktok?error=${encodeURIComponent(message)}`,
        url.origin
      )
    );
  }
}
