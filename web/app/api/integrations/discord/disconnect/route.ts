import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncDiscordRolesForUser } from '@/lib/discord/roles';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function DELETE(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get current link to know the Discord user ID for role removal
  const { data: link } = await supabaseAdmin
    .from('ff_discord_links')
    .select('discord_user_id')
    .eq('user_id', auth.user.id)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'No Discord account linked' }, { status: 404 });
  }

  // Remove roles (sync as free/inactive)
  try {
    await syncDiscordRolesForUser(link.discord_user_id, 'free', false);
  } catch (err) {
    console.error('[discord/disconnect] Role removal failed:', err);
  }

  // Delete the link
  const { error } = await supabaseAdmin
    .from('ff_discord_links')
    .delete()
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[discord/disconnect] Failed to delete link:', error);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
