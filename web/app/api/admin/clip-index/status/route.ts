/**
 * GET /api/admin/clip-index/status
 *
 * Returns diagnostic info for the Overlay Clip Index:
 *   - candidate counts by status
 *   - last publish time
 *   - recent cron run history
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

  // Use individual counts since Supabase JS doesn't support GROUP BY natively
  const statuses = ['new', 'analyzing', 'analyzed', 'published', 'rejected', 'error'] as const;
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count } = await supabaseAdmin
      .from('ff_clip_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    counts[status] = count || 0;
  }

  // Total index entries
  const { count: indexCount } = await supabaseAdmin
    .from('ff_clip_index')
    .select('*', { count: 'exact', head: true });

  // Last publish time
  const { data: lastPublished } = await supabaseAdmin
    .from('ff_clip_index')
    .select('published_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  // Recent cron runs for clip-discover and clip-analyze
  const { data: recentRuns } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('id, job, status, finished_at, error, meta')
    .or('job.eq.clip-discover,job.eq.clip-analyze')
    .order('finished_at', { ascending: false })
    .limit(10);

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: {
      candidates: counts,
      index_total: indexCount || 0,
      last_publish: lastPublished?.published_at || null,
      recent_runs: (recentRuns || []).map((r) => ({
        job: r.job,
        status: r.status,
        finished_at: r.finished_at,
        error: r.error || null,
        meta: r.meta,
      })),
    },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
