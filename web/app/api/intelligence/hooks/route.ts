/**
 * API: Hook Performance Intelligence
 *
 * GET /api/intelligence/hooks — best, worst, and trending hooks
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

  const [bestResult, worstResult, allResult, winnerHooksResult] = await Promise.all([
    // Best hooks — high performance_score, at least 1 use
    supabaseAdmin
      .from('hook_patterns')
      .select('id, pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', user.id)
      .gt('uses_count', 0)
      .order('performance_score', { ascending: false })
      .limit(10),

    // Worst hooks — lowest score, at least 1 use
    supabaseAdmin
      .from('hook_patterns')
      .select('id, pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', user.id)
      .gt('uses_count', 0)
      .order('performance_score', { ascending: true })
      .limit(5),

    // All hooks for trending calc — recent activity
    supabaseAdmin
      .from('hook_patterns')
      .select('id, pattern, example_hook, performance_score, uses_count, created_at')
      .eq('workspace_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),

    // Winner pattern hooks — from winner_patterns_v2
    supabaseAdmin
      .from('winner_patterns_v2')
      .select('id, hook_text, format_tag, length_bucket, score, sample_size, platform')
      .eq('workspace_id', user.id)
      .not('hook_text', 'is', null)
      .gte('sample_size', 2)
      .order('score', { ascending: false })
      .limit(20),
  ]);

  const bestHooks = (bestResult.data || []).map((h: any) => ({
    id: h.id,
    hook: h.example_hook || h.pattern,
    pattern: h.pattern,
    avg_score: h.performance_score,
    videos: h.uses_count,
  }));

  const worstHooks = (worstResult.data || []).map((h: any) => ({
    id: h.id,
    hook: h.example_hook || h.pattern,
    pattern: h.pattern,
    avg_score: h.performance_score,
    videos: h.uses_count,
  }));

  // Trending: hooks created in last 14 days with above-average score
  const allHooks = allResult.data || [];
  const avgScore = allHooks.length > 0
    ? allHooks.reduce((sum: number, h: any) => sum + (h.performance_score || 0), 0) / allHooks.length
    : 0;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const trendingHooks = allHooks
    .filter((h: any) => h.created_at > fourteenDaysAgo && h.performance_score > avgScore)
    .slice(0, 5)
    .map((h: any) => ({
      id: h.id,
      hook: h.example_hook || h.pattern,
      pattern: h.pattern,
      growth_rate: avgScore > 0
        ? Math.round(((h.performance_score - avgScore) / avgScore) * 100)
        : 0,
    }));

  // Winner pattern hooks — proven hooks from winner detection
  const winnerHooks = (winnerHooksResult.data || []).map((h: any) => ({
    id: h.id,
    hook: h.hook_text,
    format_tag: h.format_tag,
    length_bucket: h.length_bucket,
    score: h.score,
    sample_size: h.sample_size,
    platform: h.platform,
  }));

  const response = NextResponse.json({
    ok: true,
    data: {
      best_hooks: bestHooks,
      worst_hooks: worstHooks,
      trending_hooks: trendingHooks,
      winner_hooks: winnerHooks,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=300');
  return response;
}, { routeName: '/api/intelligence/hooks', feature: 'hook-intelligence' });
