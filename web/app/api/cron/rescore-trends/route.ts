/**
 * Cron: Rescore Trend Clusters
 *
 * Recomputes trend scores for all active clusters in each workspace.
 * Intended to run every 1-6 hours to keep velocity/recency current.
 *
 * Light operation: ~1 query per cluster for metrics + scoring.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { rescoreCluster } from '@/lib/opportunity-radar/trend-scoring';
import { checkAndSendFailureAlert } from '@/lib/ops/failure-alert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOG = '[cron/rescore-trends]';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // Get active clusters (not dismissed/actioned) with at least 1 signal
    const { data: clusters, error } = await supabaseAdmin
      .from('trend_clusters')
      .select('id')
      .in('status', ['new', 'hot', 'cooling'])
      .gt('signal_count', 0)
      .order('last_signal_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error(LOG, 'cluster fetch failed:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const total = clusters?.length ?? 0;
    let rescored = 0;
    let errors = 0;

    for (const cluster of clusters ?? []) {
      try {
        await rescoreCluster(cluster.id);
        rescored++;
      } catch (err) {
        errors++;
        console.error(LOG, `rescore failed for ${cluster.id}:`, err instanceof Error ? err.message : err);
      }
    }

    const duration_ms = Date.now() - startedAt;
    console.log(LOG, `done: ${rescored}/${total} rescored, ${errors} errors, ${duration_ms}ms`);

    return NextResponse.json({
      ok: true,
      total,
      rescored,
      errors,
      duration_ms,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(LOG, 'fatal:', errorMsg);
    await checkAndSendFailureAlert({
      source: 'rescore-trends',
      error: errorMsg,
      cooldownMinutes: 30,
      context: { route: '/api/cron/rescore-trends' },
    });
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
