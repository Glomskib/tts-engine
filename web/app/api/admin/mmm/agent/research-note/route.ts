/**
 * POST /api/admin/mmm/agent/research-note
 *
 * Body: { event_name: string, source_url?: string, notes?: string }
 *
 * Researches a bike event and persists findings as a queued idea tagged
 * mmm + bike-event-research, gated by approval. Owner-gated.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { isOwnerEmail } from '@/lib/command-center/owner-guard';
import { addBikeEventResearch } from '@/lib/command-center/mmm/agent-loop';

const Schema = z.object({
  event_name: z.string().min(1).max(200),
  source_url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Sign in required', 401, correlationId);
  if (!isOwnerEmail(auth.user.email)) {
    return createApiErrorResponse('FORBIDDEN', 'Owner access required', 403, correlationId);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return createApiErrorResponse(
      'AI_ERROR',
      'ANTHROPIC_API_KEY is not configured.',
      503,
      correlationId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const result = await addBikeEventResearch(parsed.data);
    const response = NextResponse.json({ ...result, correlation_id: correlationId }, { status: 201 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Research failed',
      500,
      correlationId,
    );
  }
}
