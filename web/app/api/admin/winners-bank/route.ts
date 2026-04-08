import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { fetchWinners } from '@/lib/winners';

export const runtime = 'nodejs';

/**
 * GET /api/admin/winners-bank
 *
 * Phase 2: thin alias over `/api/winners` so legacy callers
 * (admin/brands page, api-docs page, CommandPalette) keep working.
 * Returns the winners list under both `data` and `winners` keys for
 * backwards compatibility with both calling conventions.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const sp = request.nextUrl.searchParams;
  const sourceType = sp.get('source_type') as 'generated' | 'external' | null;
  const winnerType = sp.get('winner_type') as 'script' | 'hook' | null;
  const category = sp.get('category') || undefined;
  const tag = sp.get('tag') || undefined;
  const sort = (sp.get('sort') || 'performance_score') as
    | 'performance_score'
    | 'views'
    | 'engagement'
    | 'recent';
  const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200);

  const { winners, error } = await fetchWinners(authContext.user.id, {
    sourceType: sourceType || undefined,
    winnerType: winnerType || undefined,
    category,
    tag,
    sort,
    limit,
  });

  if (error) {
    console.error(`[${correlationId}] /api/admin/winners-bank fetchWinners failed:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch winners', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: winners,
    winners,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
