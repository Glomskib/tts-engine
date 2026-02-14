import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/tiktok-shop/disconnect
 * Disconnect the TikTok Shop integration for the current user.
 */
export async function POST(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from('tiktok_shop_connections')
    .update({
      status: 'disconnected',
      access_token: '',
      refresh_token: '',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'Failed to disconnect' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
