/**
 * POST /api/intelligence/replicate-pattern
 *
 * Replicate a winning pattern into multiple new content items.
 * Runs as a background job via the job queue.
 *
 * Body: { pattern_id: string, count?: number }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { enqueueJob } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { pattern_id, count = 5 } = body;

  if (!pattern_id) {
    return createApiErrorResponse('BAD_REQUEST', 'pattern_id is required', 400, correlationId);
  }

  const clampedCount = Math.min(Math.max(1, count), 10);

  // Enqueue as background job
  const jobId = await enqueueJob(user.id, 'replicate_pattern', {
    pattern_id,
    count: clampedCount,
  });

  if (!jobId) {
    return createApiErrorResponse('DB_ERROR', 'Failed to enqueue replication job', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      job_id: jobId,
      pattern_id,
      count: clampedCount,
      status: 'queued',
    },
    correlation_id: correlationId,
  });
}
