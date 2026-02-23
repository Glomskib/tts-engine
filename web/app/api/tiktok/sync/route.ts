import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getTikTokContentClient } from '@/lib/tiktok-content';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/tiktok/sync
 *
 * User-initiated sync: fetches recent TikTok videos for the authenticated
 * user and upserts metrics into tiktok_videos. Writes an audit row to
 * tiktok_sync_runs.
 *
 * Looks for tokens in two places (mirrors existing cron pattern):
 *   1. tiktok_content_connections (PKCE OAuth — has video.list scope)
 *   2. tiktok_accounts with direct access_token (legacy)
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;
  const client = getTikTokContentClient();

  // ---- Create sync run (running) ----
  const { data: syncRun, error: insertErr } = await supabaseAdmin
    .from('tiktok_sync_runs')
    .insert({ user_id: userId, status: 'running' })
    .select('id')
    .single();

  if (insertErr || !syncRun) {
    console.error('[tiktok/sync] Failed to create sync run:', insertErr);
    return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
  }

  const syncRunId = syncRun.id;

  try {
    // ---- Resolve access token ----
    const accessToken = await resolveAccessToken(userId, client);
    if (!accessToken) {
      await finishSyncRun(syncRunId, 'failed', 'No active TikTok connection with video.list scope', 0);
      return NextResponse.json(
        { error: 'No active TikTok connection. Connect your account first.' },
        { status: 400 },
      );
    }

    // ---- Fetch videos (last ~60 days, capped at 200) ----
    const videos = await client.fetchAllUserVideos(accessToken, 200);
    const sixtyDaysAgo = Math.floor(Date.now() / 1000) - 60 * 86400;
    const recentVideos = videos.filter((v) => v.create_time >= sixtyDaysAgo);

    console.log(`[tiktok/sync] user=${userId} fetched=${videos.length} recent=${recentVideos.length}`);

    // ---- Upsert into tiktok_videos ----
    let upserted = 0;
    const errors: string[] = [];

    for (const video of recentVideos) {
      const { error: upsertErr } = await supabaseAdmin
        .from('tiktok_videos')
        .upsert(
          {
            user_id: userId,
            tiktok_video_id: video.id,
            title: video.title || null,
            description: video.video_description || null,
            create_time: video.create_time,
            cover_image_url: video.cover_image_url || null,
            share_url: video.share_url || null,
            duration: video.duration || null,
            view_count: video.view_count || 0,
            like_count: video.like_count || 0,
            comment_count: video.comment_count || 0,
            share_count: video.share_count || 0,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,tiktok_video_id', ignoreDuplicates: false },
        );

      if (upsertErr) {
        errors.push(`${video.id}: ${upsertErr.message}`);
        continue;
      }
      upserted++;
    }

    // ---- Complete sync run ----
    await finishSyncRun(syncRunId, 'completed', errors.length > 0 ? errors.join('; ') : null, upserted);

    return NextResponse.json({
      ok: true,
      sync_run_id: syncRunId,
      videos_fetched: recentVideos.length,
      videos_upserted: upserted,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tiktok/sync] Fatal error:', msg);
    await finishSyncRun(syncRunId, 'failed', msg, 0);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to get a valid access token for the user.
 * Checks tiktok_content_connections first, then tiktok_accounts.
 * Refreshes expired tokens automatically.
 */
async function resolveAccessToken(
  userId: string,
  client: ReturnType<typeof getTikTokContentClient>,
): Promise<string | null> {
  // Path 1: content connection via tiktok_accounts → tiktok_content_connections
  const { data: accounts } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (accounts && accounts.length > 0) {
    const accountIds = accounts.map((a) => a.id);
    const { data: conn } = await supabaseAdmin
      .from('tiktok_content_connections')
      .select('id, account_id, access_token, refresh_token, token_expires_at')
      .in('account_id', accountIds)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (conn) {
      return ensureFresh(conn, 'tiktok_content_connections', client);
    }
  }

  // Path 2: legacy — token stored directly on tiktok_accounts
  const { data: legacyAccount } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .not('access_token', 'is', null)
    .limit(1)
    .single();

  if (legacyAccount) {
    return ensureFresh(legacyAccount, 'tiktok_accounts', client);
  }

  return null;
}

async function ensureFresh(
  row: { id: string; access_token: string; refresh_token: string; token_expires_at: string | null },
  table: 'tiktok_content_connections' | 'tiktok_accounts',
  client: ReturnType<typeof getTikTokContentClient>,
): Promise<string> {
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const isExpired = Date.now() > expiresAt - 60_000;

  if (!isExpired) return row.access_token;

  const refreshed = await client.refreshToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabaseAdmin
    .from(table)
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: newExpiresAt,
      ...(table === 'tiktok_content_connections'
        ? {
            refresh_token_expires_at: new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString(),
            status: 'active' as const,
            last_error: null,
            updated_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq('id', row.id);

  return refreshed.access_token;
}

async function finishSyncRun(
  id: string,
  status: 'completed' | 'failed',
  error: string | null,
  videosUpserted: number,
) {
  await supabaseAdmin
    .from('tiktok_sync_runs')
    .update({
      status,
      error,
      videos_upserted: videosUpserted,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
}
