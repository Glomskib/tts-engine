import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTikTokShopClient } from '@/lib/tiktok-shop';

/**
 * GET /api/tiktok-shop/status
 * Returns the TikTok Shop connection status for the current user.
 */
export async function GET(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokShopClient();

  // Check if app credentials are configured
  const appConfigured = client.isConfigured();

  // Check if user has a stored connection
  const { data: connection } = await supabaseAdmin
    .from('tiktok_shop_connections')
    .select('*')
    .eq('user_id', auth.userId)
    .single();

  const connected = !!connection && connection.status === 'active';
  const tokenExpired = connection?.token_expires_at
    ? new Date(connection.token_expires_at) < new Date()
    : false;

  return NextResponse.json({
    ok: true,
    data: {
      app_configured: appConfigured,
      connected,
      token_expired: tokenExpired,
      shop_name: connection?.shop_name || null,
      shop_id: connection?.shop_id || null,
      seller_name: connection?.seller_name || null,
      seller_region: connection?.seller_base_region || null,
      status: connection?.status || 'disconnected',
      last_synced_at: connection?.last_synced_at || null,
      last_error: connection?.last_error || null,
      // Build the authorization URL if app is configured but not connected
      authorize_url: appConfigured && !connected
        ? client.getAuthorizationUrl(
            `${new URL(request.url).origin}/api/tiktok-shop/callback`
          )
        : null,
    },
  });
}
