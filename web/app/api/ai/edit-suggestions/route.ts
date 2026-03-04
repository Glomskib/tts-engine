/**
 * API: AI Edit Suggestions
 *
 * POST /api/ai/edit-suggestions — analyze transcript and suggest edits
 * Body: { content_item_id: string }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { callAnthropicAPI } from '@/lib/ai/anthropic';

export const runtime = 'nodejs';

export const POST = withErrorCapture(async (request: Request) => {
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

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, title, transcript_text, transcript_json')
    .eq('id', content_item_id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  if (!item.transcript_text) {
    return createApiErrorResponse('PRECONDITION_FAILED', 'No transcript available', 400, correlationId);
  }

  // Build timestamped transcript if available
  let transcriptInput = item.transcript_text;
  if (item.transcript_json && Array.isArray(item.transcript_json)) {
    transcriptInput = (item.transcript_json as Array<{ start: number; end: number; text: string }>)
      .map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
      .join('\n');
  }

  const result = await callAnthropicAPI(
    `Analyze this TikTok video transcript for editing.\n\nTranscript:\n${transcriptInput.slice(0, 3000)}\n\nIdentify:\n1. Dead pauses (timestamps where nothing happens)\n2. Mistakes or filler words to cut\n3. Moments that need text overlays for emphasis\n4. B-roll opportunities (where to cut away)\n5. Optimal cut points for pacing\n\nReturn ONLY valid JSON (no markdown):\n{"cuts":[{"timestamp":"...","reason":"..."}],"overlays":[{"timestamp":"...","text":"..."}],"broll":[{"timestamp":"...","suggestion":"..."}],"mistakes":[{"timestamp":"...","issue":"..."}]}`,
    {
      systemPrompt: 'You are a professional TikTok video editor. Provide specific, actionable edit suggestions with timestamps. Return only valid JSON.',
      maxTokens: 2048,
      temperature: 0.5,
      correlationId,
      requestType: 'analysis',
      agentId: 'edit-suggestions',
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
}, { routeName: '/api/ai/edit-suggestions', feature: 'ai-edit-suggestions' });
