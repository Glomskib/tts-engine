/**
 * POST /api/intelligence/predict-score
 *
 * Predict viral potential score for a content combination.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { predictViralScore } from '@/lib/content-intelligence/viralScore';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { hook, format, length, product_id } = body;

  const result = await predictViralScore(user.id, {
    hook: hook || null,
    format: format || null,
    length: length || null,
    product_id: product_id || null,
  });

  return NextResponse.json({
    ok: true,
    data: result,
    correlation_id: correlationId,
  });
}
