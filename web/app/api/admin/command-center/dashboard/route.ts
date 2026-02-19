/**
 * GET /api/admin/command-center/dashboard
 *
 * Owner-only. Returns stats, activity, agent runs, initiatives, and telemetry breakdowns.
 * Supports ?initiative_id= for filtering.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const initiativeFilter = searchParams.get('initiative_id');

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  try {
    // Resolve project_ids for initiative filtering
    let projectIds: string[] | null = null;
    if (initiativeFilter) {
      const { data: initProjects } = await supabaseAdmin
        .from('cc_projects')
        .select('id')
        .eq('initiative_id', initiativeFilter);
      projectIds = (initProjects || []).map((p) => p.id);
    }

    // Helper to optionally filter by project_ids
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function applyProjectFilter<T>(q: T): T {
      if (projectIds && projectIds.length > 0) {
        return (q as any).in('project_id', projectIds);
      }
      return q;
    }

    const [
      spendTodayRes,
      spendWeekRes,
      spendMonthRes,
      reqsTodayRes,
      reqsWeekRes,
      errorsTodayRes,
      activeTasksRes,
      blockedTasksRes,
      ideasQueuedRes,
      ideasResearchedRes,
      taskEventsRes,
      artifactsRes,
      agentRunsRes,
      initiativesRes,
      ideasProcessedRes,
      // Telemetry: 7d usage events with full detail for breakdowns
      telemetryRes,
      // Failed agent runs 7d
      failedRunsRes,
    ] = await Promise.all([
      applyProjectFilter(supabaseAdmin.from('usage_events').select('cost_usd').gte('ts', todayStart)),
      applyProjectFilter(supabaseAdmin.from('usage_events').select('cost_usd').gte('ts', sevenDaysAgo.toISOString())),
      applyProjectFilter(supabaseAdmin.from('usage_events').select('cost_usd').gte('ts', monthAgo)),
      applyProjectFilter(supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', todayStart)),
      applyProjectFilter(supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', sevenDaysAgo.toISOString())),
      applyProjectFilter(supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', todayStart).eq('status', 'error')),
      supabaseAdmin.from('project_tasks').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('project_tasks').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
      supabaseAdmin.from('ideas').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabaseAdmin.from('ideas').select('id', { count: 'exact', head: true }).eq('status', 'researched').gte('last_processed_at', dayAgo),
      supabaseAdmin.from('task_events').select('id, ts, agent_id, event_type, payload, task_id').order('ts', { ascending: false }).limit(30),
      supabaseAdmin.from('idea_artifacts').select('id, ts, artifact_type, content_md, idea_id').order('ts', { ascending: false }).limit(30),
      supabaseAdmin.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('initiatives').select('id, slug, title, type, status').eq('status', 'active'),
      supabaseAdmin.from('ideas').select('id, title, score, last_processed_at').eq('status', 'researched').order('last_processed_at', { ascending: false }).limit(10),
      // 7d usage events for telemetry breakdowns
      applyProjectFilter(supabaseAdmin.from('usage_events').select('agent_id, model, cost_usd, latency_ms, ts').gte('ts', sevenDaysAgo.toISOString())),
      // Failed agent runs in last 7d
      supabaseAdmin.from('agent_runs').select('agent_id, action, created_at').eq('status', 'failed').gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    const sumCost = (rows: { cost_usd: number }[] | null) =>
      (rows || []).reduce((sum, r) => sum + Number(r.cost_usd), 0);

    // ── 7-day cost trend ─────────────────────────────────────────
    const { data: trendRaw } = await applyProjectFilter(
      supabaseAdmin.from('usage_events').select('cost_usd, ts').gte('ts', sevenDaysAgo.toISOString()).order('ts', { ascending: true })
    );

    const costByDay: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo.getTime() + (i + 1) * 86400000);
      costByDay[d.toISOString().slice(0, 10)] = 0;
    }
    for (const row of trendRaw || []) {
      const day = new Date(row.ts).toISOString().slice(0, 10);
      if (costByDay[day] !== undefined) {
        costByDay[day] += Number(row.cost_usd);
      }
    }
    const costTrend7d = Object.entries(costByDay).map(([day, cost]) => ({
      day,
      cost: Math.round(cost * 100) / 100,
    }));

    // ── Telemetry breakdowns ─────────────────────────────────────
    type TelRow = { agent_id: string; model: string; cost_usd: number; latency_ms: number | null };
    const telRows = (telemetryRes.data || []) as TelRow[];

    // spend_by_agent_7d
    const agentMap: Record<string, { cost: number; count: number }> = {};
    for (const r of telRows) {
      if (!agentMap[r.agent_id]) agentMap[r.agent_id] = { cost: 0, count: 0 };
      agentMap[r.agent_id].cost += Number(r.cost_usd);
      agentMap[r.agent_id].count++;
    }
    const spendByAgent7d = Object.entries(agentMap)
      .map(([agent, v]) => ({ agent, cost: Math.round(v.cost * 10000) / 10000, count: v.count }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // spend_by_model_7d
    const modelMap: Record<string, { cost: number; count: number }> = {};
    for (const r of telRows) {
      if (!modelMap[r.model]) modelMap[r.model] = { cost: 0, count: 0 };
      modelMap[r.model].cost += Number(r.cost_usd);
      modelMap[r.model].count++;
    }
    const spendByModel7d = Object.entries(modelMap)
      .map(([model, v]) => ({ model, cost: Math.round(v.cost * 10000) / 10000, count: v.count }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // latency_p95_by_model_7d
    const latencyByModel: Record<string, number[]> = {};
    for (const r of telRows) {
      if (r.latency_ms != null) {
        if (!latencyByModel[r.model]) latencyByModel[r.model] = [];
        latencyByModel[r.model].push(Number(r.latency_ms));
      }
    }
    const latencyP95ByModel7d = Object.entries(latencyByModel)
      .map(([model, vals]) => {
        vals.sort((a, b) => a - b);
        const idx = Math.floor(vals.length * 0.95);
        return { model, p95_ms: vals[idx] ?? 0, samples: vals.length };
      })
      .sort((a, b) => b.p95_ms - a.p95_ms)
      .slice(0, 10);

    // failures_by_agent_7d
    type FailRow = { agent_id: string };
    const failRows = (failedRunsRes.data || []) as FailRow[];
    const failMap: Record<string, number> = {};
    for (const r of failRows) {
      failMap[r.agent_id] = (failMap[r.agent_id] || 0) + 1;
    }
    const failuresByAgent7d = Object.entries(failMap)
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);

    // ── Activity merge ───────────────────────────────────────────
    type RawTaskEvent = { id: string; ts: string; agent_id: string; event_type: string; payload: Record<string, unknown>; task_id: string };
    type RawArtifact = { id: string; ts: string; artifact_type: string; content_md: string; idea_id: string };

    const taskEvents = ((taskEventsRes.data || []) as RawTaskEvent[]).map((e) => ({
      id: e.id,
      ts: e.ts,
      source: 'task',
      agent_id: e.agent_id,
      type: e.event_type,
      title: `Task ${e.task_id.slice(0, 8)}`,
      detail: e.payload,
    }));

    const artifacts = ((artifactsRes.data || []) as RawArtifact[]).map((a) => ({
      id: a.id,
      ts: a.ts,
      source: 'idea',
      agent_id: 'system',
      type: a.artifact_type,
      title: `Idea ${a.idea_id.slice(0, 8)}`,
      detail: { content_preview: a.content_md?.slice(0, 200) },
    }));

    const activity = [...taskEvents, ...artifacts]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 30);

    return NextResponse.json({
      ok: true,
      data: {
        stats: {
          spend: {
            today: Math.round(sumCost(spendTodayRes.data) * 100) / 100,
            week: Math.round(sumCost(spendWeekRes.data) * 100) / 100,
            month: Math.round(sumCost(spendMonthRes.data) * 100) / 100,
          },
          cost_trend_7d: costTrend7d,
          requests: {
            today: reqsTodayRes.count ?? 0,
            week: reqsWeekRes.count ?? 0,
          },
          errors_today: errorsTodayRes.count ?? 0,
          active_tasks: activeTasksRes.count ?? 0,
          blocked_tasks: blockedTasksRes.count ?? 0,
          ideas_queued: ideasQueuedRes.count ?? 0,
          ideas_researched_24h: ideasResearchedRes.count ?? 0,
        },
        telemetry: {
          spend_by_agent_7d: spendByAgent7d,
          spend_by_model_7d: spendByModel7d,
          latency_p95_by_model_7d: latencyP95ByModel7d,
          failures_by_agent_7d: failuresByAgent7d,
        },
        activity,
        agent_runs: agentRunsRes.data || [],
        initiatives: initiativesRes.data || [],
        ideas_processed: (ideasProcessedRes.data || []).map((i: Record<string, unknown>) => ({
          id: i.id,
          title: i.title,
          score: i.score,
          last_processed_at: i.last_processed_at,
        })),
      },
    });
  } catch (err) {
    console.error('[api/admin/command-center/dashboard] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
