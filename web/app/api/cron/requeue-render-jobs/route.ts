/**
 * GET /api/cron/requeue-render-jobs
 *
 * Runs every 5 minutes via Vercel cron.
 * Re-queues render jobs that were claimed but never started (node crashed)
 * and jobs stuck in processing for too long (node froze mid-render).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify Vercel cron signature
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // Re-queue stale claimed jobs (never started within 5 min)
  const { data: staleResult } = await supabaseAdmin
    .rpc('requeue_stale_render_jobs');
  results.stale_requeued = staleResult ?? 0;

  // Re-queue stuck processing jobs (no progress for 30 min)
  const { data: stuckResult } = await supabaseAdmin
    .rpc('requeue_stuck_render_jobs');
  results.stuck_requeued = stuckResult ?? 0;

  // Mark offline nodes (no heartbeat in 2 minutes) — informational only
  const { data: offlineNodes } = await supabaseAdmin
    .from('render_nodes')
    .select('node_id, last_seen')
    .lt('last_seen', new Date(Date.now() - 2 * 60 * 1000).toISOString());

  results.offline_nodes = (offlineNodes || []).map((n: any) => n.node_id);

  if ((results.stale_requeued as number) > 0 || (results.stuck_requeued as number) > 0) {
    console.log('[requeue-render-jobs]', results);
  }

  return NextResponse.json({ ok: true, ...results, ts: new Date().toISOString() });
}
