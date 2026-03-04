/**
 * API: Replication Engine
 *
 * GET /api/intelligence/winners — winning content + AI replication ideas
 * POST /api/intelligence/winners — generate replication ideas for a hook
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { callAnthropicAPI } from '@/lib/ai/anthropic';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Get top-performing posts
  const { data: posts } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, post_url, platform, performance_score, content_item_id, posted_at, content_items:content_item_id(title, products:product_id(name))')
    .eq('workspace_id', user.id)
    .eq('status', 'posted')
    .gt('performance_score', 0)
    .order('performance_score', { ascending: false })
    .limit(10);

  // Get existing insights for these posts
  const postIds = (posts || []).map((p: any) => p.id);
  const { data: insights } = postIds.length > 0
    ? await supabaseAdmin
        .from('content_item_ai_insights')
        .select('content_item_post_id, insight_type, json, markdown')
        .in('content_item_post_id', postIds)
        .eq('insight_type', 'hook')
    : { data: [] };

  const insightMap = new Map((insights || []).map((i: any) => [i.content_item_post_id, i]));

  const winners = (posts || []).map((p: any) => ({
    id: p.id,
    title: p.content_items?.title || 'Untitled',
    product_name: p.content_items?.products?.name || null,
    platform: p.platform,
    performance_score: p.performance_score,
    posted_at: p.posted_at,
    post_url: p.post_url,
    has_insight: insightMap.has(p.id),
    insight: insightMap.get(p.id)?.json || null,
  }));

  const response = NextResponse.json({
    ok: true,
    data: winners,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/intelligence/winners', feature: 'replication-engine' });

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { hook } = body;
  if (!hook) {
    return createApiErrorResponse('BAD_REQUEST', 'hook is required', 400, correlationId);
  }

  const result = await callAnthropicAPI(
    `Generate 3 TikTok replication ideas for this winning hook:\n\nOriginal Hook: "${hook}"\n\nCreate 3 variations that:\n- Keep the same emotional trigger\n- Change the context, audience, or product angle\n- Are ready to film immediately\n\nReturn ONLY valid JSON (no markdown):\n{"replications":["variation 1","variation 2","variation 3"]}`,
    {
      systemPrompt: 'You are a TikTok content strategist. Generate hook replications that maintain what made the original work. Return only valid JSON.',
      maxTokens: 512,
      temperature: 0.8,
      correlationId,
      requestType: 'generation',
      agentId: 'replication-engine',
    },
  );

  let parsed;
  try {
    parsed = JSON.parse(result.text.trim());
  } catch {
    return createApiErrorResponse('AI_ERROR', 'Failed to parse AI response', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: parsed,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/intelligence/winners', feature: 'replication-engine' });
