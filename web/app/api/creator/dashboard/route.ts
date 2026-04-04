/**
 * GET /api/creator/dashboard
 *
 * Returns all data needed for the Creator Command Center:
 * - Next video to record
 * - Recording queue
 * - Editing queue
 * - Posting queue
 * - Performance snapshot (top video this week)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Run all queries in parallel
  const [
    nextVideoResult,
    recordingQueueResult,
    editingQueueResult,
    postingQueueResult,
    topVideoResult,
    statsResult,
  ] = await Promise.all([
    // Next video: first content item in ready_to_record status
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Recording queue: all ready_to_record items
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('created_at', { ascending: true })
      .limit(10),

    // Editing queue: recorded items needing editing
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .in('status', ['recorded', 'editing'])
      .order('created_at', { ascending: true })
      .limit(10),

    // Posting queue: ready_to_post items
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_post')
      .order('created_at', { ascending: true })
      .limit(10),

    // Top video this week: best performing posted content
    // FIXED: was N+1 (1 query per post). Now 2 queries total.
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: posts } = await supabaseAdmin
        .from('content_item_posts')
        .select('id, content_item_id, platform, posted_at, caption_used, content_items:content_item_id(title)')
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .gte('posted_at', weekAgo)
        .order('posted_at', { ascending: false })
        .limit(20);

      if (!posts?.length) return null;

      // Batch fetch all metrics in a single query, then pick the latest per post
      const postIds = posts.map(p => p.id);
      const { data: allMetrics } = await supabaseAdmin
        .from('content_item_metrics_snapshots')
        .select('content_item_post_id, views, likes, comments, shares, captured_at')
        .eq('workspace_id', workspaceId)
        .in('content_item_post_id', postIds)
        .order('captured_at', { ascending: false });

      // Dedupe to latest snapshot per post
      const latestByPost = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
      for (const m of allMetrics ?? []) {
        if (!latestByPost.has(m.content_item_post_id)) {
          latestByPost.set(m.content_item_post_id, m);
        }
      }

      // Find top post by views
      let topPost = null;
      let topViews = 0;
      for (const post of posts) {
        const metrics = latestByPost.get(post.id);
        if (metrics && (metrics.views ?? 0) > topViews) {
          topViews = metrics.views ?? 0;
          const ci = post.content_items as unknown as { title: string } | null;
          topPost = {
            post_id: post.id,
            content_item_id: post.content_item_id,
            title: ci?.title || post.caption_used?.slice(0, 60) || 'Untitled',
            platform: post.platform,
            posted_at: post.posted_at,
            views: metrics.views ?? 0,
            likes: metrics.likes ?? 0,
            comments: metrics.comments ?? 0,
            shares: metrics.shares ?? 0,
          };
        }
      }

      return topPost;
    })(),

    // Pipeline stats counts
    // FIXED: was 6 sequential queries. Now a single group-by query.
    (async () => {
      const STATUSES = ['briefing', 'ready_to_record', 'recorded', 'editing', 'ready_to_post', 'posted'];
      const counts: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]));
      try {
        const { data } = await supabaseAdmin
          .from('content_items')
          .select('status')
          .eq('workspace_id', workspaceId)
          .in('status', STATUSES);
        for (const row of data ?? []) {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
        }
      } catch {
        // non-fatal — return zeroed counts
      }
      return counts;
    })(),
  ]);

  const formatItem = (item: Record<string, unknown>) => ({
    id: item.id,
    title: item.title || 'Untitled',
    status: item.status,
    product_name: (item.products as { name: string } | null)?.name || null,
    created_at: item.created_at,
  });

  return NextResponse.json({
    ok: true,
    data: {
      next_video: nextVideoResult.data ? formatItem(nextVideoResult.data as Record<string, unknown>) : null,
      recording_queue: (recordingQueueResult.data || []).map(r => formatItem(r as unknown as Record<string, unknown>)),
      editing_queue: (editingQueueResult.data || []).map(r => formatItem(r as unknown as Record<string, unknown>)),
      posting_queue: (postingQueueResult.data || []).map(r => formatItem(r as unknown as Record<string, unknown>)),
      top_video: topVideoResult,
      stats: statsResult,
    },
    correlation_id: correlationId,
  });
}
