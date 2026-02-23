import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * POST /api/tiktok/delete-data
 * Deletes all TikTok PII for the current user across all 3 connection tables.
 * Clears tokens, nulls display names / avatars, sets status to disconnected.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;
  const now = new Date().toISOString();
  const errors: string[] = [];

  // 1. Clear tiktok_login_connections
  const { error: loginErr } = await supabaseAdmin
    .from('tiktok_login_connections')
    .update({
      status: 'disconnected',
      access_token: '',
      refresh_token: '',
      display_name: null,
      avatar_url: null,
      updated_at: now,
    })
    .eq('user_id', userId);

  if (loginErr) errors.push(`login: ${loginErr.message}`);

  // 2. Clear tiktok_shop_connections
  const { error: shopErr } = await supabaseAdmin
    .from('tiktok_shop_connections')
    .update({
      status: 'disconnected',
      access_token: '',
      refresh_token: '',
      seller_name: null,
      shop_name: null,
      updated_at: now,
    })
    .eq('user_id', userId);

  if (shopErr) errors.push(`shop: ${shopErr.message}`);

  // 3. Clear tiktok_content_connections (via tiktok_accounts join)
  const { data: accounts } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id')
    .eq('user_id', userId);

  const accountIds = (accounts || []).map(a => a.id);

  if (accountIds.length > 0) {
    const { error: contentErr } = await supabaseAdmin
      .from('tiktok_content_connections')
      .update({
        status: 'disconnected',
        access_token: '',
        refresh_token: '',
        display_name: null,
        updated_at: now,
      })
      .in('account_id', accountIds);

    if (contentErr) errors.push(`content: ${contentErr.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Partial failure',
      details: errors,
      deleted_at: now,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted_at: now });
}
