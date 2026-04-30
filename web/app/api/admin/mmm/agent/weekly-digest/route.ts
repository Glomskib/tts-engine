/**
 * POST /api/admin/mmm/agent/weekly-digest
 *
 * No body required. Runs the live MMM dashboard fetch, asks Miles to write a
 * Monday digest, persists as marketing_posts (status='cancelled', source='bolt-miles').
 * Owner-gated. ANTHROPIC_API_KEY required.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { isOwnerEmail } from '@/lib/command-center/owner-guard';
import { generateWeeklyDigest } from '@/lib/command-center/mmm/agent-loop';

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

  try {
    const result = await generateWeeklyDigest();
    const response = NextResponse.json({ ...result, correlation_id: correlationId }, { status: 201 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Digest failed',
      500,
      correlationId,
    );
  }
}
