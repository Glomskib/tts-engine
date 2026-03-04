import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * GET /api/admin/dashboard — aggregated dashboard data
 * Returns activity feed, performance snapshot, personal queue, and role-specific data.
 * Scoped by user unless admin.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const userId = authContext.user.id;
    const isAdmin = authContext.isAdmin;
    const db = supabaseAdmin;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgoISO = weekAgo.toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // --- Run queries in parallel for speed ---

    // 1. Activity feed — recent video events (last 10)
    const activityPromise = (async () => {
      // video_events is the primary audit trail
      let query = db
        .from('video_events')
        .select('id, video_id, event_type, from_status, to_status, actor, details, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      // Non-admin: scope to user's videos via client_user_id
      if (!isAdmin) {
        const { data: userVideos } = await db
          .from('videos')
          .select('id')
          .eq('client_user_id', userId)
          .limit(100);
        const videoIds = (userVideos || []).map(v => v.id);
        if (videoIds.length > 0) {
          query = query.in('video_id', videoIds);
        } else {
          return [];
        }
      }

      const { data } = await query;
      return data || [];
    })();

    // 2. User activity feed (script events etc)
    const userActivityPromise = db
      .from('user_activity')
      .select('id, action, entity_type, entity_id, entity_name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(r => r.data || []);

    // 3. Performance — posts this week
    const postsThisWeekPromise = (async () => {
      let query = db
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('recording_status', 'POSTED')
        .gte('posted_at_local', weekAgoISO);
      if (!isAdmin) query = query.eq('client_user_id', userId);
      const { count } = await query;
      return count || 0;
    })();

    // 4. Performance — views this week (sum from video_metrics)
    const viewsThisWeekPromise = (async () => {
      let query = db
        .from('video_metrics')
        .select('views')
        .gte('metric_date', weekAgo.toISOString().slice(0, 10));
      if (!isAdmin) query = query.eq('account_id', userId);
      const { data } = await query;
      return (data || []).reduce((sum, r) => sum + (r.views || 0), 0);
    })();

    // 5. Top video (by views, last 30 days)
    const topVideoPromise = (async () => {
      let query = db
        .from('videos')
        .select('id, video_code, views_total, posted_url, product_id')
        .order('views_total', { ascending: false })
        .not('views_total', 'is', null)
        .gt('views_total', 0)
        .limit(1);
      if (!isAdmin) query = query.eq('client_user_id', userId);
      const { data } = await query;
      return data?.[0] || null;
    })();

    // 6. Upcoming posts (scheduled or ready to post)
    const upcomingPostsPromise = (async () => {
      let query = db
        .from('videos')
        .select('id, video_code, recording_status, last_status_changed_at, product_id')
        .in('recording_status', ['READY_TO_POST'])
        .order('last_status_changed_at', { ascending: false })
        .limit(5);
      if (!isAdmin) query = query.eq('client_user_id', userId);
      const { data: readyVideos } = await query;

      // Also get scheduled posts
      const scheduledQuery = db
        .from('scheduled_posts')
        .select('id, title, scheduled_for, platform, status')
        .eq('status', 'scheduled')
        .gte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(5);
      const { data: scheduled } = await scheduledQuery;

      return {
        readyToPost: readyVideos || [],
        scheduled: scheduled || [],
      };
    })();

    // 7. Personal queue — videos needing action
    const personalQueuePromise = (async () => {
      // Videos needing review/approval (READY_FOR_REVIEW status)
      let needsApprovalQuery = db
        .from('videos')
        .select('id, video_code, recording_status, created_at, product_id')
        .eq('recording_status', 'READY_FOR_REVIEW')
        .order('created_at', { ascending: true })
        .limit(10);
      if (!isAdmin) needsApprovalQuery = needsApprovalQuery.eq('client_user_id', userId);

      // Videos needing edits
      let needsEditsQuery = db
        .from('videos')
        .select('id, video_code, recording_status, created_at, product_id, edit_notes')
        .eq('recording_status', 'APPROVED_NEEDS_EDITS')
        .order('created_at', { ascending: true })
        .limit(10);
      if (!isAdmin) needsEditsQuery = needsEditsQuery.eq('client_user_id', userId);

      // Overdue — videos stuck in NEEDS_SCRIPT or NOT_RECORDED for >3 days
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
      let overdueQuery = db
        .from('videos')
        .select('id, video_code, recording_status, created_at, product_id')
        .in('recording_status', ['NEEDS_SCRIPT', 'NOT_RECORDED'])
        .lt('created_at', threeDaysAgo)
        .order('created_at', { ascending: true })
        .limit(10);
      if (!isAdmin) overdueQuery = overdueQuery.eq('client_user_id', userId);

      const [needsApproval, needsEdits, overdue] = await Promise.all([
        needsApprovalQuery.then(r => r.data || []),
        needsEditsQuery.then(r => r.data || []),
        overdueQuery.then(r => r.data || []),
      ]);

      return { needsApproval, needsEdits, overdue };
    })();

    // 8. Admin-specific: pipeline status counts
    const pipelineStatusPromise = isAdmin
      ? (async () => {
          const { data } = await db
            .from('videos')
            .select('recording_status');
          const counts: Record<string, number> = {};
          for (const v of data || []) {
            const s = v.recording_status || 'unknown';
            counts[s] = (counts[s] || 0) + 1;
          }
          return counts;
        })()
      : Promise.resolve(null);

    // 9. Admin-specific: videos stuck >24h
    const stuckVideosPromise = isAdmin
      ? (async () => {
          const { data, count } = await db
            .from('videos')
            .select('id, video_code, recording_status, last_status_changed_at, product_id', { count: 'exact' })
            .in('recording_status', ['GENERATING_SCRIPT', 'AI_RENDERING', 'EDITING'])
            .lt('last_status_changed_at', dayAgo.toISOString())
            .order('last_status_changed_at', { ascending: true })
            .limit(10);
          return { items: data || [], total: count || 0 };
        })()
      : Promise.resolve(null);

    // 10. Admin-specific: recent failures
    const failuresPromise = isAdmin
      ? (async () => {
          const { data, count } = await db
            .from('video_events')
            .select('id, video_id, event_type, details, created_at', { count: 'exact' })
            .eq('event_type', 'error')
            .gte('created_at', weekAgoISO)
            .order('created_at', { ascending: false })
            .limit(10);
          return { items: data || [], total: count || 0 };
        })()
      : Promise.resolve(null);

    // 11. Scripts count (for team/creator)
    const scriptsCountPromise = db
      .from('saved_skits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(r => r.count || 0);

    // Await all in parallel
    const [
      activityFeed,
      userActivity,
      postsThisWeek,
      viewsThisWeek,
      topVideo,
      upcomingPosts,
      personalQueue,
      pipelineStatus,
      stuckVideos,
      failures,
      scriptsCount,
    ] = await Promise.all([
      activityPromise,
      userActivityPromise,
      postsThisWeekPromise,
      viewsThisWeekPromise,
      topVideoPromise,
      upcomingPostsPromise,
      personalQueuePromise,
      pipelineStatusPromise,
      stuckVideosPromise,
      failuresPromise,
      scriptsCountPromise,
    ]);

    // Merge activity feeds and sort by time, take top 10
    const mergedActivity = [
      ...activityFeed.map((e: Record<string, unknown>) => ({
        id: e.id,
        type: 'pipeline' as const,
        event: e.event_type,
        description: formatPipelineEvent(e),
        timestamp: e.created_at,
      })),
      ...userActivity.map((e: Record<string, unknown>) => ({
        id: e.id,
        type: 'user' as const,
        event: e.action,
        description: formatUserEvent(e),
        timestamp: e.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime())
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      data: {
        role: isAdmin ? 'admin' : authContext.role,
        isAdmin,
        activityFeed: mergedActivity,
        performance: {
          postsThisWeek,
          viewsThisWeek,
          topVideo,
          upcomingPosts,
          scriptsCount,
        },
        personalQueue,
        // Admin-only fields
        ...(isAdmin && {
          pipeline: {
            statusCounts: pipelineStatus,
            stuckVideos,
            failures,
          },
        }),
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Dashboard GET error:`, err);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

function formatPipelineEvent(e: Record<string, unknown>): string {
  const type = e.event_type as string;
  if (type === 'status_change') {
    return `Video moved from ${e.from_status} to ${e.to_status}`;
  }
  if (type === 'error') {
    const details = e.details as Record<string, unknown> | null;
    return `Error: ${details?.message || 'Pipeline failure'}`;
  }
  return type.replace(/_/g, ' ');
}

function formatUserEvent(e: Record<string, unknown>): string {
  const action = e.action as string;
  const name = (e.entity_name as string) || '';
  switch (action) {
    case 'script_generated': return `Generated script${name ? `: ${name}` : ''}`;
    case 'script_saved': return `Saved script${name ? `: ${name}` : ''}`;
    case 'script_edited': return `Edited script${name ? `: ${name}` : ''}`;
    case 'script_deleted': return `Deleted script${name ? `: ${name}` : ''}`;
    case 'script_favorited': return `Favorited${name ? `: ${name}` : ''}`;
    case 'script_exported': return `Exported script${name ? `: ${name}` : ''}`;
    default: return action.replace(/_/g, ' ');
  }
}
