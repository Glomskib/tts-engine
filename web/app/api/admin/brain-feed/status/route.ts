/**
 * GET /api/admin/brain-feed/status
 *
 * Returns brain dispatcher health: last run stats, source, errors.
 * No secrets exposed.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isGitHubFeedConfigured } from '@/lib/brain-feed/github';
import { vaultAccessible } from '@/Automation/brain_dispatcher';

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

  // Fetch last 5 brain-dispatch runs
  const { data: runs } = await supabaseAdmin
    .from('ff_cron_runs')
    .select('id, job, status, finished_at, error, meta')
    .like('job', 'brain-dispatch%')
    .order('finished_at', { ascending: false })
    .limit(5);

  const lastRun = runs?.[0] || null;
  const lastMeta = (lastRun?.meta || {}) as Record<string, unknown>;

  // Source availability
  const localAvailable = await vaultAccessible();
  const githubConfigured = isGitHubFeedConfigured();

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    data: {
      sources: {
        local: localAvailable,
        github: githubConfigured,
        active: localAvailable ? 'local' : githubConfigured ? 'github' : 'none',
      },
      last_run: lastRun
        ? {
            job: lastRun.job,
            status: lastRun.status,
            finished_at: lastRun.finished_at,
            scanned: lastMeta.scanned_count ?? null,
            dispatched: lastMeta.dispatched_count ?? null,
            skipped: lastMeta.skipped_count ?? null,
            error: lastRun.error || null,
          }
        : null,
      recent_runs: (runs || []).map((r) => ({
        job: r.job,
        status: r.status,
        finished_at: r.finished_at,
      })),
    },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
