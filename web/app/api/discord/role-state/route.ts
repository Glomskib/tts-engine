import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.BOT_SHARED_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discord_user_id');

  if (!discordUserId) {
    return NextResponse.json(
      { error: 'Missing discord_user_id query parameter' },
      { status: 400 }
    );
  }

  const { data: link } = await supabaseAdmin
    .from('ff_discord_links')
    .select('user_id')
    .eq('discord_user_id', discordUserId)
    .single();

  if (!link) {
    return NextResponse.json(
      { error: 'No linked FlashFlow account' },
      { status: 404 }
    );
  }

  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status')
    .eq('user_id', link.user_id)
    .single();

  return NextResponse.json({
    user_id: link.user_id,
    plan: sub?.plan_id || 'free',
    is_active: sub?.status === 'active',
  });
}
