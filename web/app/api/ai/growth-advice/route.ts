/**
 * API: AI Growth Advisor
 *
 * GET /api/ai/growth-advice — weekly growth strategy from AI
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

  // Gather workspace data for context
  const [postsResult, hooksResult, itemsResult] = await Promise.all([
    supabaseAdmin
      .from('content_item_posts')
      .select('id, platform, performance_score, posted_at, content_items:content_item_id(title, products:product_id(name))')
      .eq('workspace_id', user.id)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(20),

    supabaseAdmin
      .from('hook_patterns')
      .select('pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', user.id)
      .order('performance_score', { ascending: false })
      .limit(10),

    supabaseAdmin
      .from('content_items')
      .select('id, title, status')
      .eq('workspace_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const posts = postsResult.data || [];
  const hooks = hooksResult.data || [];
  const items = itemsResult.data || [];

  // Build context summary
  const postSummary = posts.map((p: any) =>
    `- "${p.content_items?.title || 'Untitled'}" (${p.content_items?.products?.name || 'no product'}) — score: ${p.performance_score || 0}`
  ).join('\n');

  const hookSummary = hooks.map((h: any) =>
    `- "${h.example_hook || h.pattern}" — score: ${h.performance_score}, used ${h.uses_count}x`
  ).join('\n');

  const pipelineSummary = items.map((i: any) => `- "${i.title}" — ${i.status}`).join('\n');

  const result = await callAnthropicAPI(
    `Analyze this TikTok creator's data and provide a weekly growth strategy.\n\nRecent Posts (${posts.length}):\n${postSummary || 'No posts yet'}\n\nTop Hooks:\n${hookSummary || 'No hook data'}\n\nPipeline:\n${pipelineSummary || 'Empty'}\n\nProvide:\n1. 3 growth insights based on the data\n2. 3 new hook ideas to try\n3. 1 specific experiment to run this week\n\nReturn ONLY valid JSON (no markdown):\n{"growth_insights":["...","...","..."],"hook_ideas":["...","...","..."],"weekly_experiment":"..."}`,
    {
      systemPrompt: 'You are a TikTok growth strategist analyzing creator performance data. Give specific, data-driven advice. Return only valid JSON.',
      maxTokens: 1024,
      temperature: 0.7,
      correlationId,
      requestType: 'analysis',
      agentId: 'growth-advisor',
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
}, { routeName: '/api/ai/growth-advice', feature: 'growth-advisor' });
