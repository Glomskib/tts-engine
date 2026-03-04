/**
 * API: Experiment Results
 *
 * GET /api/experiments — aggregate experiment results by variable_type and variant
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

interface ExperimentResult {
  variable_type: string;
  variant: string;
  count: number;
  avg_engagement: number;
}

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Get all experiments for this workspace
  const { data: experiments, error: expError } = await supabaseAdmin
    .from('content_experiments')
    .select('variable_type, variant, content_item_id')
    .eq('workspace_id', workspaceId);

  if (expError || !experiments?.length) {
    return NextResponse.json({
      ok: true,
      data: [],
      correlation_id: correlationId,
    });
  }

  // Get all content_item_posts for these content items
  const contentItemIds = [...new Set(experiments.map(e => e.content_item_id))];
  const { data: posts } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, content_item_id')
    .eq('workspace_id', workspaceId)
    .in('content_item_id', contentItemIds);

  if (!posts?.length) {
    return NextResponse.json({
      ok: true,
      data: [],
      correlation_id: correlationId,
    });
  }

  // Get latest metrics for each post
  const postIds = posts.map(p => p.id);
  const { data: snapshots } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('content_item_post_id, views, likes, comments, shares')
    .eq('workspace_id', workspaceId)
    .in('content_item_post_id', postIds)
    .order('captured_at', { ascending: false });

  // Dedupe to latest snapshot per post
  const latestByPost = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
  for (const s of (snapshots || [])) {
    if (!latestByPost.has(s.content_item_post_id)) {
      latestByPost.set(s.content_item_post_id, s);
    }
  }

  // Map content_item_id → engagement rate
  const engagementByContentItem = new Map<string, number>();
  for (const post of posts) {
    const m = latestByPost.get(post.id);
    if (m && m.views > 0) {
      const rate = ((m.likes + m.comments + m.shares) / m.views) * 100;
      // If multiple posts per content item, use the best one
      const existing = engagementByContentItem.get(post.content_item_id);
      if (existing === undefined || rate > existing) {
        engagementByContentItem.set(post.content_item_id, rate);
      }
    }
  }

  // Aggregate by (variable_type, variant)
  const resultMap = new Map<string, { variable_type: string; variant: string; total: number; engSum: number; withEng: number }>();
  for (const exp of experiments) {
    const key = `${exp.variable_type}::${exp.variant}`;
    let entry = resultMap.get(key);
    if (!entry) {
      entry = { variable_type: exp.variable_type, variant: exp.variant, total: 0, engSum: 0, withEng: 0 };
      resultMap.set(key, entry);
    }
    entry.total++;
    const eng = engagementByContentItem.get(exp.content_item_id);
    if (eng !== undefined) {
      entry.engSum += eng;
      entry.withEng++;
    }
  }

  const results: ExperimentResult[] = Array.from(resultMap.values())
    .map(e => ({
      variable_type: e.variable_type,
      variant: e.variant,
      count: e.total,
      avg_engagement: e.withEng > 0
        ? Math.round((e.engSum / e.withEng) * 100) / 100
        : 0,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  const response = NextResponse.json({
    ok: true,
    data: results,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/experiments', feature: 'experiments' });
