import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

/**
 * POST /api/tiktok/disconnect
 * Disconnects the user's TikTok Login Kit connection.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error: dbError } = await supabaseAdmin
    .from('tiktok_login_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('user_id', authContext.user.id)
    .eq('status', 'active');

  if (dbError) {
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
