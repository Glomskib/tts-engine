/**
 * GET /api/admin/crm/analytics — pipeline analytics
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getPipelineAnalytics } from '@/lib/command-center/crm-queries';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { searchParams } = new URL(request.url);
  const pipelineId = searchParams.get('pipeline_id');

  if (!pipelineId) {
    return createApiErrorResponse('BAD_REQUEST', 'pipeline_id is required', 400, correlationId);
  }

  const analytics = await getPipelineAnalytics(pipelineId);

  if (!analytics) {
    return createApiErrorResponse('NOT_FOUND', 'Pipeline not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: analytics,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
