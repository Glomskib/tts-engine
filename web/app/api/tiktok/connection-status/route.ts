import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getTikTokPartnerClient } from '@/lib/tiktok-partner';

/**
 * GET /api/tiktok/connection-status
 * Returns TikTok Partner API connection status for the current user.
 * Never returns tokens in the response.
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokPartnerClient();
  const appConfigured = client.isConfigured();

  const { data: connection, error: dbError } = await supabaseAdmin
    .from('tiktok_connections')
    .select('tiktok_open_id, scopes, expires_at, status, last_error')
    .eq('user_id', authContext.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
  }

  const tokenExpired = connection?.expires_at
    ? new Date(connection.expires_at) < new Date()
    : false;

  return NextResponse.json({
    ok: true,
    data: {
      app_configured: appConfigured,
      connected: !!connection,
      token_expired: tokenExpired,
      connection: connection
        ? {
            tiktok_open_id: connection.tiktok_open_id,
            scopes: connection.scopes,
            expires_at: connection.expires_at,
            status: connection.status,
          }
        : null,
    },
  });
}
