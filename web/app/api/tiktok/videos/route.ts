import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

/**
 * GET /api/tiktok/videos?range=30d
 *
 * Returns the authenticated user's synced TikTok videos with aggregated
 * totals. Supports `range` query param: 7d, 30d, 60d, 90d, all (default 30d).
 *
 * Response shape:
 * {
 *   ok: true,
 *   data: {
 *     totals: { views, likes, comments, shares, videos },
 *     videos: [ ... ],
 *     range_days: 30,
 *     last_sync: "2026-02-23T...",
 *   }
 * }
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get('range') || '30d';

  // Parse range
  const RANGE_MAP: Record<string, number | null> = {
    '7d': 7,
    '30d': 30,
    '60d': 60,
    '90d': 90,
    'all': null,
  };
  const rangeDays = RANGE_MAP[rangeParam] ?? 30;

  // Build query
  let query = supabaseAdmin
    .from('tiktok_videos')
    .select(
      'id, tiktok_video_id, title, description, create_time, cover_image_url, share_url, duration, view_count, like_count, comment_count, share_count, last_synced_at',
    )
    .eq('user_id', userId)
    .order('create_time', { ascending: false });

  if (rangeDays !== null) {
    const cutoff = Math.floor(Date.now() / 1000) - rangeDays * 86400;
    query = query.gte('create_time', cutoff);
  }

  const { data: videos, error } = await query;

  if (error) {
    console.error('[tiktok/videos] Query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = videos || [];

  // Aggregate totals
  const totals = {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    videos: rows.length,
  };
  for (const v of rows) {
    totals.views += Number(v.view_count) || 0;
    totals.likes += Number(v.like_count) || 0;
    totals.comments += Number(v.comment_count) || 0;
    totals.shares += Number(v.share_count) || 0;
  }

  // Last sync timestamp
  const { data: lastRun } = await supabaseAdmin
    .from('tiktok_sync_runs')
    .select('finished_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    ok: true,
    data: {
      totals,
      videos: rows,
      range_days: rangeDays,
      last_sync: lastRun?.finished_at || null,
    },
  });
}
