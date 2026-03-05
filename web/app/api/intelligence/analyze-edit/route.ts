/**
 * POST /api/intelligence/analyze-edit
 *
 * Analyze a content item's transcript and generate editing suggestions.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { analyzeAndStoreSuggestions } from '@/lib/editing/analyzeTranscript';
import { enqueueJob } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { content_item_id, async: runAsync } = body;

  if (!content_item_id) {
    return createApiErrorResponse('BAD_REQUEST', 'content_item_id is required', 400, correlationId);
  }

  // If async=true, enqueue as background job
  if (runAsync) {
    const jobId = await enqueueJob(user.id, 'analyze_transcript', { content_item_id });
    return NextResponse.json({
      ok: true,
      data: { job_id: jobId, status: 'queued' },
      correlation_id: correlationId,
    });
  }

  // Synchronous — run inline
  const result = await analyzeAndStoreSuggestions(content_item_id, user.id);

  return NextResponse.json({
    ok: true,
    data: {
      suggestions: result.suggestions,
      stored: result.stored,
    },
    correlation_id: correlationId,
  });
}
