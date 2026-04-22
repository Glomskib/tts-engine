/**
 * GET /api/public/ops-demo
 *
 * Unauthenticated endpoint returning a sanitized subset of the ops summary.
 * Safe for embedding on landing pages, sharing with prospects, or powering
 * a client-facing view.
 *
 * Excluded: morning brief internals, agent names, task titles, intervention
 * descriptions, proof URLs, lane names — anything that leaks business context.
 */
import { NextResponse } from 'next/server';
import { computeOpsSummary } from '@/lib/command-center/ops-engine';

export const runtime = 'nodejs';

// Cache for 60 seconds to avoid hammering the DB on public traffic
const CACHE_TTL_MS = 60_000;
let cachedResponse: { data: Record<string, unknown>; ts: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cachedResponse && now - cachedResponse.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, data: cachedResponse.data }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  }

  try {
    const summary = await computeOpsSummary();

    // Sanitize: only expose aggregate numbers and status verdicts
    const safeData = {
      system_health: {
        verdict: summary.system_health.verdict,
        // Redact reason text — it can contain internal context
      },
      kpis: {
        active_lanes: summary.lane_summaries.filter(l => l.executing > 0 || l.queued > 0).length,
        total_lanes: summary.lane_summaries.length,
        completed_today: summary.kpis.completed_today,
        failed_today: summary.kpis.failed_today,
        auto_heals_today: summary.kpis.auto_heals_today,
        stale_jobs: summary.kpis.stale_jobs,
      },
      agents: {
        total: summary.agent_effectiveness.length,
        producing: summary.agent_effectiveness.filter(a => a.effective_status === 'producing').length,
        idle: summary.agent_effectiveness.filter(a => a.effective_status === 'idle').length,
        failing: summary.agent_effectiveness.filter(a => a.effective_status === 'failing').length,
      },
      integrations: {
        total: summary.integration_health.length,
        healthy: summary.integration_health.filter(i => i.status === 'healthy').length,
        degraded: summary.integration_health.filter(i => i.status === 'degraded').length,
        down: summary.integration_health.filter(i => i.status === 'down').length,
      },
      trust: {
        proof_backed_pct: summary.trust_signals.proof_backed_completion_pct,
        stale_recovery_pct: summary.trust_signals.stale_recovery_pct,
      },
      insight_counts: {
        critical: summary.insights.filter(i => i.severity === 'critical').length,
        warning: summary.insights.filter(i => i.severity === 'warning').length,
        info: summary.insights.filter(i => i.severity === 'info').length,
      },
      wins_today: summary.todays_wins.length,
      fetched_at: summary.fetched_at,
    };

    cachedResponse = { data: safeData, ts: now };

    return NextResponse.json({ ok: true, data: safeData }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (err) {
    console.error('[api/public/ops-demo] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
