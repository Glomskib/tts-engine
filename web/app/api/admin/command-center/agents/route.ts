/**
 * GET /api/admin/command-center/agents
 *
 * Owner-only. Returns agent scoreboard with efficiency metrics + recent runs.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  try {
    // Fetch runs for all three time windows + recent runs + usage events for cost enrichment
    const [runsToday, runs7dRes, runs30dRes, recentRunsRes, usageByAgentRes] = await Promise.all([
      supabaseAdmin
        .from('agent_runs')
        .select('agent_id, action, status, started_at, ended_at, cost_usd')
        .gte('created_at', todayStart),
      supabaseAdmin
        .from('agent_runs')
        .select('agent_id, action, status, started_at, ended_at, cost_usd')
        .gte('created_at', weekAgo),
      supabaseAdmin
        .from('agent_runs')
        .select('agent_id, action, status, started_at, ended_at, cost_usd')
        .gte('created_at', monthAgo),
      supabaseAdmin
        .from('agent_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      // Get usage_events cost grouped by agent for enrichment
      supabaseAdmin
        .from('usage_events')
        .select('agent_id, cost_usd')
        .gte('ts', monthAgo),
    ]);

    const today = runsToday.data || [];
    const runs7d = runs7dRes.data || [];
    const runs30d = runs30dRes.data || [];

    // Build usage-event cost map by agent (fallback cost source)
    const usageCostByAgent: Record<string, { today: number; week: number; month: number }> = {};
    for (const evt of usageByAgentRes.data || []) {
      const aid = evt.agent_id || 'unknown';
      if (!usageCostByAgent[aid]) usageCostByAgent[aid] = { today: 0, week: 0, month: 0 };
      usageCostByAgent[aid].month += Number(evt.cost_usd) || 0;
    }

    // Build scoreboard per agent
    const agentIds = [...new Set([...today, ...runs7d, ...runs30d].map((r) => r.agent_id))];

    const scoreboard = agentIds.map((agentId) => {
      const agentToday = today.filter((r) => r.agent_id === agentId);
      const agent7d = runs7d.filter((r) => r.agent_id === agentId);
      const agent30d = runs30d.filter((r) => r.agent_id === agentId);

      // Cost from agent_runs
      const costToday = agentToday.reduce((s, r) => s + Number(r.cost_usd), 0);
      const cost7d = agent7d.reduce((s, r) => s + Number(r.cost_usd), 0);
      const cost30d = agent30d.reduce((s, r) => s + Number(r.cost_usd), 0);

      // Runs ok / fail
      const runsOk7d = agent7d.filter((r) => r.status === 'completed').length;
      const runsFail7d = agent7d.filter((r) => r.status === 'failed').length;
      const runsOk30d = agent30d.filter((r) => r.status === 'completed').length;
      const runsFail30d = agent30d.filter((r) => r.status === 'failed').length;

      // Tasks completed (completed runs count as tasks done)
      const tasksCompleted7d = runsOk7d;
      const tasksCompleted30d = runsOk30d;

      // Avg duration (30d)
      const completedWithDuration = agent30d.filter((r) => r.started_at && r.ended_at);
      const avgDuration = completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, r) =>
          sum + (new Date(r.ended_at!).getTime() - new Date(r.started_at!).getTime()), 0) / completedWithDuration.length
        : null;

      // Cost per run (30d)
      const totalRuns30d = agent30d.length;
      const costPerRun = totalRuns30d > 0 ? cost30d / totalRuns30d : 0;

      // Cost per task (30d, only completed)
      const costPerTask = tasksCompleted30d > 0 ? cost30d / tasksCompleted30d : 0;

      // Throughput: tasks completed per day (30d window)
      const throughputPerDay = tasksCompleted30d / 30;

      // Success rate
      const totalFinished30d = runsOk30d + runsFail30d;
      const successRate = totalFinished30d > 0 ? runsOk30d / totalFinished30d : 0;

      // Efficiency score = (tasks_completed / max(total_cost, 0.01)) * success_rate
      const efficiencyScore = (tasksCompleted30d / Math.max(cost30d, 0.01)) * successRate;

      // Most common action
      const actionCounts: Record<string, number> = {};
      for (const r of agent30d) {
        actionCounts[r.action] = (actionCounts[r.action] || 0) + 1;
      }
      const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      return {
        agent_id: agentId,
        total_runs_7d: agent7d.length,
        total_runs_30d: totalRuns30d,
        tasks_completed_7d: tasksCompleted7d,
        tasks_completed_30d: tasksCompleted30d,
        avg_duration_ms: avgDuration ? Math.round(avgDuration) : null,
        cost_today: Math.round(costToday * 10000) / 10000,
        cost_7d: Math.round(cost7d * 10000) / 10000,
        cost_30d: Math.round(cost30d * 10000) / 10000,
        cost_per_run: Math.round(costPerRun * 10000) / 10000,
        cost_per_task: Math.round(costPerTask * 10000) / 10000,
        runs_ok_7d: runsOk7d,
        runs_fail_7d: runsFail7d,
        runs_ok_30d: runsOk30d,
        runs_fail_30d: runsFail30d,
        success_rate: Math.round(successRate * 1000) / 10, // percentage
        throughput_per_day: Math.round(throughputPerDay * 100) / 100,
        efficiency_score: Math.round(efficiencyScore * 100) / 100,
        most_common_action: topAction,
      };
    }).sort((a, b) => b.efficiency_score - a.efficiency_score);

    return NextResponse.json({
      ok: true,
      data: {
        scoreboard,
        recent_runs: recentRunsRes.data || [],
      },
    });
  } catch (err) {
    console.error('[api/admin/command-center/agents] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
