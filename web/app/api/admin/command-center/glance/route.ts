/**
 * Mission Control — Glance Dashboard API
 *
 * Powers the 2-second-glance landing at /admin/command-center.
 * Returns three zones:
 *   Zone 1 (strip):    money in/out/net today, tasks shipped/in-flight/needs-you
 *   Zone 2 (agents):   per-agent card with weekly ROI, tasks done, cost, current task, sparkline
 *   Zone 3 (plate):    operator_feed items (Bolt-relayed emails, calendar, approvals, flags)
 *
 * All queries are best-effort — a missing table returns zeros/empty, never 500.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StripZone {
  money_in_today_cents: number;
  money_out_today_cents: number;
  net_today_cents: number;
  tasks_shipped_today: number;
  tasks_in_flight: number;
  tasks_needing_you: number;
}

interface AgentCard {
  agent_id: string;
  current_task: string | null;
  current_task_id: string | null;
  status: 'producing' | 'idle' | 'stale' | 'failing' | 'offline';
  tasks_done_week: number;
  cost_week_usd: number;
  expected_value_week_usd: number | null;
  realized_value_week_usd: number | null;
  roi_week: number | null; // realized / cost, null if not enough data
  cost_sparkline_7d: number[]; // daily cost, 7 entries (oldest → newest)
}

interface FeedItem {
  id: string;
  kind: string;
  urgency: string;
  title: string;
  one_line: string | null;
  action_url: string | null;
  action_label: string | null;
  lane: string | null;
  source_agent: string | null;
  created_at: string;
}

interface GlanceResponse {
  strip: StripZone;
  agents: AgentCard[];
  plate: FeedItem[];
  generated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekAgoUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Zone 1: the strip ─────────────────────────────────────────────────────────

async function computeStrip(): Promise<StripZone> {
  const todayStart = startOfTodayUtc();
  const out: StripZone = {
    money_in_today_cents: 0,
    money_out_today_cents: 0,
    net_today_cents: 0,
    tasks_shipped_today: 0,
    tasks_in_flight: 0,
    tasks_needing_you: 0,
  };

  // Finance: money in/out today
  try {
    const { data } = await supabaseAdmin
      .from('finance_transactions')
      .select('direction, amount_cents')
      .gte('occurred_at', todayStart);
    if (data) {
      for (const tx of data as Array<{ direction: string; amount_cents: number }>) {
        if (tx.direction === 'in') out.money_in_today_cents += tx.amount_cents || 0;
        else if (tx.direction === 'out') out.money_out_today_cents += tx.amount_cents || 0;
      }
      out.net_today_cents = out.money_in_today_cents - out.money_out_today_cents;
    }
  } catch { /* non-fatal */ }

  // Tasks shipped today (completed)
  try {
    const { count } = await supabaseAdmin
      .from('project_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'done')
      .gte('completed_at', todayStart);
    out.tasks_shipped_today = count || 0;
  } catch { /* non-fatal */ }

  // Tasks in flight (queued + active)
  try {
    const { count } = await supabaseAdmin
      .from('project_tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'active']);
    out.tasks_in_flight = count || 0;
  } catch { /* non-fatal */ }

  // Tasks needing human review or blocked
  try {
    const { count } = await supabaseAdmin
      .from('project_tasks')
      .select('id', { count: 'exact', head: true })
      .or('requires_human_review.eq.true,status.eq.blocked');
    out.tasks_needing_you = count || 0;
  } catch { /* non-fatal */ }

  return out;
}

// ── Zone 2: agent scoreboard ──────────────────────────────────────────────────

async function computeAgents(): Promise<AgentCard[]> {
  const weekStart = weekAgoUtc();

  // Get set of agents that have been active in the last 7 days
  const agentIds = new Set<string>();

  try {
    const { data: taskAgents } = await supabaseAdmin
      .from('project_tasks')
      .select('assigned_agent')
      .gte('updated_at', weekStart)
      .not('assigned_agent', 'is', null);
    for (const row of (taskAgents || []) as Array<{ assigned_agent: string }>) {
      if (row.assigned_agent) agentIds.add(row.assigned_agent);
    }
  } catch { /* non-fatal */ }

  try {
    const { data: runAgents } = await supabaseAdmin
      .from('agent_runs')
      .select('agent_id')
      .gte('started_at', weekStart)
      .not('agent_id', 'is', null);
    for (const row of (runAgents || []) as Array<{ agent_id: string }>) {
      if (row.agent_id) agentIds.add(row.agent_id);
    }
  } catch { /* non-fatal */ }

  const results: AgentCard[] = [];

  for (const agentId of agentIds) {
    const card: AgentCard = {
      agent_id: agentId,
      current_task: null,
      current_task_id: null,
      status: 'idle',
      tasks_done_week: 0,
      cost_week_usd: 0,
      expected_value_week_usd: null,
      realized_value_week_usd: null,
      roi_week: null,
      cost_sparkline_7d: new Array(7).fill(0),
    };

    // Current active task
    try {
      const { data: current } = await supabaseAdmin
        .from('project_tasks')
        .select('id, title, status')
        .eq('assigned_agent', agentId)
        .in('status', ['active', 'queued'])
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (current) {
        card.current_task = (current as { title: string }).title;
        card.current_task_id = (current as { id: string }).id;
        card.status = (current as { status: string }).status === 'active' ? 'producing' : 'idle';
      }
    } catch { /* non-fatal */ }

    // Tasks done + values this week (best-effort; columns may not exist yet)
    try {
      const { data: doneTasks } = await supabaseAdmin
        .from('project_tasks')
        .select('expected_value_usd, realized_value_usd')
        .eq('assigned_agent', agentId)
        .eq('status', 'done')
        .gte('completed_at', weekStart);
      const tasks = (doneTasks || []) as Array<{
        expected_value_usd: number | null;
        realized_value_usd: number | null;
      }>;
      card.tasks_done_week = tasks.length;
      let expSum = 0;
      let expCount = 0;
      let realSum = 0;
      let realCount = 0;
      for (const t of tasks) {
        if (t.expected_value_usd != null) { expSum += Number(t.expected_value_usd); expCount++; }
        if (t.realized_value_usd != null) { realSum += Number(t.realized_value_usd); realCount++; }
      }
      card.expected_value_week_usd = expCount > 0 ? expSum : null;
      card.realized_value_week_usd = realCount > 0 ? realSum : null;
    } catch { /* non-fatal — columns may not exist */ }

    // Cost this week + daily sparkline
    try {
      const { data: runs } = await supabaseAdmin
        .from('agent_runs')
        .select('cost_usd, started_at')
        .eq('agent_id', agentId)
        .gte('started_at', weekStart);
      const rows = (runs || []) as Array<{ cost_usd: number | null; started_at: string }>;
      let total = 0;
      const daily: number[] = new Array(7).fill(0);
      const now = Date.now();
      for (const r of rows) {
        const c = Number(r.cost_usd || 0);
        total += c;
        const daysAgo = Math.floor((now - new Date(r.started_at).getTime()) / 86400000);
        const idx = 6 - Math.min(6, Math.max(0, daysAgo));
        daily[idx] += c;
      }
      card.cost_week_usd = Math.round(total * 100) / 100;
      card.cost_sparkline_7d = daily.map((v) => Math.round(v * 100) / 100);
    } catch { /* non-fatal */ }

    // ROI = realized / cost (only when both present)
    if (card.realized_value_week_usd != null && card.cost_week_usd > 0) {
      card.roi_week = Math.round((card.realized_value_week_usd / card.cost_week_usd) * 100) / 100;
    }

    results.push(card);
  }

  // Sort: producing first, then by tasks_done desc, then by cost desc
  results.sort((a, b) => {
    const statusRank: Record<string, number> = { producing: 0, idle: 1, stale: 2, failing: 3, offline: 4 };
    const s = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (s !== 0) return s;
    if (a.tasks_done_week !== b.tasks_done_week) return b.tasks_done_week - a.tasks_done_week;
    return b.cost_week_usd - a.cost_week_usd;
  });

  return results.slice(0, 12); // cap for the glance view
}

// ── Zone 3: the plate ─────────────────────────────────────────────────────────

async function computePlate(): Promise<FeedItem[]> {
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from('mc_operator_feed')
      .select('id, kind, urgency, title, one_line, action_url, action_label, lane, source_agent, created_at, expires_at')
      .is('dismissed_at', null)
      .is('acted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(20);

    const items = (data || []) as Array<FeedItem & { expires_at: string | null }>;
    // Sort by urgency rank, then recency
    const urgRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    items.sort((a, b) => {
      const u = (urgRank[a.urgency] ?? 9) - (urgRank[b.urgency] ?? 9);
      if (u !== 0) return u;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return items;
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const blocked = await requireOwner(request);
  if (blocked) return blocked;

  const [strip, agents, plate] = await Promise.all([
    computeStrip(),
    computeAgents(),
    computePlate(),
  ]);

  const body: GlanceResponse = {
    strip,
    agents,
    plate,
    generated_at: new Date().toISOString(),
  };

  return NextResponse.json(body);
}
