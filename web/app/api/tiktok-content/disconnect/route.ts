import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * POST /api/tiktok-content/disconnect
 * Disconnects a TikTok Content Posting connection for a specific account.
 * Requires { account_id } in body. Verifies ownership via tiktok_accounts.user_id.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { account_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountId = body.account_id;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id is required' }, { status: 400 });
  }

  // Verify the account belongs to this user
  const { data: account, error: accountErr } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', authContext.user.id)
    .single();

  if (accountErr || !account) {
    return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('tiktok_content_connections')
    .update({
      status: 'disconnected',
      access_token: '',
      refresh_token: '',
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
