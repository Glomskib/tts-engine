/**
 * GET /api/creator/dashboard
 *
 * Full creator operations data — designed for daily/weekly use.
 * Returns pipeline queues, weekly stats, posting streak, and performance.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;
  const weekStart = startOfWeek().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    nextVideoResult,
    recordingQueueResult,
    editingQueueResult,
    postingQueueResult,
    briefingQueueResult,
    statsResult,
    weeklyStatsResult,
    streakResult,
    topVideoResult,
  ] = await Promise.all([

    // Next priority video to film
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, primary_hook, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Film queue — full script info
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, primary_hook, script_text, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('created_at', { ascending: true })
      .limit(15),

    // Edit queue
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, primary_hook, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .in('status', ['recorded', 'editing'])
      .order('created_at', { ascending: true })
      .limit(15),

    // Posting queue — full caption/hashtags/hook for copy-paste workflow
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, primary_hook, caption, hashtags, final_video_url, products:product_id(name, tiktok_product_id, link_code)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_post')
      .order('created_at', { ascending: true })
      .limit(15),

    // Briefing queue
    supabaseAdmin
      .from('content_items')
      .select('id, title, status, product_id, created_at, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'briefing')
      .order('created_at', { ascending: true })
      .limit(10),

    // Pipeline status counts
    (async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        ['briefing', 'ready_to_record', 'recorded', 'editing', 'ready_to_post', 'posted'].map(async (status) => {
          const { count } = await supabaseAdmin
            .from('content_items')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('status', status);
          counts[status] = count ?? 0;
        })
      );
      return counts;
    })(),

    // Weekly stats: posts this week, views/likes/clicks in last 7 days
    (async () => {
      // Videos posted this week (content_items)
      const { count: postedThisWeek } = await supabaseAdmin
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .gte('posted_at', weekStart);

      // Metrics from posts in last 7 days
      const { data: recentPostIds } = await supabaseAdmin
        .from('content_item_posts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .gte('posted_at', sevenDaysAgo);

      let views7d = 0;
      let likes7d = 0;
      let shares7d = 0;
      let comments7d = 0;

      if (recentPostIds?.length) {
        const ids = recentPostIds.map((p: { id: string }) => p.id);
        const { data: metrics } = await supabaseAdmin
          .from('content_item_metrics_snapshots')
          .select('content_item_post_id, views, likes, shares, comments')
          .in('content_item_post_id', ids);

        // Use latest snapshot per post (last in array, ordered by captured_at desc would be ideal
        // but we sum all for simplicity since there's usually 1 per post right now)
        const seen = new Set<string>();
        for (const m of (metrics || [])) {
          if (seen.has(m.content_item_post_id)) continue;
          seen.add(m.content_item_post_id);
          views7d += m.views || 0;
          likes7d += m.likes || 0;
          shares7d += m.shares || 0;
          comments7d += m.comments || 0;
        }
      }

      // Affiliate link clicks this week
      const { count: affiliateClicks } = await supabaseAdmin
        .from('click_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo);

      return {
        posted_this_week: postedThisWeek ?? 0,
        views_7d: views7d,
        likes_7d: likes7d,
        shares_7d: shares7d,
        comments_7d: comments7d,
        affiliate_clicks_7d: affiliateClicks ?? 0,
      };
    })(),

    // Posting streak: consecutive days ending today with at least one post
    (async () => {
      const { data: recentPosts } = await supabaseAdmin
        .from('content_items')
        .select('posted_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .not('posted_at', 'is', null)
        .gte('posted_at', thirtyDaysAgo)
        .order('posted_at', { ascending: false });

      if (!recentPosts?.length) return 0;

      const postedDays = new Set(
        recentPosts.map((p: { posted_at: string }) =>
          new Date(p.posted_at).toISOString().slice(0, 10)
        )
      );

      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        if (postedDays.has(dayStr)) {
          streak++;
        } else if (i === 0) {
          // If nothing posted today yet, still check yesterday
          continue;
        } else {
          break;
        }
      }
      return streak;
    })(),

    // Top video this week
    (async () => {
      const { data: posts } = await supabaseAdmin
        .from('content_item_posts')
        .select('id, content_item_id, platform, posted_at, caption_used, content_items:content_item_id(title)')
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .gte('posted_at', sevenDaysAgo)
        .order('posted_at', { ascending: false })
        .limit(20);

      if (!posts?.length) return null;

      let topPost = null;
      let topViews = 0;

      for (const post of posts) {
        const { data: metrics } = await supabaseAdmin
          .from('content_item_metrics_snapshots')
          .select('views, likes, comments, shares')
          .eq('content_item_post_id', post.id)
          .eq('workspace_id', workspaceId)
          .order('captured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

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
  ]);

  const formatBasicItem = (item: Record<string, unknown>) => ({
    id: item.id,
    title: item.title || 'Untitled',
    status: item.status,
    product_name: (item.products as { name: string } | null)?.name || null,
    primary_hook: item.primary_hook || null,
    created_at: item.created_at,
  });

  const formatPostItem = (item: Record<string, unknown>) => {
    const product = item.products as { name: string; tiktok_product_id?: string; link_code?: string } | null;
    return {
      id: item.id,
      title: item.title || 'Untitled',
      status: item.status,
      product_name: product?.name || null,
      tiktok_product_id: product?.tiktok_product_id || null,
      link_code: product?.link_code || null,
      primary_hook: item.primary_hook || null,
      caption: item.caption || null,
      hashtags: item.hashtags || [],
      final_video_url: item.final_video_url || null,
      created_at: item.created_at,
    };
  };

  const formatScriptItem = (item: Record<string, unknown>) => ({
    ...formatBasicItem(item),
    script_text: item.script_text || null,
  });

  return NextResponse.json({
    ok: true,
    data: {
      next_video: nextVideoResult.data ? formatBasicItem(nextVideoResult.data as Record<string, unknown>) : null,
      recording_queue: (recordingQueueResult.data || []).map(r => formatScriptItem(r as unknown as Record<string, unknown>)),
      editing_queue: (editingQueueResult.data || []).map(r => formatBasicItem(r as unknown as Record<string, unknown>)),
      posting_queue: (postingQueueResult.data || []).map(r => formatPostItem(r as unknown as Record<string, unknown>)),
      briefing_queue: (briefingQueueResult.data || []).map(r => formatBasicItem(r as unknown as Record<string, unknown>)),
      top_video: topVideoResult,
      stats: statsResult,
      weekly_stats: weeklyStatsResult,
      posting_streak: streakResult,
      weekly_goal: 5, // default — make configurable later
    },
    correlation_id: correlationId,
  });
}
