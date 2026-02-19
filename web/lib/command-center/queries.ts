/**
 * Command Center – Server-side data queries.
 *
 * These are used by admin pages (server components) to fetch data
 * directly from Supabase without going through API routes.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { DashboardStats } from './types';

/**
 * Compute spend by querying usage_events directly.
 */
async function getSpend(startTs: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('usage_events')
    .select('cost_usd')
    .gte('ts', startTs);

  if (error || !data) return 0;
  return data.reduce((sum: number, row: { cost_usd: number }) => sum + Number(row.cost_usd), 0);
}

/**
 * Get dashboard stats for the command center overview.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();

  const [
    spendToday,
    spendWeek,
    spendMonth,
    reqsTodayRes,
    reqsWeekRes,
    errorsTodayRes,
    activeTasksRes,
    blockedTasksRes,
    ideasQueuedRes,
    ideasResearchedRes,
  ] = await Promise.all([
    getSpend(todayStart),
    getSpend(weekAgo),
    getSpend(monthAgo),
    supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', todayStart),
    supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', weekAgo),
    supabaseAdmin.from('usage_events').select('id', { count: 'exact', head: true }).gte('ts', todayStart).eq('status', 'error'),
    supabaseAdmin.from('project_tasks').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseAdmin.from('project_tasks').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
    supabaseAdmin.from('ideas').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    supabaseAdmin.from('ideas').select('id', { count: 'exact', head: true }).eq('status', 'researched').gte('last_processed_at', dayAgo),
  ]);

  return {
    spend: {
      today: spendToday,
      week: spendWeek,
      month: spendMonth,
    },
    requests: {
      today: reqsTodayRes.count ?? 0,
      week: reqsWeekRes.count ?? 0,
    },
    errors_today: errorsTodayRes.count ?? 0,
    active_tasks: activeTasksRes.count ?? 0,
    blocked_tasks: blockedTasksRes.count ?? 0,
    ideas_queued: ideasQueuedRes.count ?? 0,
    ideas_researched_24h: ideasResearchedRes.count ?? 0,
  };
}

/**
 * Get recent activity: task_events + idea_artifacts merged, sorted by ts.
 */
export async function getRecentActivity(limit = 30) {
  const [taskEventsRes, artifactsRes] = await Promise.all([
    supabaseAdmin
      .from('task_events')
      .select('id, ts, agent_id, event_type, payload, task_id')
      .order('ts', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('idea_artifacts')
      .select('id, ts, artifact_type, content_md, idea_id')
      .order('ts', { ascending: false })
      .limit(limit),
  ]);

  type TaskEventRow = { id: string; ts: string; agent_id: string; event_type: string; payload: Record<string, unknown>; task_id: string };
  type ArtifactRow = { id: string; ts: string; artifact_type: string; content_md: string; idea_id: string };

  const events = ((taskEventsRes.data || []) as TaskEventRow[]).map((e) => ({
    id: e.id,
    ts: e.ts,
    source: 'task' as const,
    agent_id: e.agent_id,
    type: e.event_type,
    title: `Task ${e.task_id.slice(0, 8)}`,
    detail: e.payload,
  }));

  const artifacts = ((artifactsRes.data || []) as ArtifactRow[]).map((a) => ({
    id: a.id,
    ts: a.ts,
    source: 'idea' as const,
    agent_id: 'system',
    type: a.artifact_type,
    title: `Idea ${a.idea_id.slice(0, 8)}`,
    detail: { content_preview: a.content_md?.slice(0, 200) },
  }));

  return [...events, ...artifacts]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, limit);
}

/**
 * Get usage rollups grouped for table display.
 */
export async function getUsageRollups(from: string, to: string) {
  const { data, error } = await supabaseAdmin
    .from('usage_daily_rollups')
    .select('*')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: false });

  if (error) {
    console.error('[queries] getUsageRollups error:', error);
    return [];
  }
  return data || [];
}

/**
 * Get raw usage events for drilldown.
 */
export async function getUsageEvents(filters: {
  from?: string;
  to?: string;
  provider?: string;
  model?: string;
  agent_id?: string;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from('usage_events')
    .select('*')
    .order('ts', { ascending: false });

  if (filters.from) query = query.gte('ts', `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte('ts', `${filters.to}T23:59:59Z`);
  if (filters.provider) query = query.eq('provider', filters.provider);
  if (filters.model) query = query.eq('model', filters.model);
  if (filters.agent_id) query = query.eq('agent_id', filters.agent_id);
  query = query.limit(filters.limit ?? 200);

  const { data, error } = await query;
  if (error) {
    console.error('[queries] getUsageEvents error:', error);
    return [];
  }
  return data || [];
}
