// Cron: Discord Role Sync
//
// Called by Vercel Cron every 6 hours.
// Iterates all ff_discord_links, gets each user's plan, and syncs roles.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncDiscordRolesForUser } from '@/lib/discord/roles';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all Discord links
    const { data: links, error } = await supabaseAdmin
      .from('ff_discord_links')
      .select('user_id, discord_user_id');

    if (error) {
      console.error('[cron/discord-role-sync] Failed to fetch links:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch links' }, { status: 500 });
    }

    if (!links || links.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, processedAt: new Date().toISOString() });
    }

    const shouldThrottle = links.length > 20;
    let synced = 0;
    let errors = 0;

    for (const link of links) {
      try {
        // Get user's current plan
        const { data: sub } = await supabaseAdmin
          .from('user_subscriptions')
          .select('plan_id, status')
          .eq('user_id', link.user_id)
          .single();

        const plan = sub?.plan_id || 'free';
        const isActive = sub?.status === 'active';

        await syncDiscordRolesForUser(link.discord_user_id, plan, isActive);

        // Update last_role_sync
        await supabaseAdmin
          .from('ff_discord_links')
          .update({ last_role_sync: new Date().toISOString() })
          .eq('user_id', link.user_id);

        synced++;

        // Rate limit safety for Discord API
        if (shouldThrottle) {
          await sleep(200);
        }
      } catch (err) {
        errors++;
        console.error(`[cron/discord-role-sync] Failed for user ${link.user_id}:`, err);
      }
    }

    console.info(`[cron/discord-role-sync] Synced: ${synced}, Errors: ${errors}`);

    return NextResponse.json({
      ok: true,
      synced,
      errors,
      total: links.length,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/discord-role-sync] Failed:', error);
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 });
  }
}
