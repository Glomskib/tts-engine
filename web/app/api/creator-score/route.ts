/**
 * API: Creator Score
 *
 * GET /api/creator-score — calculate creator performance score
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [postsResult, recentPostsResult, itemsResult] = await Promise.all([
    // Posts in last 30 days
    supabaseAdmin
      .from('content_item_posts')
      .select('id, posted_at, performance_score')
      .eq('workspace_id', user.id)
      .eq('status', 'posted')
      .gte('posted_at', thirtyDaysAgo),

    // Posts in last 7 days (for trend)
    supabaseAdmin
      .from('content_item_posts')
      .select('id')
      .eq('workspace_id', user.id)
      .eq('status', 'posted')
      .gte('posted_at', sevenDaysAgo),

    // Content items created in last 30 days (experiments)
    supabaseAdmin
      .from('content_items')
      .select('id, status, created_at')
      .eq('workspace_id', user.id)
      .gte('created_at', thirtyDaysAgo),
  ]);

  const posts = postsResult.data || [];
  const recentPosts = recentPostsResult.data || [];
  const items = itemsResult.data || [];

  // Posting consistency (0-40 points): at least 3 posts/week ideal
  const weeksInPeriod = 4;
  const postsPerWeek = posts.length / weeksInPeriod;
  const consistencyScore = Math.min(40, Math.round((postsPerWeek / 3) * 40));

  // Video performance (0-40 points): average performance score
  const avgPerformance = posts.length > 0
    ? posts.reduce((s, p: any) => s + (p.performance_score || 0), 0) / posts.length
    : 0;
  const performanceScore = Math.min(40, Math.round(avgPerformance * 4));

  // Experiments run (0-20 points): content items created
  const experimentsScore = Math.min(20, items.length * 2);

  const totalScore = consistencyScore + performanceScore + experimentsScore;

  // Trend: compare last 7 days posts vs expected rate
  const expectedWeekly = posts.length / weeksInPeriod;
  const trend = recentPosts.length > expectedWeekly ? 'up' : recentPosts.length < expectedWeekly * 0.5 ? 'down' : 'stable';

  const response = NextResponse.json({
    ok: true,
    data: {
      creator_score: totalScore,
      trend,
      breakdown: {
        consistency: consistencyScore,
        performance: performanceScore,
        experiments: experimentsScore,
      },
      posts_30d: posts.length,
      posts_7d: recentPosts.length,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=3600');
  return response;
}, { routeName: '/api/creator-score', feature: 'creator-score' });
