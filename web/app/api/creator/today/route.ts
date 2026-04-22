/**
 * GET /api/creator/today
 *
 * Aggregated daily dashboard for creators.
 * Pulls from: opportunities, content packs, comment themes,
 * performance profile, pipeline queues, and recent scripts.
 *
 * All queries are parallel and non-fatal — if one fails,
 * the dashboard still loads with whatever data is available.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { filterSafeRecords } from '@/lib/content-safety';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Run all queries in parallel — each one is independent and non-fatal
  const [
    opportunitiesResult,
    recentPacksResult,
    commentThemesResult,
    performanceResult,
    pipelineResult,
    recentScriptsResult,
    topVideoResult,
  ] = await Promise.allSettled([

    // 1. Top opportunities (ACT_NOW + TEST_SOON, top 3)
    (async () => {
      const { data: savedRows } = await supabaseAdmin
        .from('saved_opportunities')
        .select('cluster_id')
        .eq('user_id', user.id);
      const savedIds = new Set((savedRows || []).map(r => r.cluster_id));

      const { data } = await supabaseAdmin
        .from('trend_clusters')
        .select('id, display_name, recommendation, trend_score, earlyness_score, signals_24h, community_best_hook, forecast_breakdown')
        .eq('workspace_id', workspaceId)
        .neq('status', 'dismissed')
        .in('recommendation', ['ACT_NOW', 'TEST_SOON'])
        .order('trend_score', { ascending: false })
        .limit(3);

      return (data || []).map(d => ({
        id: d.id,
        topic: d.display_name,
        recommendation: d.recommendation,
        score: d.trend_score,
        earlyness: d.earlyness_score,
        velocity_24h: d.signals_24h,
        best_hook: d.community_best_hook,
        suggested_angle: (d.forecast_breakdown as Record<string, string> | null)?.suggested_angle || null,
        saved: savedIds.has(d.id),
      }));
    })(),

    // 2. Recent content packs (last 5, most recent first)
    supabaseAdmin
      .from('content_packs')
      .select('id, topic, source_type, status, favorited, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(r => r.data || []),

    // 3. Active comment themes (not dismissed, top 3 by opportunity_score)
    supabaseAdmin
      .from('comment_themes')
      .select('id, theme, category, opportunity_score, comment_count, content_angle, suggested_actions')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .order('opportunity_score', { ascending: false })
      .limit(3)
      .then(r => r.data || []),

    // 4. Performance profile summary (top dimensions)
    (async () => {
      const { data: profile } = await supabaseAdmin
        .from('creator_performance_profiles')
        .select('total_posts, total_views, avg_engagement_rate, median_views, best_score, last_aggregated_at')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (!profile || profile.total_posts === 0) return null;

      // Get top performing dimension per category
      const { data: dims } = await supabaseAdmin
        .from('creator_profile_dimensions')
        .select('dimension, dimension_value, avg_score, sample_size, win_rate')
        .eq('workspace_id', workspaceId)
        .gte('sample_size', 2)
        .order('avg_score', { ascending: false })
        .limit(30);

      // Pick best per dimension
      const bestByDim: Record<string, { value: string; score: number; win_rate: number; samples: number }> = {};
      for (const d of dims || []) {
        if (!bestByDim[d.dimension]) {
          bestByDim[d.dimension] = {
            value: d.dimension_value,
            score: d.avg_score,
            win_rate: d.win_rate,
            samples: d.sample_size,
          };
        }
      }

      return {
        total_posts: profile.total_posts,
        total_views: profile.total_views,
        avg_engagement_rate: profile.avg_engagement_rate,
        top_patterns: bestByDim,
        last_aggregated_at: profile.last_aggregated_at,
      };
    })(),

    // 5. Pipeline counts
    (async () => {
      const statuses = ['ready_to_record', 'recorded', 'editing', 'ready_to_post'];
      const counts: Record<string, number> = {};
      const results = await Promise.all(
        statuses.map(status =>
          supabaseAdmin
            .from('content_items')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('status', status)
        ),
      );
      statuses.forEach((status, i) => {
        counts[status] = results[i].count ?? 0;
      });
      return counts;
    })(),

    // 6. Recent draft scripts (last 3 safe drafts)
    supabaseAdmin
      .from('saved_skits')
      .select('id, title, product_name, created_at, status')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(25)
      .then(r => filterSafeRecords(r.data || []).slice(0, 3)),

    // 7. Top video this week
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: posts } = await supabaseAdmin
        .from('content_item_posts')
        .select('id, content_item_id, platform, posted_at, caption_used, content_items:content_item_id(title)')
        .eq('workspace_id', workspaceId)
        .eq('status', 'posted')
        .gte('posted_at', weekAgo)
        .order('posted_at', { ascending: false })
        .limit(10);

      if (!posts?.length) return null;

      let topPost = null;
      let topViews = 0;

      for (const post of posts) {
        const { data: metrics } = await supabaseAdmin
          .from('content_item_metrics_snapshots')
          .select('views, likes, comments, shares')
          .eq('content_item_post_id', post.id)
          .order('captured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (metrics && (metrics.views ?? 0) > topViews) {
          topViews = metrics.views ?? 0;
          const ci = post.content_items as unknown as { title: string } | null;
          topPost = {
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

  const extract = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
    result.status === 'fulfilled' ? result.value : fallback;

  const pipeline = extract(pipelineResult, {} as Record<string, number>);
  const totalPipelineItems =
    (pipeline.ready_to_record ?? 0) +
    (pipeline.recorded ?? 0) +
    (pipeline.editing ?? 0) +
    (pipeline.ready_to_post ?? 0);

  return NextResponse.json({
    ok: true,
    data: {
      opportunities: extract(opportunitiesResult, []),
      recent_packs: extract(recentPacksResult, []),
      comment_themes: extract(commentThemesResult, []),
      performance: extract(performanceResult, null),
      pipeline: {
        counts: pipeline,
        total: totalPipelineItems,
      },
      recent_drafts: extract(recentScriptsResult, []),
      top_video: extract(topVideoResult, null),
    },
    correlation_id: correlationId,
  });
}
