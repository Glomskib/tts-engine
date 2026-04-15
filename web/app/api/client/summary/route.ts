/**
 * GET /api/client/summary
 *
 * Authenticated client endpoint. Returns only what a paying customer should see.
 * No agent IDs, no internal errors, no intervention details, no sensitive logs.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { computeOpsSummary } from '@/lib/command-center/ops-engine';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await getApiAuthContext(req);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const summary = await computeOpsSummary();

    const systemStatus: 'working' | 'needs_attention' =
      summary.system_health.verdict === 'healthy' || summary.system_health.verdict === 'degraded'
        ? 'working'
        : 'needs_attention';

    const clientSummary = {
      todays_wins: summary.todays_wins.map(w => ({
        title: w.title,
        completed_at: w.completed_at,
        proof_summary: w.proof_summary,
        lane: w.lane,
      })),
      completed_today: summary.kpis.completed_today,
      failed_today: summary.kpis.failed_today,
      system_status: systemStatus,
      simple_lane_summary: summary.lane_summaries.map(l => ({
        lane: l.lane,
        completed_today: l.completed_today,
        active: l.executing,
        issues: l.stale + l.blocked,
      })),
    };

    return NextResponse.json({ ok: true, data: clientSummary });
  } catch (err) {
    console.error('[api/client/summary] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
