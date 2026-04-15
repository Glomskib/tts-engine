'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw,
  Shield, Zap, Activity, Eye, ChevronRight, ExternalLink,
  RotateCcw, UserCheck, Ban, Bot, Trophy,
  Flame, HeartPulse, Layers, AlertCircle, Skull, Radio,
} from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';

// ── Types matching ops-engine output ──────────────────────────────────────────

interface Insight {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  lane: string | null;
  action: string | null;
}

interface SystemHealth {
  verdict: 'healthy' | 'degraded' | 'ineffective' | 'critical';
  reason: string;
  signals: string[];
}

interface StaleTask {
  id: string;
  title: string;
  assigned_agent: string;
  lane: string | null;
  status: string;
  stale_since_minutes: number;
  is_revenue_critical: boolean;
  priority: number;
}

interface InterventionItem {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  category: string;
  source_type: string | null;
  source_id: string | null;
  lane: string | null;
  status: string;
  created_at: string;
}

interface LaneSummary {
  lane: string;
  queued: number;
  executing: number;
  stale: number;
  blocked: number;
  completed_today: number;
  failed_today: number;
  last_meaningful_action: string | null;
}

interface AgentEff {
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

interface TrustSignals {
  proof_backed_completion_pct: number;
  stale_recovery_pct: number;
  avg_time_to_claim_minutes: number | null;
  avg_time_to_complete_minutes: number | null;
  blocked_resolved_rate_pct: number;
}

interface MorningBrief {
  overnight_failures: { id: string; agent_id: string; action: string; error: string | null; ts: string }[];
  stale_items: StaleTask[];
  top_priorities: { id: string; title: string; lane: string | null; priority: number; is_revenue_critical: boolean }[];
  sessions_needing_refresh: { service: string; last_success: string | null; status: string }[];
  agents_no_proof_since_yesterday: string[];
}

interface TodaysWin {
  id: string;
  title: string;
  lane: string | null;
  completed_at: string;
  proof_summary: string | null;
  proof_url: string | null;
  assigned_agent: string;
}

interface IntegrationHealth {
  service_name: string;
  status: string;
  last_check_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  error_count_24h: number;
}

interface BlockedTask {
  id: string;
  title: string;
  assigned_agent: string;
  lane: string | null;
  blocked_reason: string | null;
  is_revenue_critical: boolean;
  priority: number;
}

interface OpsSummary {
  system_health: SystemHealth;
  insights: Insight[];
  morning_brief: MorningBrief;
  needs_me_count: number;
  intervention_queue: InterventionItem[];
  lane_summaries: LaneSummary[];
  agent_effectiveness: AgentEff[];
  stale_tasks: StaleTask[];
  blocked_tasks: BlockedTask[];
  proofless_completions: { id: string; title: string }[];
  todays_wins: TodaysWin[];
  trust_signals: TrustSignals;
  integration_health: IntegrationHealth[];
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
  }
}

function agentStatusColor(status: string): string {
  switch (status) {
    case 'producing': return 'text-emerald-400';
    case 'idle': return 'text-zinc-400';
    case 'stale': return 'text-amber-400';
    case 'failing': return 'text-red-400';
    default: return 'text-zinc-600';
  }
}

function agentStatusDot(status: string): string {
  switch (status) {
    case 'producing': return 'bg-emerald-400';
    case 'idle': return 'bg-zinc-500';
    case 'stale': return 'bg-amber-400';
    case 'failing': return 'bg-red-400';
    default: return 'bg-zinc-700';
  }
}

function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

const verdictConfig: Record<string, { color: string; bg: string; border: string; icon: React.ElementType; pulse: boolean }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', icon: Skull, pulse: true },
  ineffective: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Flame, pulse: true },
  degraded: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle, pulse: false },
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle, pulse: false },
};

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, pulse }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 ${pulse ? 'ring-1 ring-red-500/40' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <div className={`text-xl font-bold ${color === 'text-zinc-400' ? 'text-white' : color}`}>{value}</div>
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ title, icon: Icon, count, color = 'text-zinc-400' }: {
  title: string;
  icon: React.ElementType;
  count?: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-4 h-4 ${color}`} />
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{count}</span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-6 text-center text-zinc-600 text-sm">{message}</div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CommandCenterDashboard() {
  const [data, setData] = useState<OpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'needs_me' | 'client'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/command-center/ops-summary');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch ops summary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function quickAction(payload: Record<string, string>) {
    setActionLoading(payload.action + (payload.task_id || payload.intervention_id || ''));
    try {
      const res = await fetch('/api/admin/command-center/quick-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Quick action failed:', err);
    } finally {
      setActionLoading(null);
    }
  }

  const kpis = data?.kpis;
  const mb = data?.morning_brief;
  const ts = data?.trust_signals;
  const sh = data?.system_health;
  const insights = data?.insights || [];
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  const warningInsights = insights.filter(i => i.severity === 'warning');

  return (
    <div className="space-y-5">
      <CCSubnav />

      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER — System Verdict + Controls
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Mission Control</h2>
          {sh && (
            (() => {
              const vc = verdictConfig[sh.verdict] || verdictConfig.healthy;
              const VIcon = vc.icon;
              return (
                <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${vc.bg} ${vc.color} border ${vc.border} rounded-md ${vc.pulse ? 'animate-pulse' : ''}`}>
                  <VIcon className="w-3.5 h-3.5" />
                  {sh.verdict.toUpperCase()}
                </span>
              );
            })()
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('all')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                view === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setView('needs_me')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1 ${
                view === 'needs_me' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Needs Me
              {(data?.needs_me_count ?? 0) > 0 && (
                <span className="w-4 h-4 flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full">
                  {data?.needs_me_count}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('client')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1 ${
                view === 'client' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Eye className="w-3 h-3" />
              Client
            </button>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* System verdict reason — full-width banner when not healthy */}
      {sh && sh.verdict !== 'healthy' && (
        <div className={`rounded-lg border ${verdictConfig[sh.verdict]?.border || 'border-zinc-700'} ${verdictConfig[sh.verdict]?.bg || 'bg-zinc-900/50'} px-4 py-3`}>
          <div className={`text-sm font-medium ${verdictConfig[sh.verdict]?.color || 'text-zinc-300'} mb-1`}>{sh.reason}</div>
          <div className="flex flex-wrap gap-2">
            {sh.signals.map((s, i) => (
              <span key={i} className="text-[10px] text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          INTELLIGENCE — Critical/Warning Insights (always visible)
         ═══════════════════════════════════════════════════════════════════════ */}
      {criticalInsights.length > 0 && (
        <div className="space-y-2">
          {criticalInsights.map(insight => (
            <div key={insight.id} className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-2.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-red-300">{insight.message}</div>
                {insight.action && <div className="text-xs text-red-400/60 mt-0.5">{insight.action}</div>}
              </div>
              {insight.lane && <span className="text-[10px] text-zinc-500">{insight.lane}</span>}
            </div>
          ))}
        </div>
      )}

      {warningInsights.length > 0 && (
        <div className="space-y-1.5">
          {warningInsights.map(insight => (
            <div key={insight.id} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2 flex items-start gap-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-amber-300/90">{insight.message}</div>
                {insight.action && <div className="text-xs text-amber-400/50 mt-0.5">{insight.action}</div>}
              </div>
              {insight.lane && <span className="text-[10px] text-zinc-500">{insight.lane}</span>}
            </div>
          ))}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <KpiCard
          label="Needs Me"
          value={kpis?.human_actions_needed ?? '--'}
          icon={UserCheck}
          color={(kpis?.human_actions_needed ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}
          pulse={(kpis?.human_actions_needed ?? 0) > 0}
        />
        <KpiCard label="Stale Jobs" value={kpis?.stale_jobs ?? '--'} icon={Clock} color={(kpis?.stale_jobs ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-400'} />
        <KpiCard label="Revenue Blocked" value={kpis?.blocked_revenue_jobs ?? '--'} icon={Ban} color={(kpis?.blocked_revenue_jobs ?? 0) > 0 ? 'text-red-400' : 'text-zinc-400'} />
        <KpiCard label="Done Today" value={kpis?.completed_today ?? '--'} icon={CheckCircle} color="text-emerald-400" />
        <KpiCard label="Failed Today" value={kpis?.failed_today ?? '--'} icon={XCircle} color={(kpis?.failed_today ?? 0) > 0 ? 'text-red-400' : 'text-zinc-400'} />
        <KpiCard label="Auto-Heals" value={kpis?.auto_heals_today ?? '--'} icon={Zap} color="text-teal-400" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          "NEEDS ME" VIEW — Consolidated action queue
         ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'needs_me' && data && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <SectionHeader title="Human Actions Required" icon={AlertTriangle} count={data.needs_me_count} color="text-red-400" />
            </div>
            {data.needs_me_count === 0 ? (
              <EmptyState message="Nothing needs your attention right now" />
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {data.intervention_queue.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${severityColor(item.severity)}`}>
                      {item.severity}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{item.title}</div>
                      {item.description && <div className="text-xs text-zinc-500 mt-0.5 truncate">{item.description}</div>}
                      <div className="flex items-center gap-2 mt-1">
                        {item.lane && <span className="text-[10px] text-zinc-600">{item.lane}</span>}
                        <span className="text-[10px] text-zinc-600">{timeAgo(item.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => quickAction({ action: 'resolve_intervention', intervention_id: item.id })}
                        disabled={actionLoading === 'resolve_intervention' + item.id}
                        className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => quickAction({ action: 'dismiss_intervention', intervention_id: item.id })}
                        disabled={actionLoading === 'dismiss_intervention' + item.id}
                        className="px-2 py-1 text-xs bg-zinc-700 text-zinc-400 hover:bg-zinc-600 rounded transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
                {data.stale_tasks.map(task => (
                  <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${task.is_revenue_critical ? severityColor('critical') : severityColor('medium')}`}>
                      stale
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{task.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        Stale for {task.stale_since_minutes}m &middot; {task.assigned_agent} &middot; {task.lane}
                      </div>
                    </div>
                    <button
                      onClick={() => quickAction({ action: 'reclaim_stale', task_id: task.id })}
                      disabled={actionLoading === 'reclaim_stale' + task.id}
                      className="px-2 py-1 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reclaim
                    </button>
                  </div>
                ))}
                {data.proofless_completions.map(task => (
                  <div key={`proof-${task.id}`} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${severityColor('medium')}`}>
                      no proof
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{task.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Completed without proof — verify or add proof</div>
                    </div>
                  </div>
                ))}
                {[...data.blocked_tasks].sort((a, b) => {
                  if (a.is_revenue_critical !== b.is_revenue_critical) return a.is_revenue_critical ? -1 : 1;
                  return a.priority - b.priority;
                }).map(task => (
                  <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${task.is_revenue_critical ? severityColor('critical') : severityColor('high')}`}>
                      blocked
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">
                        {task.title}
                        {task.is_revenue_critical && <span className="text-red-400 text-[10px] ml-1.5">$REV</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {task.blocked_reason || 'No reason given'} &middot; {task.assigned_agent}
                      </div>
                    </div>
                    <button
                      onClick={() => quickAction({ action: 'requeue', task_id: task.id })}
                      disabled={actionLoading === 'requeue' + task.id}
                      className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                    >
                      Requeue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          "ALL" VIEW — Decision → Control → Context hierarchy
         ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'all' && data && (
        <div className="space-y-5">

          {/* ╔══════════════════════════════════════════════════════════════════╗
              ║  DECISION LAYER — What needs action NOW                        ║
              ╚══════════════════════════════════════════════════════════════════╝ */}

          {/* Intervention Queue — actionable items first */}
          {data.intervention_queue.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-zinc-900/50">
              <div className="p-3 border-b border-zinc-800">
                <SectionHeader title="Intervention Queue" icon={AlertTriangle} count={data.intervention_queue.length} color="text-red-400" />
              </div>
              <div className="divide-y divide-zinc-800/50 max-h-64 overflow-y-auto">
                {data.intervention_queue.map(item => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${severityColor(item.severity)}`}>
                      {item.severity}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-200">{item.title}</span>
                      {item.lane && <span className="text-xs text-zinc-600 ml-2">{item.lane}</span>}
                    </div>
                    <span className="text-xs text-zinc-600">{timeAgo(item.created_at)}</span>
                    <button
                      onClick={() => quickAction({ action: 'resolve_intervention', intervention_id: item.id })}
                      className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => quickAction({ action: 'dismiss_intervention', intervention_id: item.id })}
                      className="px-2 py-1 text-xs bg-zinc-700 text-zinc-400 hover:bg-zinc-600 rounded transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stale + Blocked side by side */}
          {(data.stale_tasks.length > 0 || data.blocked_tasks.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <div className="p-3 border-b border-zinc-800">
                  <SectionHeader title="Stale Tasks" icon={Clock} count={data.stale_tasks.length} color="text-amber-400" />
                </div>
                {data.stale_tasks.length === 0 ? (
                  <EmptyState message="No stale tasks" />
                ) : (
                  <div className="divide-y divide-zinc-800/50 max-h-56 overflow-y-auto">
                    {data.stale_tasks.map(task => (
                      <div key={task.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-300 truncate">{task.title}</div>
                          <div className="text-xs text-zinc-600">
                            {task.assigned_agent} &middot; {task.stale_since_minutes}m stale &middot; {task.lane}
                          </div>
                        </div>
                        {task.is_revenue_critical && <span className="text-[10px] text-red-400 font-medium">$REV</span>}
                        <button
                          onClick={() => quickAction({ action: 'reclaim_stale', task_id: task.id })}
                          disabled={actionLoading === 'reclaim_stale' + task.id}
                          className="px-2 py-1 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded transition-colors"
                        >
                          Reclaim
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <div className="p-3 border-b border-zinc-800">
                  <SectionHeader title="Blocked Tasks" icon={Ban} count={data.blocked_tasks.length} color="text-red-400" />
                </div>
                {data.blocked_tasks.length === 0 ? (
                  <EmptyState message="Nothing blocked" />
                ) : (
                  <div className="divide-y divide-zinc-800/50 max-h-56 overflow-y-auto">
                    {data.blocked_tasks.map(task => (
                      <div key={task.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-300 truncate">{task.title}</div>
                          <div className="text-xs text-zinc-600">
                            {task.blocked_reason || 'No reason'} &middot; {task.assigned_agent}
                          </div>
                        </div>
                        {task.is_revenue_critical && <span className="text-[10px] text-red-400 font-medium">$REV</span>}
                        <button
                          onClick={() => quickAction({ action: 'requeue', task_id: task.id })}
                          disabled={actionLoading === 'requeue' + task.id}
                          className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                        >
                          Requeue
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ╔══════════════════════════════════════════════════════════════════╗
              ║  CONTROL LAYER — Lane health, agent status, integrations       ║
              ╚══════════════════════════════════════════════════════════════════╝ */}

          {/* Lane Health — with silence-is-dangerous coloring */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <SectionHeader title="Lane Health" icon={Layers} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                    <th className="px-4 py-2.5 text-left font-medium">Lane</th>
                    <th className="px-3 py-2.5 text-right font-medium">Queued</th>
                    <th className="px-3 py-2.5 text-right font-medium">Active</th>
                    <th className="px-3 py-2.5 text-right font-medium">Stale</th>
                    <th className="px-3 py-2.5 text-right font-medium">Blocked</th>
                    <th className="px-3 py-2.5 text-right font-medium">Done Today</th>
                    <th className="px-3 py-2.5 text-right font-medium">Failed</th>
                    <th className="px-3 py-2.5 text-right font-medium">Last Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data.lane_summaries.map(lane => {
                    const hasProblems = lane.stale > 0 || lane.blocked > 0;
                    // Silence = danger: lane has work but nothing completing and nothing active
                    const isSilent = lane.completed_today === 0 && lane.executing === 0 && (lane.queued > 0 || lane.blocked > 0);
                    const isDead = lane.completed_today === 0 && lane.executing === 0 && lane.queued === 0 && lane.stale === 0 && lane.blocked === 0;
                    return (
                      <tr key={lane.lane} className={`${
                        isSilent ? 'bg-red-500/[0.04]' :
                        hasProblems ? 'bg-amber-500/[0.03]' : ''
                      } hover:bg-zinc-800/30`}>
                        <td className="px-4 py-2.5 font-medium">
                          <span className={isDead ? 'text-zinc-600' : 'text-zinc-200'}>{lane.lane}</span>
                          {isSilent && <span className="ml-2 text-[10px] text-red-400/80 font-normal">SILENT</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-zinc-400">{lane.queued}</td>
                        <td className="px-3 py-2.5 text-right text-blue-400">{lane.executing}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={lane.stale > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-600'}>{lane.stale}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={lane.blocked > 0 ? 'text-red-400 font-semibold' : 'text-zinc-600'}>{lane.blocked}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={lane.completed_today > 0 ? 'text-emerald-400' : isSilent ? 'text-red-400/60' : 'text-zinc-600'}>
                            {lane.completed_today}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={lane.failed_today > 0 ? 'text-red-400' : 'text-zinc-600'}>{lane.failed_today}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-zinc-600 text-xs">{timeAgo(lane.last_meaningful_action)}</td>
                      </tr>
                    );
                  })}
                  {data.lane_summaries.length === 0 && (
                    <tr><td colSpan={8}><EmptyState message="No lane data" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agent Effectiveness */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <SectionHeader title="Agent Effectiveness" icon={Bot} count={data.agent_effectiveness.length} />
            </div>
            {data.agent_effectiveness.length === 0 ? (
              <EmptyState message="No agent data" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                      <th className="px-3 py-2.5 text-left font-medium">Status</th>
                      <th className="px-3 py-2.5 text-left font-medium">Current Task</th>
                      <th className="px-3 py-2.5 text-right font-medium">Heartbeat</th>
                      <th className="px-3 py-2.5 text-right font-medium">Last Proof</th>
                      <th className="px-3 py-2.5 text-right font-medium">Done</th>
                      <th className="px-3 py-2.5 text-right font-medium">Stale</th>
                      <th className="px-3 py-2.5 text-right font-medium">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {data.agent_effectiveness.map(agent => (
                      <tr key={agent.agent_id} className={`hover:bg-zinc-800/30 ${
                        agent.effective_status === 'failing' ? 'bg-red-500/[0.04]' :
                        agent.effective_status === 'stale' ? 'bg-amber-500/[0.03]' :
                        agent.effective_status === 'offline' ? 'bg-zinc-800/20' : ''
                      }`}>
                        <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{agent.agent_id}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${agentStatusDot(agent.effective_status)} ${
                              agent.effective_status === 'producing' ? 'animate-pulse' : ''
                            }`} />
                            <span className={`text-xs ${agentStatusColor(agent.effective_status)}`}>{agent.effective_status}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs truncate max-w-[180px]">{agent.current_task || '--'}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-zinc-500">{timeAgo(agent.last_heartbeat)}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-zinc-500">{timeAgo(agent.last_proof)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-400">{agent.completed_today}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={agent.stale_count > 0 ? 'text-amber-400' : 'text-zinc-600'}>{agent.stale_count}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-semibold ${healthColor(agent.health_score)}`}>{agent.health_score}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Integration Health */}
          {data.integration_health.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
              <div className="p-3 border-b border-zinc-800">
                <SectionHeader title="Integration Health" icon={HeartPulse} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                {data.integration_health.map(svc => (
                  <div key={svc.service_name} className={`flex items-center gap-2 ${
                    svc.status === 'down' ? 'bg-red-500/[0.06] px-2 py-1.5 rounded-lg border border-red-500/20' : ''
                  }`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      svc.status === 'healthy' ? 'bg-emerald-400' :
                      svc.status === 'degraded' ? 'bg-amber-400 animate-pulse' :
                      svc.status === 'down' ? 'bg-red-400 animate-pulse' : 'bg-zinc-600'
                    }`} />
                    <div>
                      <div className={`text-xs ${svc.status === 'down' ? 'text-red-300' : 'text-zinc-300'}`}>{svc.service_name}</div>
                      <div className="text-[10px] text-zinc-600">
                        {svc.status === 'down' ? 'DOWN' : svc.status} &middot; checked {timeAgo(svc.last_check_at)}
                        {svc.error_count_24h > 0 && <span className="text-amber-400/60 ml-1">({svc.error_count_24h} errs/24h)</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ╔══════════════════════════════════════════════════════════════════╗
              ║  CONTEXT LAYER — Morning brief, wins, trust                    ║
              ╚══════════════════════════════════════════════════════════════════╝ */}

          {/* Morning Brief */}
          {mb && (mb.overnight_failures.length > 0 || mb.stale_items.length > 0 || mb.sessions_needing_refresh.length > 0 || mb.agents_no_proof_since_yesterday.length > 0) && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <SectionHeader title="Morning Brief" icon={Eye} color="text-blue-400" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider mb-1.5 text-[10px] font-medium">Overnight Failures</div>
                  {mb.overnight_failures.length === 0 ? (
                    <div className="text-zinc-600">None</div>
                  ) : (
                    <div className="space-y-1">
                      {mb.overnight_failures.slice(0, 5).map(f => (
                        <div key={f.id} className="text-red-400">
                          <span className="font-mono">{f.agent_id}</span>
                          <span className="text-zinc-600 ml-1">{f.action}</span>
                        </div>
                      ))}
                      {mb.overnight_failures.length > 5 && (
                        <div className="text-zinc-600">+{mb.overnight_failures.length - 5} more</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider mb-1.5 text-[10px] font-medium">Top Priorities</div>
                  {mb.top_priorities.length === 0 ? (
                    <div className="text-zinc-600">No active priorities</div>
                  ) : (
                    <div className="space-y-1">
                      {mb.top_priorities.map(p => (
                        <div key={p.id} className="flex items-center gap-1">
                          {p.is_revenue_critical && <span className="text-red-400 text-[10px]">$</span>}
                          <span className="text-zinc-300 truncate">{p.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider mb-1.5 text-[10px] font-medium">Sessions</div>
                  {mb.sessions_needing_refresh.length === 0 ? (
                    <div className="text-emerald-600">All healthy</div>
                  ) : (
                    <div className="space-y-1">
                      {mb.sessions_needing_refresh.map(s => (
                        <div key={s.service} className="text-amber-400">
                          {s.service} <span className="text-zinc-600">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider mb-1.5 text-[10px] font-medium">No Proof Since Yesterday</div>
                  {mb.agents_no_proof_since_yesterday.length === 0 ? (
                    <div className="text-emerald-600">All agents producing proof</div>
                  ) : (
                    <div className="space-y-1">
                      {mb.agents_no_proof_since_yesterday.map(a => (
                        <div key={a} className="text-amber-400 font-mono">{a}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Today's Wins */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <SectionHeader title="Today's Wins" icon={Trophy} count={data.todays_wins.length} color="text-emerald-400" />
            </div>
            {data.todays_wins.length === 0 ? (
              <div className="py-8 text-center">
                <Radio className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
                <div className="text-sm text-zinc-600">No completions today yet</div>
                <div className="text-xs text-zinc-700 mt-1">Silence here means nothing is landing.</div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50 max-h-64 overflow-y-auto">
                {data.todays_wins.map(win => (
                  <div key={win.id} className="px-4 py-2.5 flex items-center gap-3">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{win.title}</div>
                      <div className="flex items-center gap-2 text-xs text-zinc-600 mt-0.5">
                        <span>{win.assigned_agent}</span>
                        {win.lane && <span>&middot; {win.lane}</span>}
                        <span>&middot; {timeAgo(win.completed_at)}</span>
                      </div>
                    </div>
                    {win.proof_summary && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">proof</span>
                    )}
                    {win.proof_url && (
                      <a href={win.proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {!win.proof_summary && !win.proof_url && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">no proof</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Proofless Completions Warning */}
          {data.proofless_completions.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">
                  {data.proofless_completions.length} task{data.proofless_completions.length > 1 ? 's' : ''} completed without proof
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.proofless_completions.slice(0, 5).map(t => (
                  <span key={t.id} className="text-xs text-amber-300/70 bg-amber-500/10 px-2 py-1 rounded">
                    {t.title}
                  </span>
                ))}
                {data.proofless_completions.length > 5 && (
                  <span className="text-xs text-zinc-500">+{data.proofless_completions.length - 5} more</span>
                )}
              </div>
            </div>
          )}

          {/* Trust Signals */}
          {ts && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <SectionHeader title="Trust Signals" icon={Shield} color="text-teal-400" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Proof-Backed %</div>
                  <div className={`text-lg font-bold ${ts.proof_backed_completion_pct >= 80 ? 'text-emerald-400' : ts.proof_backed_completion_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {ts.proof_backed_completion_pct}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Stale Recovery %</div>
                  <div className={`text-lg font-bold ${ts.stale_recovery_pct >= 70 ? 'text-emerald-400' : ts.stale_recovery_pct >= 40 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {ts.stale_recovery_pct}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Avg Claim Time</div>
                  <div className="text-lg font-bold text-zinc-300">
                    {ts.avg_time_to_claim_minutes !== null ? `${ts.avg_time_to_claim_minutes}m` : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Avg Complete Time</div>
                  <div className="text-lg font-bold text-zinc-300">
                    {ts.avg_time_to_complete_minutes !== null ? `${ts.avg_time_to_complete_minutes}m` : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Blocked Resolved %</div>
                  <div className={`text-lg font-bold ${ts.blocked_resolved_rate_pct >= 70 ? 'text-emerald-400' : ts.blocked_resolved_rate_pct >= 40 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {ts.blocked_resolved_rate_pct}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Nav */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { label: 'Campaigns', href: '/admin/command-center/projects' },
              { label: 'Agents', href: '/admin/command-center/agents' },
              { label: 'Ops Health', href: '/admin/command-center/ops-health' },
              { label: 'Finance', href: '/admin/command-center/finance' },
              { label: 'CRM', href: '/admin/command-center/crm' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
              >
                <span className="text-xs text-zinc-400">{item.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CLIENT VIEW — What a paying client would see (sanitized)
         ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'client' && data && (
        <div className="space-y-5">
          {/* Client-facing header */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Operations Status</h3>
              {sh && (
                (() => {
                  const vc = verdictConfig[sh.verdict] || verdictConfig.healthy;
                  const VIcon = vc.icon;
                  return (
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${vc.bg} ${vc.color} border ${vc.border} rounded-lg`}>
                      <VIcon className="w-4 h-4" />
                      System {sh.verdict === 'healthy' ? 'Operational' : sh.verdict === 'degraded' ? 'Partially Degraded' : sh.verdict === 'ineffective' ? 'Needs Attention' : 'Critical'}
                    </span>
                  );
                })()
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{kpis?.completed_today ?? 0}</div>
                <div className="text-xs text-zinc-500 mt-1">Completed Today</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{data.lane_summaries.filter(l => l.executing > 0).length}</div>
                <div className="text-xs text-zinc-500 mt-1">Active Lanes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-400">{data.agent_effectiveness.filter(a => a.effective_status === 'producing').length}/{data.agent_effectiveness.length}</div>
                <div className="text-xs text-zinc-500 mt-1">Agents Producing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-300">{data.integration_health.filter(i => i.status === 'healthy').length}/{data.integration_health.length}</div>
                <div className="text-xs text-zinc-500 mt-1">Integrations Healthy</div>
              </div>
            </div>
          </div>

          {/* Client wins — proof of work, no internal task titles */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <SectionHeader title="Delivered Today" icon={Trophy} count={data.todays_wins.length} color="text-emerald-400" />
            </div>
            {data.todays_wins.length === 0 ? (
              <EmptyState message="No deliverables yet today" />
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {data.todays_wins.map(win => (
                  <div key={win.id} className="px-4 py-3 flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{win.title}</div>
                      {win.proof_summary && (
                        <div className="text-xs text-zinc-500 mt-0.5">{win.proof_summary}</div>
                      )}
                    </div>
                    <span className="text-xs text-zinc-600">{timeAgo(win.completed_at)}</span>
                    {win.proof_url && (
                      <a href={win.proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Integration status — client-safe */}
          {data.integration_health.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
              <div className="p-3 border-b border-zinc-800">
                <SectionHeader title="Service Status" icon={HeartPulse} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
                {data.integration_health.map(svc => (
                  <div key={svc.service_name} className="flex items-center gap-2.5 py-1">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      svc.status === 'healthy' ? 'bg-emerald-400' :
                      svc.status === 'degraded' ? 'bg-amber-400 animate-pulse' :
                      svc.status === 'down' ? 'bg-red-400 animate-pulse' : 'bg-zinc-600'
                    }`} />
                    <span className="text-sm text-zinc-300">{svc.service_name}</span>
                    <span className={`text-xs ml-auto ${
                      svc.status === 'healthy' ? 'text-emerald-400' :
                      svc.status === 'degraded' ? 'text-amber-400' :
                      svc.status === 'down' ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {svc.status === 'healthy' ? 'Operational' : svc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trust metrics — client-safe */}
          {ts && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <SectionHeader title="Quality Metrics" icon={Shield} color="text-teal-400" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Proof-Backed Completions</div>
                  <div className={`text-xl font-bold ${ts.proof_backed_completion_pct >= 80 ? 'text-emerald-400' : ts.proof_backed_completion_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {ts.proof_backed_completion_pct}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Issue Recovery Rate</div>
                  <div className={`text-xl font-bold ${ts.stale_recovery_pct >= 70 ? 'text-emerald-400' : ts.stale_recovery_pct >= 40 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {ts.stale_recovery_pct}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Avg Completion Time</div>
                  <div className="text-xl font-bold text-zinc-300">
                    {ts.avg_time_to_complete_minutes !== null ? `${ts.avg_time_to_complete_minutes}m` : '--'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-zinc-600 text-center py-2">
            Client view preview &middot; This is what your clients see
          </div>
        </div>
      )}

      {/* Loading state */}
      {!data && loading && (
        <div className="py-20 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
          <div className="text-sm">Loading operational data...</div>
        </div>
      )}

      {/* No data state */}
      {!data && !loading && (
        <div className="py-20 text-center text-zinc-500">
          <Activity className="w-6 h-6 mx-auto mb-3" />
          <div className="text-sm">Failed to load. Check connection and try again.</div>
        </div>
      )}

      {/* Footer */}
      {data && (
        <div className="text-xs text-zinc-600 text-center">
          Last updated: {new Date(data.fetched_at).toLocaleTimeString()} &middot; auto-refreshes every 30s
        </div>
      )}
    </div>
  );
}
