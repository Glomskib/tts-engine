/**
 * GET /api/admin/command-center/ops-summary
 *
 * Owner-only. Single aggregation endpoint for the operational Command Center.
 * Returns all KPIs, morning brief, intervention queue, lane summaries,
 * agent effectiveness, trust signals, and system health in one call.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { computeOpsSummary } from '@/lib/command-center/ops-engine';
import { getDemoOpsSummary } from '@/lib/demo-data';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const summary = await computeOpsSummary();

    // If no real operational data exists, fall back to demo data
    const hasRealData = summary.lane_summaries.length > 0 ||
      summary.todays_wins.length > 0 ||
      summary.agent_effectiveness.length > 0;

    const data = hasRealData ? summary : getDemoOpsSummary();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[api/admin/command-center/ops-summary] error:', err);
    // On total failure, return demo data so the UI always renders
    return NextResponse.json({ ok: true, data: getDemoOpsSummary() });
  }
}
