/**
 * Mission Control — Operational Engine
 *
 * Server-side utilities that compute real operational truth from DB state.
 * Used by the ops-summary API to power the Command Center dashboard.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Constants ────────────────────────────────────────────────────────────────

const LANES = ['FlashFlow', 'POD TikTok Shop', "Zebby's World", 'Making Miles Matter', 'OpenClaw'] as const;
export type Lane = (typeof LANES)[number];

const DEFAULT_STALE_MINUTES = 60;
const DEFAULT_SLA_MINUTES = 480; // 8 hours

// ── Types ────────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assigned_agent: string;
  status: string;
  priority: number;
  risk_tier: string;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  last_transition_at: string | null;
  stale_after_minutes: number | null;
  sla_minutes: number | null;
  escalation_level: number;
  requires_human_review: boolean;
  resolution_note: string | null;
  proof_summary: string | null;
  proof_url: string | null;
  output_count: number;
  is_revenue_critical: boolean;
  session_dependency: string | null;
  source_system: string | null;
  lane: string | null;
  blocked_reason: string | null;
  human_override: boolean;
  meta: Record<string, unknown>;
}

export interface AgentRunRow {
  id: string;
  agent_id: string;
  action: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  cost_usd: number;
  created_at: string;
}

export interface InterventionRow {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  category: string;
  source_type: string | null;
  source_id: string | null;
  lane: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationHealthRow {
  id: string;
  service_name: string;
  status: string;
  last_check_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  error_count_24h: number;
  success_count_24h: number;
  meta: Record<string, unknown>;
  updated_at: string;
}

export interface StaleTask {
  id: string;
  title: string;
  assigned_agent: string;
  lane: string | null;
  status: string;
  stale_since_minutes: number;
  is_revenue_critical: boolean;
  priority: number;
}

export interface SlaBreachedTask {
  id: string;
  title: string;
  assigned_agent: string;
  lane: string | null;
  sla_minutes: number;
  elapsed_minutes: number;
  overage_minutes: number;
  is_revenue_critical: boolean;
}

export interface LaneSummary {
  lane: string;
  queued: number;
  executing: number;
  stale: number;
  blocked: number;
  completed_today: number;
  failed_today: number;
  last_meaningful_action: string | null;
}

export interface AgentEffectiveness {
  agent_id: string;
  effective_status: 'producing' | 'idle' | 'stale' | 'failing' | 'offline';
  current_task: string | null;
  current_task_id: string | null;
  last_heartbeat: string | null;
  last_proof: string | null;
  completed_today: number;
  failed_today: number;
  stale_count: number;
  avg_cycle_time_minutes: number | null;
  health_score: number;
}

export interface TrustSignals {
  proof_backed_completion_pct: number;
  stale_recovery_pct: number;
  avg_time_to_claim_minutes: number | null;
  avg_time_to_complete_minutes: number | null;
  blocked_resolved_rate_pct: number;
}

export interface MorningBrief {
  overnight_failures: { id: string; agent_id: string; action: string; error: string | null; ts: string }[];
  stale_items: StaleTask[];
  top_priorities: { id: string; title: string; lane: string | null; priority: number; is_revenue_critical: boolean }[];
  sessions_needing_refresh: { service: string; last_success: string | null; status: string }[];
  agents_no_proof_since_yesterday: string[];
}

export interface TodaysWin {
  id: string;
  title: string;
  lane: string | null;
  completed_at: string;
  proof_summary: string | null;
  proof_url: string | null;
  assigned_agent: string;
}

export interface Insight {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  lane: string | null;
  action: string | null; // suggested next step
}

export type SystemVerdict = 'healthy' | 'degraded' | 'ineffective' | 'critical';

export interface SystemHealth {
  verdict: SystemVerdict;
  reason: string;
  signals: string[];
}

export interface OpsSummary {
  system_health: SystemHealth;
  insights: Insight[];
  morning_brief: MorningBrief;
  needs_me_count: number;
  intervention_queue: InterventionRow[];
  lane_summaries: LaneSummary[];
  agent_effectiveness: AgentEffectiveness[];
  stale_tasks: StaleTask[];
  blocked_tasks: TaskRow[];
  proofless_completions: TaskRow[];
  todays_wins: TodaysWin[];
  trust_signals: TrustSignals;
  integration_health: IntegrationHealthRow[];
  kpis: {
    human_actions_needed: number;
    stale_jobs: number;
    blocked_revenue_jobs: number;
    completed_today: number;
    failed_today: number;
    auto_heals_today: number;
  };
  system_alive_but_ineffective: boolean;
  fetched_at: string;
}

// ── Core Logic ───────────────────────────────────────────────────────────────

function minutesSince(ts: string | null): number {
  if (!ts) return Infinity;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

function isSinceYesterday6am(ts: string | null): boolean {
  if (!ts) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(6, 0, 0, 0);
  return new Date(ts).getTime() >= yesterday.getTime();
}

function resolveTaskLane(task: TaskRow, projectMap: Map<string, string>): string {
  if (task.lane) return task.lane;
  const projectName = projectMap.get(task.project_id) || '';
  if (projectName.toLowerCase().includes('flashflow') || projectName.toLowerCase().includes('platform')) return 'FlashFlow';
  if (projectName.toLowerCase().includes('tiktok') || projectName.toLowerCase().includes('ttshop') || projectName.toLowerCase().includes('content ops')) return 'POD TikTok Shop';
  if (projectName.toLowerCase().includes('zebby')) return "Zebby's World";
  if (projectName.toLowerCase().includes('hhh') || projectName.toLowerCase().includes('mmm') || projectName.toLowerCase().includes('making miles')) return 'Making Miles Matter';
  if (projectName.toLowerCase().includes('openclaw')) return 'OpenClaw';
  return 'Other';
}

export function computeStaleTasks(tasks: TaskRow[], projectMap: Map<string, string>): StaleTask[] {
  const now = Date.now();
  return tasks
    .filter(t => t.status === 'active' || t.status === 'queued')
    .filter(t => {
      const staleThreshold = (t.stale_after_minutes || DEFAULT_STALE_MINUTES) * 60000;
      const lastActivity = t.heartbeat_at || t.started_at || t.claimed_at || t.last_transition_at || t.updated_at;
      return lastActivity && (now - new Date(lastActivity).getTime()) > staleThreshold;
    })
    .map(t => {
      const lastActivity = t.heartbeat_at || t.started_at || t.claimed_at || t.last_transition_at || t.updated_at;
      return {
        id: t.id,
        title: t.title,
        assigned_agent: t.assigned_agent,
        lane: resolveTaskLane(t, projectMap),
        status: t.status,
        stale_since_minutes: minutesSince(lastActivity),
        is_revenue_critical: t.is_revenue_critical,
        priority: t.priority,
      };
    })
    .sort((a, b) => {
      if (a.is_revenue_critical !== b.is_revenue_critical) return a.is_revenue_critical ? -1 : 1;
      return a.priority - b.priority;
    });
}

export function computeSlaBreaches(tasks: TaskRow[]): SlaBreachedTask[] {
  return tasks
    .filter(t => (t.status === 'active' || t.status === 'queued') && t.sla_minutes)
    .filter(t => {
      const start = t.started_at || t.claimed_at || t.created_at;
      return minutesSince(start) > (t.sla_minutes || DEFAULT_SLA_MINUTES);
    })
    .map(t => {
      const start = t.started_at || t.claimed_at || t.created_at;
      const elapsed = minutesSince(start);
      return {
        id: t.id,
        title: t.title,
        assigned_agent: t.assigned_agent,
        lane: t.lane,
        sla_minutes: t.sla_minutes!,
        elapsed_minutes: elapsed,
        overage_minutes: elapsed - t.sla_minutes!,
        is_revenue_critical: t.is_revenue_critical,
      };
    })
    .sort((a, b) => b.overage_minutes - a.overage_minutes);
}

export function computeLaneSummaries(tasks: TaskRow[], projectMap: Map<string, string>): LaneSummary[] {
  const lanes = [...LANES, 'Other'] as string[];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  return lanes.map(lane => {
    const laneTasks = tasks.filter(t => resolveTaskLane(t, projectMap) === lane);
    const queued = laneTasks.filter(t => t.status === 'queued').length;
    const executing = laneTasks.filter(t => t.status === 'active').length;
    const blocked = laneTasks.filter(t => t.status === 'blocked').length;
    const completedToday = laneTasks.filter(t => t.status === 'done' && t.completed_at && t.completed_at >= todayIso).length;
    const failedToday = laneTasks.filter(t => t.status === 'killed' && t.updated_at >= todayIso).length;

    // stale = active tasks with no heartbeat beyond threshold
    const stale = laneTasks.filter(t => {
      if (t.status !== 'active') return false;
      const staleThreshold = (t.stale_after_minutes || DEFAULT_STALE_MINUTES) * 60000;
      const lastActivity = t.heartbeat_at || t.started_at || t.updated_at;
      return lastActivity && (Date.now() - new Date(lastActivity).getTime()) > staleThreshold;
    }).length;

    // last meaningful action
    const recentCompletions = laneTasks
      .filter(t => t.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
    const lastMeaningful = recentCompletions[0]?.completed_at || null;

    return { lane, queued, executing, stale, blocked, completed_today: completedToday, failed_today: failedToday, last_meaningful_action: lastMeaningful };
  }).filter(l => l.queued + l.executing + l.stale + l.blocked + l.completed_today + l.failed_today > 0 || LANES.includes(l.lane as Lane));
}

export function computeAgentEffectiveness(
  tasks: TaskRow[],
  runs: AgentRunRow[],
): AgentEffectiveness[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Collect all agent IDs from tasks and runs
  const agentIds = [...new Set([
    ...tasks.map(t => t.assigned_agent),
    ...runs.map(r => r.agent_id),
  ])].filter(Boolean);

  return agentIds.map(agentId => {
    const agentTasks = tasks.filter(t => t.assigned_agent === agentId);
    const agentRuns = runs.filter(r => r.agent_id === agentId);

    const completedToday = agentRuns.filter(r => r.status === 'completed' && r.created_at >= todayIso).length;
    const failedToday = agentRuns.filter(r => r.status === 'failed' && r.created_at >= todayIso).length;

    // Current task
    const activeTasks = agentTasks.filter(t => t.status === 'active');
    const currentTask = activeTasks[0]?.title || null;
    const currentTaskId = activeTasks[0]?.id || null;

    // Stale count
    const staleCount = agentTasks.filter(t => {
      if (t.status !== 'active') return false;
      const threshold = (t.stale_after_minutes || DEFAULT_STALE_MINUTES) * 60000;
      const last = t.heartbeat_at || t.started_at || t.updated_at;
      return last && (Date.now() - new Date(last).getTime()) > threshold;
    }).length;

    // Last heartbeat (most recent from tasks)
    const heartbeats = agentTasks
      .map(t => t.heartbeat_at)
      .filter(Boolean) as string[];
    const lastHeartbeat = heartbeats.sort().reverse()[0] || null;

    // Last proof
    const proofTasks = agentTasks
      .filter(t => t.proof_summary || t.proof_url)
      .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime());
    const lastProof = proofTasks[0]?.completed_at || proofTasks[0]?.updated_at || null;

    // Avg cycle time (from started_at to completed_at for done tasks)
    const cycleTimes = agentTasks
      .filter(t => t.status === 'done' && t.started_at && t.completed_at)
      .map(t => (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000);
    const avgCycleTime = cycleTimes.length > 0
      ? Math.round(cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length)
      : null;

    // Determine effective status
    let effectiveStatus: AgentEffectiveness['effective_status'] = 'offline';
    const recentRunCutoff = new Date(Date.now() - 3600000).toISOString(); // 1 hour
    const hasRecentRun = agentRuns.some(r => r.created_at >= recentRunCutoff);
    const hasRecentHeartbeat = lastHeartbeat && minutesSince(lastHeartbeat) < 30;

    if (staleCount > 0) {
      effectiveStatus = 'stale';
    } else if (failedToday > completedToday && failedToday > 0) {
      effectiveStatus = 'failing';
    } else if (completedToday > 0 || activeTasks.length > 0) {
      effectiveStatus = 'producing';
    } else if (hasRecentRun || hasRecentHeartbeat) {
      effectiveStatus = 'idle';
    }

    // Health score: 0-100
    const totalRuns = agentRuns.length;
    const successRuns = agentRuns.filter(r => r.status === 'completed').length;
    const successRate = totalRuns > 0 ? successRuns / totalRuns : 0;
    const stalePenalty = staleCount * 15;
    const failPenalty = failedToday * 10;
    const healthScore = Math.max(0, Math.min(100, Math.round(successRate * 100 - stalePenalty - failPenalty)));

    return {
      agent_id: agentId,
      effective_status: effectiveStatus,
      current_task: currentTask,
      current_task_id: currentTaskId,
      last_heartbeat: lastHeartbeat,
      last_proof: lastProof,
      completed_today: completedToday,
      failed_today: failedToday,
      stale_count: staleCount,
      avg_cycle_time_minutes: avgCycleTime,
      health_score: healthScore,
    };
  }).sort((a, b) => {
    const order = { producing: 0, stale: 1, failing: 2, idle: 3, offline: 4 };
    return (order[a.effective_status] ?? 5) - (order[b.effective_status] ?? 5);
  });
}

export function computeTrustSignals(tasks: TaskRow[]): TrustSignals {
  const doneTasks = tasks.filter(t => t.status === 'done');
  const proofBacked = doneTasks.filter(t => t.proof_summary || t.proof_url || t.human_override);
  const proofPct = doneTasks.length > 0 ? Math.round((proofBacked.length / doneTasks.length) * 100) : 0;

  // Stale recovery: tasks that were stale but then completed
  // Approximate: tasks with escalation_level > 0 that are done
  const staleRecovered = doneTasks.filter(t => t.escalation_level > 0);
  const totalEscalated = tasks.filter(t => t.escalation_level > 0);
  const staleRecoveryPct = totalEscalated.length > 0
    ? Math.round((staleRecovered.length / totalEscalated.length) * 100) : 0;

  // Avg time to claim (created_at -> claimed_at)
  const claimTimes = tasks
    .filter(t => t.claimed_at && t.created_at)
    .map(t => (new Date(t.claimed_at!).getTime() - new Date(t.created_at).getTime()) / 60000);
  const avgTimeToClaim = claimTimes.length > 0
    ? Math.round(claimTimes.reduce((s, v) => s + v, 0) / claimTimes.length) : null;

  // Avg time to complete (created_at -> completed_at)
  const completionTimes = doneTasks
    .filter(t => t.completed_at)
    .map(t => (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 60000);
  const avgTimeToComplete = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((s, v) => s + v, 0) / completionTimes.length) : null;

  // Blocked -> resolved rate
  const blockedTasks = tasks.filter(t => t.blocked_reason || t.status === 'blocked' || t.escalation_level > 0);
  const blockedResolved = blockedTasks.filter(t => t.status === 'done');
  const blockedResolvedPct = blockedTasks.length > 0
    ? Math.round((blockedResolved.length / blockedTasks.length) * 100) : 0;

  return {
    proof_backed_completion_pct: proofPct,
    stale_recovery_pct: staleRecoveryPct,
    avg_time_to_claim_minutes: avgTimeToClaim,
    avg_time_to_complete_minutes: avgTimeToComplete,
    blocked_resolved_rate_pct: blockedResolvedPct,
  };
}

export function computeMorningBrief(
  tasks: TaskRow[],
  runs: AgentRunRow[],
  staleTasks: StaleTask[],
  integrations: IntegrationHealthRow[],
  projectMap: Map<string, string>,
): MorningBrief {
  const yesterday6am = new Date();
  yesterday6am.setDate(yesterday6am.getDate() - 1);
  yesterday6am.setHours(6, 0, 0, 0);
  const cutoff = yesterday6am.toISOString();

  // Overnight failures
  const overnightFailures = runs
    .filter(r => r.status === 'failed' && r.created_at >= cutoff)
    .slice(0, 10)
    .map(r => ({
      id: r.id,
      agent_id: r.agent_id,
      action: r.action,
      error: null as string | null,
      ts: r.created_at,
    }));

  // Top 5 priorities
  const topPriorities = tasks
    .filter(t => t.status === 'queued' || t.status === 'active')
    .sort((a, b) => {
      if (a.is_revenue_critical !== b.is_revenue_critical) return a.is_revenue_critical ? -1 : 1;
      return a.priority - b.priority;
    })
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      title: t.title,
      lane: resolveTaskLane(t, projectMap),
      priority: t.priority,
      is_revenue_critical: t.is_revenue_critical,
    }));

  // Sessions needing refresh
  const sessionsNeedingRefresh = integrations
    .filter(i => i.status !== 'healthy')
    .map(i => ({
      service: i.service_name,
      last_success: i.last_success_at,
      status: i.status,
    }));

  // Agents with no proof since yesterday
  const agentIds = [...new Set(tasks.map(t => t.assigned_agent))].filter(Boolean);
  const agentsNoProof = agentIds.filter(agentId => {
    const agentTasks = tasks.filter(t => t.assigned_agent === agentId);
    const hasRecentProof = agentTasks.some(t =>
      (t.proof_summary || t.proof_url) && isSinceYesterday6am(t.completed_at || t.updated_at)
    );
    return !hasRecentProof;
  });

  return {
    overnight_failures: overnightFailures,
    stale_items: staleTasks.slice(0, 10),
    top_priorities: topPriorities,
    sessions_needing_refresh: sessionsNeedingRefresh,
    agents_no_proof_since_yesterday: agentsNoProof,
  };
}

export function computeTodaysWins(tasks: TaskRow[]): TodaysWin[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  return tasks
    .filter(t => t.status === 'done' && t.completed_at && t.completed_at >= todayIso)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
    .map(t => ({
      id: t.id,
      title: t.title,
      lane: t.lane,
      completed_at: t.completed_at!,
      proof_summary: t.proof_summary,
      proof_url: t.proof_url,
      assigned_agent: t.assigned_agent,
    }));
}

// ── Intelligence Layer ───────────────────────────────────────────────────────

export function computeInsights(
  laneSummaries: LaneSummary[],
  staleTasks: StaleTask[],
  blockedTasks: TaskRow[],
  agentEffectiveness: AgentEffectiveness[],
  integrations: IntegrationHealthRow[],
  todaysWins: TodaysWin[],
  trustSignals: TrustSignals,
): Insight[] {
  const insights: Insight[] = [];
  let insightId = 0;
  const next = () => `insight-${++insightId}`;

  // Lane-level intelligence
  for (const lane of laneSummaries) {
    if (lane.queued > 5 && lane.executing === 0) {
      insights.push({
        id: next(), severity: 'critical',
        message: `${lane.lane} has ${lane.queued} queued but 0 executing — pipeline stalled`,
        lane: lane.lane, action: 'Check agent availability or assign work',
      });
    }
    if (lane.stale > 0 && lane.completed_today === 0) {
      insights.push({
        id: next(), severity: 'warning',
        message: `${lane.lane} has ${lane.stale} stale task${lane.stale > 1 ? 's' : ''} and zero completions today`,
        lane: lane.lane, action: 'Reclaim stale tasks or investigate blockers',
      });
    }
    if (lane.blocked > 0 && lane.executing === 0 && lane.queued === 0) {
      insights.push({
        id: next(), severity: 'warning',
        message: `${lane.lane} is fully blocked — ${lane.blocked} task${lane.blocked > 1 ? 's' : ''} waiting on resolution`,
        lane: lane.lane, action: 'Unblock or reassign',
      });
    }
  }

  // Revenue-critical blocked tasks
  const revBlocked = blockedTasks.filter(t => t.is_revenue_critical);
  if (revBlocked.length > 0) {
    insights.push({
      id: next(), severity: 'critical',
      message: `${revBlocked.length} revenue-critical task${revBlocked.length > 1 ? 's' : ''} blocked — immediate attention needed`,
      lane: null, action: 'Unblock revenue tasks first',
    });
  }

  // Integration health
  const downIntegrations = integrations.filter(i => i.status === 'down');
  const degradedIntegrations = integrations.filter(i => i.status === 'degraded');
  for (const svc of downIntegrations) {
    insights.push({
      id: next(), severity: 'critical',
      message: `${svc.service_name} is DOWN — dependent workflows are blocked`,
      lane: null, action: `Refresh ${svc.service_name} session or check credentials`,
    });
  }
  for (const svc of degradedIntegrations) {
    insights.push({
      id: next(), severity: 'warning',
      message: `${svc.service_name} degraded — ${svc.error_count_24h} errors in 24h${svc.last_error ? `: ${svc.last_error}` : ''}`,
      lane: null, action: `Monitor ${svc.service_name} — may need intervention soon`,
    });
  }

  // Agent trust issues
  const staleAgents = agentEffectiveness.filter(a => a.effective_status === 'stale');
  const failingAgents = agentEffectiveness.filter(a => a.effective_status === 'failing');
  for (const agent of staleAgents) {
    const hrs = agent.last_proof ? Math.round(minutesSince(agent.last_proof) / 60) : null;
    insights.push({
      id: next(), severity: 'warning',
      message: `${agent.agent_id} has ${agent.stale_count} stale task${agent.stale_count > 1 ? 's' : ''}${hrs ? ` — no proof in ${hrs}h` : ''}`,
      lane: null, action: 'Reclaim tasks or check agent health',
    });
  }
  for (const agent of failingAgents) {
    insights.push({
      id: next(), severity: 'critical',
      message: `${agent.agent_id} is failing — ${agent.failed_today} failures vs ${agent.completed_today} completions today`,
      lane: null, action: 'Investigate failures or pause agent',
    });
  }

  // Silence is dangerous
  const totalCompletedToday = todaysWins.length;
  const totalActive = laneSummaries.reduce((s, l) => s + l.executing, 0);
  if (totalCompletedToday === 0 && totalActive > 0) {
    insights.push({
      id: next(), severity: 'warning',
      message: `${totalActive} task${totalActive > 1 ? 's' : ''} executing but zero completions today — system may be spinning`,
      lane: null, action: 'Check for stuck execution loops',
    });
  }
  if (totalCompletedToday === 0 && totalActive === 0) {
    const totalQueued = laneSummaries.reduce((s, l) => s + l.queued, 0);
    if (totalQueued > 0) {
      insights.push({
        id: next(), severity: 'warning',
        message: `${totalQueued} tasks queued but nothing executing and nothing completed — system is idle`,
        lane: null, action: 'Start work or check agent availability',
      });
    }
  }

  // Trust erosion
  if (trustSignals.proof_backed_completion_pct < 50 && trustSignals.proof_backed_completion_pct > 0) {
    insights.push({
      id: next(), severity: 'warning',
      message: `Only ${trustSignals.proof_backed_completion_pct}% of completions have proof — trust is eroding`,
      lane: null, action: 'Require proof on future completions',
    });
  }

  return insights.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
  });
}

export function computeSystemHealth(
  insights: Insight[],
  staleTasks: StaleTask[],
  blockedTasks: TaskRow[],
  agentEffectiveness: AgentEffectiveness[],
  integrations: IntegrationHealthRow[],
  todaysWins: TodaysWin[],
  runs: AgentRunRow[],
): SystemHealth {
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  const warningInsights = insights.filter(i => i.severity === 'warning');
  const downServices = integrations.filter(i => i.status === 'down');
  const failingAgents = agentEffectiveness.filter(a => a.effective_status === 'failing');
  const producingAgents = agentEffectiveness.filter(a => a.effective_status === 'producing');
  const hasRecentRuns = runs.length > 0;
  const hasProofToday = todaysWins.some(w => w.proof_summary || w.proof_url);

  const signals: string[] = [];

  if (downServices.length > 0) signals.push(`${downServices.length} integration${downServices.length > 1 ? 's' : ''} down`);
  if (failingAgents.length > 0) signals.push(`${failingAgents.length} agent${failingAgents.length > 1 ? 's' : ''} failing`);
  if (staleTasks.length > 0) signals.push(`${staleTasks.length} stale task${staleTasks.length > 1 ? 's' : ''}`);
  if (blockedTasks.length > 0) signals.push(`${blockedTasks.length} blocked`);
  if (producingAgents.length > 0) signals.push(`${producingAgents.length} agent${producingAgents.length > 1 ? 's' : ''} producing`);
  if (todaysWins.length > 0) signals.push(`${todaysWins.length} completed today`);
  if (hasProofToday) signals.push('proof-backed work landing');

  // Determine verdict
  if (criticalInsights.length >= 2 || downServices.length > 0 || failingAgents.length >= 2) {
    return { verdict: 'critical', reason: criticalInsights[0]?.message || 'Multiple critical issues detected', signals };
  }
  if (hasRecentRuns && !hasProofToday && staleTasks.length >= 3) {
    return { verdict: 'ineffective', reason: 'System is active but producing no verified results', signals };
  }
  if (criticalInsights.length > 0 || warningInsights.length >= 3 || staleTasks.length >= 2) {
    return { verdict: 'degraded', reason: warningInsights[0]?.message || criticalInsights[0]?.message || 'Multiple warnings', signals };
  }
  return { verdict: 'healthy', reason: 'All systems operating normally', signals };
}

// ── Main Aggregator ──────────────────────────────────────────────────────────

export async function computeOpsSummary(): Promise<OpsSummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const yesterday6am = new Date();
  yesterday6am.setDate(yesterday6am.getDate() - 1);
  yesterday6am.setHours(6, 0, 0, 0);
  const overnightCutoff = yesterday6am.toISOString();

  // Parallel fetch all data we need
  // Core tables (always exist)
  const [tasksRes, projectsRes, runsRes] = await Promise.all([
    supabaseAdmin.from('project_tasks').select('*').order('priority', { ascending: true }),
    supabaseAdmin.from('cc_projects').select('id, name, type'),
    supabaseAdmin.from('agent_runs').select('id, agent_id, action, status, started_at, ended_at, cost_usd, created_at').gte('created_at', overnightCutoff).order('created_at', { ascending: false }),
  ]);

  // New tables (may not exist pre-migration — fail gracefully)
  let interventionsRaw: InterventionRow[] = [];
  let integrationsRaw: IntegrationHealthRow[] = [];
  try {
    const { data } = await supabaseAdmin.from('intervention_queue').select('*').eq('status', 'open').order('created_at', { ascending: false });
    interventionsRaw = (data || []) as InterventionRow[];
  } catch { /* table may not exist yet */ }
  try {
    const { data } = await supabaseAdmin.from('integration_health').select('*');
    integrationsRaw = (data || []) as IntegrationHealthRow[];
  } catch { /* table may not exist yet */ }

  // Normalize tasks — fill defaults for new columns that may be null on old rows
  const tasks = (tasksRes.data || []).map((raw: Record<string, unknown>) => ({
    id: raw.id as string,
    project_id: raw.project_id as string,
    title: raw.title as string,
    description: (raw.description as string) || '',
    assigned_agent: (raw.assigned_agent as string) || '',
    status: (raw.status as string) || 'queued',
    priority: (raw.priority as number) ?? 99,
    risk_tier: (raw.risk_tier as string) || 'low',
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
    due_at: (raw.due_at as string) || null,
    claimed_at: (raw.claimed_at as string) || null,
    started_at: (raw.started_at as string) || null,
    completed_at: (raw.completed_at as string) || null,
    heartbeat_at: (raw.heartbeat_at as string) || null,
    last_transition_at: (raw.last_transition_at as string) || null,
    stale_after_minutes: (raw.stale_after_minutes as number) ?? DEFAULT_STALE_MINUTES,
    sla_minutes: (raw.sla_minutes as number) || null,
    escalation_level: (raw.escalation_level as number) ?? 0,
    requires_human_review: (raw.requires_human_review as boolean) ?? false,
    resolution_note: (raw.resolution_note as string) || null,
    proof_summary: (raw.proof_summary as string) || null,
    proof_url: (raw.proof_url as string) || null,
    output_count: (raw.output_count as number) ?? 0,
    is_revenue_critical: (raw.is_revenue_critical as boolean) ?? false,
    session_dependency: (raw.session_dependency as string) || null,
    source_system: (raw.source_system as string) || null,
    lane: (raw.lane as string) || null,
    blocked_reason: (raw.blocked_reason as string) || null,
    human_override: (raw.human_override as boolean) ?? false,
    meta: (raw.meta as Record<string, unknown>) || {},
  })) as TaskRow[];

  const projects = (projectsRes.data || []) as { id: string; name: string; type: string }[];
  const runs = (runsRes.data || []) as AgentRunRow[];
  const interventions = interventionsRaw;
  const integrations = integrationsRaw;

  // Build project ID -> name map
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  // Compute derived data
  const staleTasks = computeStaleTasks(tasks, projectMap);
  const laneSummaries = computeLaneSummaries(tasks, projectMap);
  const agentEffectiveness = computeAgentEffectiveness(tasks, runs);
  const trustSignals = computeTrustSignals(tasks);
  const morningBrief = computeMorningBrief(tasks, runs, staleTasks, integrations, projectMap);
  const todaysWins = computeTodaysWins(tasks);

  // Blocked tasks
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  // Proofless completions (done without proof and without human_override)
  const proofless = tasks.filter(t =>
    t.status === 'done' && !t.proof_summary && !t.proof_url && !t.human_override
  );

  // Blocked revenue-critical
  const blockedRevenueCritical = tasks.filter(t => t.status === 'blocked' && t.is_revenue_critical);

  // Completed today
  const completedToday = tasks.filter(t => t.status === 'done' && t.completed_at && t.completed_at >= todayIso);

  // Failed today
  const failedToday = runs.filter(r => r.status === 'failed' && r.created_at >= todayIso);

  // Auto-heals: interventions resolved today automatically
  let autoHealCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from('intervention_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .eq('resolved_by', 'system')
      .gte('resolved_at', todayIso);
    autoHealCount = count ?? 0;
  } catch {
    // Table may not exist yet pre-migration
  }

  // System alive but ineffective detection:
  // Agents are running (recent runs exist) but nothing is completing with proof
  const hasRecentActivity = runs.length > 0;
  const hasProofToday = completedToday.some(t => t.proof_summary || t.proof_url);
  const manyStale = staleTasks.length >= 3;
  const systemAliveButIneffective = hasRecentActivity && !hasProofToday && manyStale;

  // Intelligence layer
  const insights = computeInsights(laneSummaries, staleTasks, blockedTasks, agentEffectiveness, integrations, todaysWins, trustSignals);
  const systemHealth = computeSystemHealth(insights, staleTasks, blockedTasks, agentEffectiveness, integrations, todaysWins, runs);

  // Needs me = open interventions + tasks requiring human review + stale tasks + blocked tasks + proofless completions
  const needsHumanReview = tasks.filter(t => t.requires_human_review && t.status !== 'done' && t.status !== 'killed');
  const needsMeCount = interventions.length + needsHumanReview.length + staleTasks.length + blockedTasks.length + proofless.length;

  return {
    system_health: systemHealth,
    insights,
    morning_brief: morningBrief,
    needs_me_count: needsMeCount,
    intervention_queue: interventions,
    lane_summaries: laneSummaries,
    agent_effectiveness: agentEffectiveness,
    stale_tasks: staleTasks,
    blocked_tasks: blockedTasks,
    proofless_completions: proofless,
    todays_wins: todaysWins,
    trust_signals: trustSignals,
    integration_health: integrations,
    kpis: {
      human_actions_needed: needsMeCount,
      stale_jobs: staleTasks.length,
      blocked_revenue_jobs: blockedRevenueCritical.length,
      completed_today: completedToday.length,
      failed_today: failedToday.length,
      auto_heals_today: autoHealCount ?? 0,
    },
    system_alive_but_ineffective: systemAliveButIneffective,
    fetched_at: new Date().toISOString(),
  };
}
