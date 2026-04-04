/**
 * API: AI Caption Generator
 *
 * POST /api/ai/caption — generate caption, hashtags, and comment bait
 * Body: { content_item_id: string }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { callAnthropicAPI } from '@/lib/ai/anthropic';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';

export const POST = withErrorCapture(async (request: Request) => {
  const guard = await aiRouteGuard(request, { creditCost: 1, userLimit: 10 });
  if (guard.error) return guard.error;

  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { content_item_id } = body;
  if (!content_item_id) {
    return createApiErrorResponse('BAD_REQUEST', 'content_item_id required', 400, correlationId);
  }

  // Fetch content item with product
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, title, transcript_text, caption, products:product_id(name)')
    .eq('id', content_item_id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const productName = (item as any).products?.name || 'the product';
  const context = item.transcript_text
    ? `Transcript: ${item.transcript_text.slice(0, 1000)}`
    : `Title/Hook: ${item.title}`;

  const result = await callAnthropicAPI(
    `Generate a TikTok caption for this content about ${productName}.\n\n${context}\n\nInclude:\n1. One short, punchy caption (2-3 sentences max)\n2. 5 relevant hashtags\n3. 1 comment bait line to drive engagement\n\nKeep tone energetic and conversational.\n\nReturn ONLY valid JSON (no markdown):\n{"caption":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"comment_bait":"..."}`,
    {
      systemPrompt: 'You are a TikTok growth expert. Write captions that drive engagement. Return only valid JSON.',
      maxTokens: 512,
      temperature: 0.7,
      correlationId,
      requestType: 'generation',
      agentId: 'caption-generator',
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
}, { routeName: '/api/ai/caption', feature: 'ai-caption' });
