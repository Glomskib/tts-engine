import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getTikTokLoginClient } from '@/lib/tiktok-login';

/**
 * GET /api/tiktok/status
 * Returns TikTok Login Kit connection status for the current user.
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokLoginClient();
  const appConfigured = client.isConfigured();

  const { data: connection, error: dbError } = await supabaseAdmin
    .from('tiktok_login_connections')
    .select('open_id, union_id, display_name, avatar_url, token_expires_at, status, last_error, scope')
    .eq('user_id', authContext.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      app_configured: appConfigured,
      connected: !!connection,
      connection: connection
        ? {
            open_id: connection.open_id,
            display_name: connection.display_name,
            avatar_url: connection.avatar_url,
            token_expires_at: connection.token_expires_at,
            status: connection.status,
            last_error: connection.last_error,
          }
        : null,
    },
  });
}
