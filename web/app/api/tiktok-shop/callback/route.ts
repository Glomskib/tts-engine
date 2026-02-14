import { NextResponse } from 'next/server';
import { getTikTokShopClient } from '@/lib/tiktok-shop';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * GET /api/tiktok-shop/callback?code=XXX
 * OAuth2 callback handler. TikTok redirects here after the user authorizes.
 * Exchanges the code for tokens, fetches shop info, and stores everything.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?error=missing_code', url.origin)
    );
  }

  // Get the current user from session
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.redirect(
      new URL('/login?redirect=/admin/settings/tiktok', url.origin)
    );
  }

  const userId = authContext.user.id;
  const client = getTikTokShopClient();

  try {
    // 1. Exchange authorization code for tokens
    const tokenData = await client.getAccessToken(code);

    // 2. Get authorized shops
    let shopId = '';
    let shopName = '';
    let shopCipher = '';

    try {
      const shops = await client.getAuthorizedShops(tokenData.access_token);
      if (shops.length > 0) {
        shopId = shops[0].id;
        shopName = shops[0].name;
        shopCipher = shops[0].cipher;
      }
    } catch (shopErr) {
      console.warn('Could not fetch shops (non-fatal):', shopErr);
    }

    // 3. Store connection in database
    const tokenExpiresAt = new Date(
      Date.now() + tokenData.access_token_expire_in * 1000
    ).toISOString();

    const refreshExpiresAt = new Date(
      Date.now() + tokenData.refresh_token_expire_in * 1000
    ).toISOString();

    const connectionData = {
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: tokenExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      open_id: tokenData.open_id,
      seller_name: tokenData.seller_name,
      seller_base_region: tokenData.seller_base_region,
      shop_id: shopId,
      shop_name: shopName,
      shop_cipher: shopCipher,
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    // Upsert (one connection per user)
    const { error: dbError } = await supabaseAdmin
      .from('tiktok_shop_connections')
      .upsert(connectionData, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Failed to store TikTok Shop connection:', dbError);
      return NextResponse.redirect(
        new URL('/admin/settings/tiktok?error=db_error', url.origin)
      );
    }

    // 4. Redirect to settings page with success
    return NextResponse.redirect(
      new URL('/admin/settings/tiktok?connected=true', url.origin)
    );
  } catch (err) {
    console.error('TikTok Shop OAuth error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(
        `/admin/settings/tiktok?error=${encodeURIComponent(message)}`,
        url.origin
      )
    );
  }
}
