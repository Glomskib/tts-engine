import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: link } = await supabaseAdmin
    .from('ff_discord_links')
    .select('discord_username, linked_at, last_role_sync')
    .eq('user_id', auth.user.id)
    .single();

  if (!link) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    discord: {
      username: link.discord_username,
      linked_at: link.linked_at,
      last_role_sync: link.last_role_sync,
    },
  });
}
