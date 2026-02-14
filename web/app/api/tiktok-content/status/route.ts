import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getTikTokContentClient } from '@/lib/tiktok-content';

/**
 * GET /api/tiktok-content/status
 * Returns TikTok Content Posting connection status for all user's accounts.
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getTikTokContentClient();
  const appConfigured = client.isConfigured();

  // Get all tiktok accounts for this user with their content connections
  const { data: accounts, error: accountsErr } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id, name, handle, status')
    .eq('user_id', authContext.user.id)
    .eq('status', 'active');

  if (accountsErr) {
    return NextResponse.json({ ok: false, error: accountsErr.message }, { status: 500 });
  }

  // Get content connections for these accounts
  const accountIds = (accounts || []).map(a => a.id);
  let connections: Record<string, {
    status: string;
    display_name: string | null;
    privacy_level: string | null;
    token_expires_at: string | null;
    last_error: string | null;
  }> = {};

  if (accountIds.length > 0) {
    const { data: conns } = await supabaseAdmin
      .from('tiktok_content_connections')
      .select('account_id, status, display_name, privacy_level, token_expires_at, last_error')
      .in('account_id', accountIds);

    if (conns) {
      for (const conn of conns) {
        connections[conn.account_id] = {
          status: conn.status,
          display_name: conn.display_name,
          privacy_level: conn.privacy_level,
          token_expires_at: conn.token_expires_at,
          last_error: conn.last_error,
        };
      }
    }
  }

  const result = (accounts || []).map(account => ({
    account_id: account.id,
    account_name: account.name,
    account_handle: account.handle,
    content_connection: connections[account.id] || null,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      app_configured: appConfigured,
      accounts: result,
    },
  });
}
