import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/posting-queue — unified posting queue with scheduled + ready-to-post videos
 * ?days=7 — look ahead window
 * ?account_id=<uuid> — filter by account
 * ?status=all|scheduled|ready|posted — filter
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const params = request.nextUrl.searchParams;
    const daysAhead = parseInt(params.get('days') || '7', 10);
    const accountFilter = params.get('account_id');
    const statusFilter = params.get('status') || 'all';

    const now = new Date();
    const lookAhead = new Date();
    lookAhead.setDate(lookAhead.getDate() + daysAhead);

    // 1. Fetch videos ready to post (not yet scheduled)
    let readyQuery = supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, recording_status, created_at, last_status_changed_at,
        posted_url, posted_platform, posted_at_local,
        posting_account_id, product_id, account_id,
        product:product_id(id, name, brand),
        account:account_id(id, name, handle)
      `)
      .in('recording_status', ['READY_TO_POST']);

    if (accountFilter) {
      readyQuery = readyQuery.eq('account_id', accountFilter);
    }

    // 2. Fetch scheduled posts
    let scheduledQuery = supabaseAdmin
      .from('scheduled_posts')
      .select('*')
      .gte('scheduled_for', now.toISOString())
      .lte('scheduled_for', lookAhead.toISOString())
      .in('status', ['scheduled'])
      .order('scheduled_for', { ascending: true });

    // 3. Fetch recently posted (last 3 days)
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 3);
    let postedQuery = supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, recording_status, created_at, last_status_changed_at,
        posted_url, posted_platform, posted_at_local,
        posting_account_id, product_id, account_id,
        product:product_id(id, name, brand),
        account:account_id(id, name, handle)
      `)
      .eq('recording_status', 'POSTED')
      .gte('last_status_changed_at', recentCutoff.toISOString())
      .order('last_status_changed_at', { ascending: false })
      .limit(20);

    if (accountFilter) {
      postedQuery = postedQuery.eq('account_id', accountFilter);
    }

    // 4. Fetch posting accounts
    const accountsQuery = supabaseAdmin
      .from('posting_accounts')
      .select('id, display_name, account_code, platform, is_active')
      .eq('is_active', true)
      .order('display_name');

    // Execute all in parallel
    const [readyRes, scheduledRes, postedRes, accountsRes] = await Promise.all([
      readyQuery,
      scheduledQuery,
      postedQuery,
      accountsQuery,
    ]);

    if (readyRes.error) {
      console.error(`[${correlationId}] Ready videos fetch error:`, readyRes.error);
    }
    if (scheduledRes.error) {
      console.error(`[${correlationId}] Scheduled posts fetch error:`, scheduledRes.error);
    }

    const readyVideos = (readyRes.data || []) as any[];
    const scheduledPosts = (scheduledRes.data || []) as any[];
    const recentlyPosted = (postedRes.data || []) as any[];
    const accounts = (accountsRes.data || []) as any[];

    // Build optimal posting times based on historical performance
    const { data: performanceData } = await supabaseAdmin
      .from('videos')
      .select('posted_at_local, tiktok_views, tiktok_likes, tiktok_engagement_rate')
      .eq('recording_status', 'POSTED')
      .not('posted_at_local', 'is', null)
      .not('tiktok_views', 'is', null)
      .gt('tiktok_views', 0)
      .limit(200);

    // Compute optimal times by hour bucket
    const hourBuckets: Record<number, { count: number; totalViews: number; totalEngagement: number }> = {};
    for (const v of (performanceData || []) as any[]) {
      const timeStr = v.posted_at_local || '';
      // Try to extract hour from various formats
      const hourMatch = timeStr.match(/(\d{1,2})[:.]?\d{0,2}\s*(AM|PM|am|pm)?/);
      if (hourMatch) {
        let hour = parseInt(hourMatch[1]);
        const ampm = (hourMatch[2] || '').toLowerCase();
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        if (hour >= 0 && hour < 24) {
          if (!hourBuckets[hour]) hourBuckets[hour] = { count: 0, totalViews: 0, totalEngagement: 0 };
          hourBuckets[hour].count++;
          hourBuckets[hour].totalViews += v.tiktok_views || 0;
          hourBuckets[hour].totalEngagement += v.tiktok_engagement_rate || 0;
        }
      }
    }

    const optimalTimes = Object.entries(hourBuckets)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        label: formatHour(parseInt(hour)),
        avg_views: Math.round(data.totalViews / data.count),
        avg_engagement: Math.round((data.totalEngagement / data.count) * 100) / 100,
        sample_size: data.count,
      }))
      .filter(t => t.sample_size >= 2)
      .sort((a, b) => b.avg_views - a.avg_views)
      .slice(0, 5);

    // Detect scheduling conflicts (same account, same day)
    const accountDayCounts: Record<string, number> = {};
    for (const v of readyVideos) {
      const key = `${v.account_id || 'none'}`;
      accountDayCounts[key] = (accountDayCounts[key] || 0) + 1;
    }
    for (const sp of scheduledPosts) {
      const day = (sp.scheduled_for || '').slice(0, 10);
      const acctId = sp.metadata?.account_id || 'none';
      const key = `${acctId}_${day}`;
      accountDayCounts[key] = (accountDayCounts[key] || 0) + 1;
    }

    const conflicts = Object.entries(accountDayCounts)
      .filter(([, count]) => count > 2)
      .map(([key, count]) => ({ key, count, warning: `${count} posts for same account — may reduce reach` }));

    // Build queue items
    const queueItems = readyVideos.map((v: any) => ({
      id: v.id,
      type: 'ready' as const,
      video_code: v.video_code,
      product_name: v.product?.name || 'Unknown',
      product_brand: v.product?.brand || '',
      account_name: v.account?.name || 'Unassigned',
      account_handle: v.account?.handle || '',
      account_id: v.account_id,
      status: 'ready_to_post',
      ready_since: v.last_status_changed_at || v.created_at,
      scheduled_for: null,
    }));

    const scheduledItems = scheduledPosts.map((sp: any) => ({
      id: sp.id,
      type: 'scheduled' as const,
      video_code: sp.metadata?.video_code || null,
      product_name: sp.title,
      product_brand: '',
      account_name: '',
      account_handle: '',
      account_id: sp.metadata?.account_id || null,
      status: sp.status,
      ready_since: sp.created_at,
      scheduled_for: sp.scheduled_for,
    }));

    const postedItems = recentlyPosted.map((v: any) => ({
      id: v.id,
      type: 'posted' as const,
      video_code: v.video_code,
      product_name: v.product?.name || 'Unknown',
      product_brand: v.product?.brand || '',
      account_name: v.account?.name || '',
      account_handle: v.account?.handle || '',
      account_id: v.account_id,
      status: 'posted',
      posted_at: v.last_status_changed_at,
      posted_url: v.posted_url,
      posted_platform: v.posted_platform,
    }));

    // Filter by status
    let items: any[] = [];
    if (statusFilter === 'all' || statusFilter === 'ready') items.push(...queueItems);
    if (statusFilter === 'all' || statusFilter === 'scheduled') items.push(...scheduledItems);
    if (statusFilter === 'all' || statusFilter === 'posted') items.push(...postedItems);

    return NextResponse.json({
      ok: true,
      data: {
        queue: items,
        summary: {
          ready_count: readyVideos.length,
          scheduled_count: scheduledPosts.length,
          recently_posted_count: recentlyPosted.length,
        },
        accounts,
        optimal_times: optimalTimes,
        conflicts,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Posting queue error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}
