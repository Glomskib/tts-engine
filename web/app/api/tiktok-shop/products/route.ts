import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokShopClient } from '@/lib/tiktok-shop';

/**
 * Helper: get a valid access token, refreshing if expired.
 */
async function getValidConnection(userId: string) {
  const { data: conn } = await supabaseAdmin
    .from('tiktok_shop_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!conn) return null;

  // Check if token is expired and refresh if needed
  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt < new Date()) {
    const client = getTikTokShopClient();
    try {
      const refreshed = await client.refreshAccessToken(conn.refresh_token);

      const newExpiry = new Date(
        Date.now() + refreshed.access_token_expire_in * 1000
      ).toISOString();

      await supabaseAdmin
        .from('tiktok_shop_connections')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return {
        ...conn,
        access_token: refreshed.access_token,
      };
    } catch (err) {
      // Mark connection as expired
      await supabaseAdmin
        .from('tiktok_shop_connections')
        .update({
          status: 'expired',
          last_error: err instanceof Error ? err.message : 'Token refresh failed',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return null;
    }
  }

  return conn;
}

/**
 * GET /api/tiktok-shop/products
 * Fetch products from the connected TikTok Shop.
 * Query params: page_size, page_token, status
 */
export async function GET(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const conn = await getValidConnection(auth.userId);
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: 'TikTok Shop not connected or token expired' },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const pageSize = parseInt(url.searchParams.get('page_size') || '20');
  const pageToken = url.searchParams.get('page_token') || undefined;
  const status = url.searchParams.get('status') || undefined;

  const client = getTikTokShopClient();

  try {
    const result = await client.searchProducts(
      conn.access_token,
      conn.shop_cipher,
      { page_size: pageSize, page_token: pageToken, status }
    );

    // Update last synced timestamp
    await supabaseAdmin
      .from('tiktok_shop_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', auth.userId);

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch products';

    // Store the error
    await supabaseAdmin
      .from('tiktok_shop_connections')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('user_id', auth.userId);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
