/**
 * API: Performance Dashboard Data
 *
 * GET /api/performance — aggregated performance data for workspace
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Run all queries in parallel
  const [
    postsResult,
    snapshotsResult,
    hookPatternsResult,
    productsResult,
  ] = await Promise.all([
    // 1. All posts with latest score
    supabaseAdmin
      .from('content_item_posts')
      .select('id, platform, post_url, posted_at, performance_score, product_id, content_item_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false, nullsFirst: false }),

    // 2. All metrics snapshots (last 90 days)
    supabaseAdmin
      .from('content_item_metrics_snapshots')
      .select('content_item_post_id, captured_at, views, likes, comments, shares, saves, source')
      .eq('workspace_id', workspaceId)
      .gte('captured_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('captured_at', { ascending: false }),

    // 3. Hook patterns
    supabaseAdmin
      .from('hook_patterns')
      .select('pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', workspaceId)
      .order('performance_score', { ascending: false })
      .limit(10),

    // 4. Products for product performance section
    supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('user_id', workspaceId),
  ]);

  const posts = postsResult.data || [];
  const allSnapshots = snapshotsResult.data || [];
  const hookPatterns = hookPatternsResult.data || [];
  const products = productsResult.data || [];

  // Build latest metrics per post (dedupe)
  const latestMetrics: Record<string, {
    views: number; likes: number; comments: number; shares: number; saves: number;
  }> = {};
  const seenPosts = new Set<string>();
  for (const s of allSnapshots) {
    if (seenPosts.has(s.content_item_post_id)) continue;
    seenPosts.add(s.content_item_post_id);
    latestMetrics[s.content_item_post_id] = {
      views: s.views ?? 0,
      likes: s.likes ?? 0,
      comments: s.comments ?? 0,
      shares: s.shares ?? 0,
      saves: s.saves ?? 0,
    };
  }

  // ── Section 1: Top Performing Posts ──
  const topPosts = posts
    .filter(p => latestMetrics[p.id]?.views > 0)
    .map(p => {
      const m = latestMetrics[p.id];
      const engagementRate = m.views > 0
        ? ((m.likes + m.comments + m.shares) / m.views) * 100
        : 0;
      return {
        id: p.id,
        platform: p.platform,
        post_url: p.post_url,
        posted_at: p.posted_at,
        performance_score: p.performance_score,
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        engagement_rate: Math.round(engagementRate * 100) / 100,
      };
    })
    .sort((a, b) => b.engagement_rate - a.engagement_rate)
    .slice(0, 10);

  // ── Section 2: Aggregate stats ──
  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  for (const m of Object.values(latestMetrics)) {
    totalViews += m.views;
    totalLikes += m.likes;
    totalComments += m.comments;
    totalShares += m.shares;
  }
  const overallEngagement = totalViews > 0
    ? Math.round(((totalLikes + totalComments + totalShares) / totalViews) * 10000) / 100
    : 0;

  // ── Section 3: Views Over Time (daily aggregation) ──
  const dailyViews: Record<string, number> = {};
  for (const s of allSnapshots) {
    const day = s.captured_at.slice(0, 10); // YYYY-MM-DD
    dailyViews[day] = (dailyViews[day] || 0) + (s.views ?? 0);
  }
  const viewsOverTime = Object.entries(dailyViews)
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // Last 30 days

  // ── Section 4: Platform Breakdown ──
  const platformMap: Record<string, { views: number; posts: number }> = {};
  for (const p of posts) {
    const m = latestMetrics[p.id];
    if (!m) continue;
    if (!platformMap[p.platform]) platformMap[p.platform] = { views: 0, posts: 0 };
    platformMap[p.platform].views += m.views;
    platformMap[p.platform].posts += 1;
  }
  const platformBreakdown = Object.entries(platformMap)
    .map(([platform, data]) => ({ platform, ...data }))
    .sort((a, b) => b.views - a.views);

  // ── Section 5: Product Performance ──
  const productMap = new Map(products.map(p => [p.id, p.name]));
  const productPerf: Record<string, { name: string; totalEngagement: number; postCount: number; totalViews: number }> = {};
  for (const p of posts) {
    if (!p.product_id) continue;
    const m = latestMetrics[p.id];
    if (!m || m.views === 0) continue;
    const name = productMap.get(p.product_id) || 'Unknown';
    if (!productPerf[p.product_id]) {
      productPerf[p.product_id] = { name, totalEngagement: 0, postCount: 0, totalViews: 0 };
    }
    productPerf[p.product_id].totalEngagement += m.likes + m.comments + m.shares;
    productPerf[p.product_id].totalViews += m.views;
    productPerf[p.product_id].postCount += 1;
  }
  const productPerformance = Object.values(productPerf)
    .map(p => ({
      name: p.name,
      posts: p.postCount,
      total_views: p.totalViews,
      avg_engagement_rate: p.totalViews > 0
        ? Math.round((p.totalEngagement / p.totalViews) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate);

  const response = NextResponse.json({
    ok: true,
    data: {
      stats: {
        total_posts: posts.length,
        total_views: totalViews,
        total_likes: totalLikes,
        overall_engagement: overallEngagement,
      },
      top_posts: topPosts,
      hook_patterns: hookPatterns,
      views_over_time: viewsOverTime,
      platform_breakdown: platformBreakdown,
      product_performance: productPerformance,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/performance', feature: 'content-intel' });
