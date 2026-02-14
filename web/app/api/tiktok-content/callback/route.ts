import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTikTokContentClient } from '@/lib/tiktok-content';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * GET /api/tiktok-content/callback?code=XXX&state=YYY
 * OAuth2 callback for TikTok Content Posting API.
 * Exchanges code for tokens using PKCE code_verifier from cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
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

  // Retrieve PKCE state from cookie
  const cookieStore = await cookies();
  const oauthCookie = cookieStore.get('tiktok_content_oauth');
  if (!oauthCookie?.value) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=missing_oauth_state', url.origin)
    );
  }

  let codeVerifier: string;
  let accountId: string;
  try {
    const parsed = JSON.parse(oauthCookie.value);
    codeVerifier = parsed.code_verifier;
    accountId = parsed.account_id;
  } catch {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=invalid_oauth_state', url.origin)
    );
  }

  // Clear the OAuth cookie
  cookieStore.delete('tiktok_content_oauth');

  const client = getTikTokContentClient();
  const redirectUri = `${url.origin}/api/tiktok-content/callback`;

  try {
    // 1. Exchange code for tokens
    const tokenData = await client.exchangeCodeForTokens(code, redirectUri, codeVerifier);

    // 2. Query creator info (allowed privacy levels, etc.)
    let creatorInfo = null;
    let displayName = '';
    try {
      creatorInfo = await client.queryCreatorInfo(tokenData.access_token);
      displayName = creatorInfo.creator_nickname || creatorInfo.creator_username || '';
    } catch (infoErr) {
      console.warn('Could not fetch creator info (non-fatal):', infoErr);
    }

    // 3. Store connection in database
    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshExpiresAt = new Date(
      Date.now() + tokenData.refresh_expires_in * 1000
    ).toISOString();

    const connectionData = {
      account_id: accountId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: tokenExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      open_id: tokenData.open_id,
      display_name: displayName,
      creator_info: creatorInfo,
      privacy_level: creatorInfo?.privacy_level_options?.includes('PUBLIC_TO_EVERYONE')
        ? 'PUBLIC_TO_EVERYONE'
        : 'SELF_ONLY',
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    // Upsert (one content connection per account)
    const { error: dbError } = await supabaseAdmin
      .from('tiktok_content_connections')
      .upsert(connectionData, { onConflict: 'account_id' });

    if (dbError) {
      console.error('Failed to store TikTok Content connection:', dbError);
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?error=db_error', url.origin)
      );
    }

    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?content_connected=true', url.origin)
    );
  } catch (err) {
    console.error('TikTok Content OAuth error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(
        `/admin/settings/tiktok?error=${encodeURIComponent(message)}`,
        url.origin
      )
    );
  }
}
