'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign, Activity, AlertTriangle, ListTodo,
  Lightbulb, TrendingUp, ChevronRight, RefreshCw,
  Zap, Target, Bot, Handshake, HeartPulse,
  Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import type { PipelineHealth } from '@/lib/command-center/types';
import InitiativeFilter from './_components/InitiativeFilter';
import CommandCenterShell from './_components/CommandCenterShell';
import { CCPageHeader, CCSection, CCStatCard } from './_components/ui';
import CCBadge from './_components/ui/CCBadge';

interface DashboardData {
  spend: { today: number; week: number; month: number };
  cost_trend_7d: { day: string; cost: number }[];
  requests: { today: number; week: number };
  errors_today: number;
  active_tasks: number;
  blocked_tasks: number;
  ideas_queued: number;
  ideas_researched_24h: number;
}

interface ActivityItem {
  id: string;
  ts: string;
  source: 'task' | 'idea';
  agent_id: string;
  type: string;
  title: string;
  detail: Record<string, unknown>;
}

interface AgentRun {
  id: string;
  agent_id: string;
  action: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model_used: string | null;
  related_type: string | null;
  created_at: string;
}

interface Initiative {
  id: string;
  title: string;
  type: string;
  status: string;
}

interface ProcessedIdea {
  id: string;
  title: string;
  score: number | null;
  last_processed_at: string;
}

interface TelemetryData {
  spend_by_agent_7d: { agent: string; cost: number; count: number }[];
  spend_by_model_7d: { model: string; cost: number; count: number }[];
  latency_p95_by_model_7d: { model: string; p95_ms: number; samples: number }[];
  failures_by_agent_7d: { agent: string; count: number }[];
}

interface CronRun {
  id: string;
  job: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  meta: Record<string, unknown>;
}

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CostTrendBar({ trend }: { trend: { day: string; cost: number }[] }) {
  const maxCost = Math.max(...trend.map((t) => t.cost), 0.01);
  return (
    <div className="flex items-end gap-1 h-16">
      {trend.map((t) => (
        <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-emerald-500/60 rounded-t"
            style={{ height: `${Math.max((t.cost / maxCost) * 100, 4)}%` }}
            title={`${t.day}: ${formatCurrency(t.cost)}`}
          />
          <span className="text-[9px] text-zinc-600">{t.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CommandCenterDashboard() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [processedIdeas, setProcessedIdeas] = useState<ProcessedIdea[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [crmStats, setCrmStats] = useState<{ deals: number; weighted_value: number } | null>(null);
  const [initiativeId, setInitiativeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [phDegraded, setPhDegraded] = useState(false);
  const [phRefreshing, setPhRefreshing] = useState(false);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (initiativeId) params.set('initiative_id', initiativeId);
      const res = await fetch(`/api/admin/command-center/dashboard?${params}`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.data.stats);
        setActivity(json.data.activity);
        setAgentRuns(json.data.agent_runs || []);
        setInitiatives(json.data.initiatives || []);
        setProcessedIdeas(json.data.ideas_processed || []);
        setTelemetry(json.data.telemetry || null);
        setCrmStats(json.data.crm || null);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelineHealth = async () => {
    setPhRefreshing(true);
    try {
      const res = await fetch('/api/admin/command-center/pipeline-health');
      if (res.ok) {
        const json = await res.json();
        setPipelineHealth(json.data);
        setPhDegraded(false);
      } else {
        setPhDegraded(true);
      }
    } catch {
      setPhDegraded(true);
    } finally {
      setPhRefreshing(false);
    }
  };

  const fetchCronHeartbeat = async () => {
    try {
      const res = await fetch('/api/admin/command-center/cron-heartbeat');
      if (res.ok) {
        const json = await res.json();
        setCronRuns(json.data || []);
      }
    } catch {
      // silent — dashboard card just shows stale data
    }
  };

  useEffect(() => { fetchData(); }, [initiativeId]);

  useEffect(() => {
    fetchPipelineHealth();
    fetchCronHeartbeat();
    const id = setInterval(() => {
      fetchPipelineHealth();
      fetchCronHeartbeat();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const QUICK_NAV = [
    { label: 'API Usage', href: '/admin/command-center/usage', icon: Activity },
    { label: 'Projects & Tasks', href: '/admin/command-center/projects', icon: ListTodo },
    { label: 'Idea Dump', href: '/admin/command-center/ideas', icon: Lightbulb },
    { label: 'Finance', href: '/admin/command-center/finance', icon: DollarSign },
    { label: 'Agent Scoreboard', href: '/admin/command-center/agents', icon: Zap },
    { label: 'FinOps', href: '/admin/command-center/finops', icon: TrendingUp },
    { label: 'CRM Pipeline', href: '/admin/command-center/crm', icon: Handshake },
  ];

  return (
    <CommandCenterShell>
      <CCPageHeader
        title="Overview"
        subtitle="FlashFlow Command Center"
        loading={loading}
        onRefresh={fetchData}
        actions={<InitiativeFilter value={initiativeId} onChange={setInitiativeId} />}
      />

      {/* Row 1: Health — Pipeline + Cron Heartbeat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Health */}
        <CCSection
          title="Pipeline Health"
          description="Agent queue status"
          actions={
            <button
              onClick={fetchPipelineHealth}
              disabled={phRefreshing}
              className="p-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Refresh pipeline health"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${phRefreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        >
          {pipelineHealth ? (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                <span className="text-lg font-semibold text-zinc-300">{pipelineHealth.queued_count}</span>
                <span className="text-xs text-zinc-500">queued</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-lg font-semibold text-blue-400">{pipelineHealth.executing_count}</span>
                <span className="text-xs text-zinc-500">executing</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 ${pipelineHealth.blocked_count > 0 ? 'text-red-400' : 'text-zinc-600'}`} />
                <span className={`text-lg font-semibold ${pipelineHealth.blocked_count > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{pipelineHealth.blocked_count}</span>
                <span className="text-xs text-zinc-500">blocked</span>
              </div>
              <span className="text-xs text-zinc-600 ml-auto">Updated {timeAgo(pipelineHealth.last_updated)}</span>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{phDegraded ? 'MC unreachable' : 'Loading...'}</p>
          )}
          {phDegraded && pipelineHealth && (
            <p className="text-xs text-amber-500 mt-2">MC unreachable — showing last snapshot</p>
          )}
        </CCSection>

        {/* Cron Heartbeat */}
        <CCSection
          title="Cron Heartbeat"
          description="Recent orchestrator runs"
          actions={
            <button
              onClick={fetchCronHeartbeat}
              className="p-1 rounded hover:bg-zinc-800 transition-colors"
              title="Refresh heartbeat"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          }
        >
          {cronRuns.length > 0 ? (
            <div className="space-y-2">
              {cronRuns.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center gap-3 text-sm">
                  {run.status === 'ok' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <CCBadge variant={run.status}>{run.status}</CCBadge>
                  <span className="text-xs text-zinc-500 font-mono">{run.job}</span>
                  <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">
                    {timeAgo(run.started_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No heartbeat data yet</p>
          )}
        </CCSection>
      </div>

      {/* Row 2: Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CCStatCard
          label="Spend Today"
          value={stats ? formatCurrency(stats.spend.today) : '--'}
          sub={stats ? `7d: ${formatCurrency(stats.spend.week)} | 30d: ${formatCurrency(stats.spend.month)}` : undefined}
          icon={DollarSign}
          color="text-emerald-400"
          href="/admin/command-center/usage"
        />
        <CCStatCard
          label="Requests Today"
          value={stats?.requests.today ?? '--'}
          sub={stats ? `7d: ${stats.requests.week.toLocaleString()}` : undefined}
          icon={Activity}
          color="text-blue-400"
          href="/admin/command-center/usage"
        />
        <CCStatCard
          label="Errors Today"
          value={stats?.errors_today ?? '--'}
          icon={AlertTriangle}
          color="text-red-400"
          href="/admin/command-center/usage"
        />
        <CCStatCard
          label="Active Tasks"
          value={stats?.active_tasks ?? '--'}
          sub={stats ? `${stats.blocked_tasks} blocked` : undefined}
          icon={ListTodo}
          color="text-amber-400"
          href="/admin/command-center/projects"
        />
        <CCStatCard
          label="Ideas Queued"
          value={stats?.ideas_queued ?? '--'}
          sub={stats ? `${stats.ideas_researched_24h} researched (24h)` : undefined}
          icon={Lightbulb}
          color="text-purple-400"
          href="/admin/command-center/ideas"
        />
        <CCStatCard
          label="Initiatives"
          value={initiatives.length}
          sub={initiatives.length > 0 ? initiatives.map((i) => i.title).join(', ') : 'None active'}
          icon={Target}
          color="text-cyan-400"
        />
        <CCStatCard
          label="CRM Pipeline"
          value={crmStats ? crmStats.deals : '--'}
          sub={crmStats ? `Weighted: $${(crmStats.weighted_value / 100).toLocaleString()}` : undefined}
          icon={Handshake}
          color="text-pink-400"
          href="/admin/command-center/crm"
        />
        <CCStatCard
          label="Pipeline Health"
          value={pipelineHealth ? `${pipelineHealth.queued_count + pipelineHealth.executing_count}` : '--'}
          sub={pipelineHealth ? `${pipelineHealth.queued_count} queued · ${pipelineHealth.executing_count} running` : undefined}
          icon={HeartPulse}
          color="text-teal-400"
        />
      </div>

      {/* 7-Day Cost Trend */}
      {stats?.cost_trend_7d && stats.cost_trend_7d.length > 0 && (
        <CCSection title="7-Day Cost Trend">
          <CostTrendBar trend={stats.cost_trend_7d} />
        </CCSection>
      )}

      {/* Quick Nav */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {QUICK_NAV.map((item) => {
          const NavIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors group"
            >
              <NavIcon className="w-4 h-4 text-zinc-500 group-hover:text-teal-400 transition-colors" />
              <span className="text-sm text-zinc-300 flex-1">{item.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
            </Link>
          );
        })}
      </div>

      {/* Two-column: Agent Runs + Ideas Processed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CCSection title="Latest Agent Runs" padding={false}>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {agentRuns.length === 0 && (
              <div className="p-6 text-center text-zinc-500 text-sm">No agent runs yet</div>
            )}
            {agentRuns.slice(0, 20).map((run) => (
              <div key={run.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-zinc-400 w-24 truncate">{run.agent_id}</span>
                <span className="text-zinc-500 w-28 truncate">{run.action}</span>
                <CCBadge variant={run.status}>{run.status}</CCBadge>
                <span className="text-zinc-600 text-xs ml-auto">
                  {run.cost_usd > 0 ? formatCurrency(run.cost_usd) : '--'}
                </span>
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {run.started_at ? timeAgo(run.started_at) : timeAgo(run.created_at)}
                </span>
              </div>
            ))}
          </div>
        </CCSection>

        <CCSection title="Recently Processed Ideas" padding={false}>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {processedIdeas.length === 0 && (
              <div className="p-6 text-center text-zinc-500 text-sm">No ideas processed yet</div>
            )}
            {processedIdeas.map((idea) => (
              <div key={idea.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-zinc-300 flex-1 truncate">{idea.title}</span>
                {idea.score !== null && (
                  <CCBadge
                    color={
                      idea.score >= 8 ? 'bg-emerald-500/20 text-emerald-400' :
                      idea.score >= 5 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    }
                  >
                    {idea.score}
                  </CCBadge>
                )}
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {idea.last_processed_at ? timeAgo(idea.last_processed_at) : '--'}
                </span>
              </div>
            ))}
          </div>
        </CCSection>
      </div>

      {/* Telemetry: What's burning money/time */}
      {telemetry && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: 'Top Spend Agents (7d)', data: telemetry.spend_by_agent_7d, keyField: 'agent' as const, valueField: 'cost' as const, countField: 'count' as const, valueColor: 'text-emerald-400', suffix: ' req' },
            { title: 'Top Spend Models (7d)', data: telemetry.spend_by_model_7d, keyField: 'model' as const, valueField: 'cost' as const, countField: 'count' as const, valueColor: 'text-emerald-400', suffix: ' req' },
            { title: 'Slowest Models p95 (7d)', data: telemetry.latency_p95_by_model_7d, keyField: 'model' as const, valueField: 'p95_ms' as const, countField: 'samples' as const, valueColor: 'text-amber-400', suffix: ' samples', valueFmt: (v: number) => `${v.toLocaleString()}ms` },
            { title: 'Failures by Agent (7d)', data: telemetry.failures_by_agent_7d, keyField: 'agent' as const, valueField: 'count' as const, valueColor: 'text-red-400', valueFmt: (v: number) => `${v} failures` },
          ].map((block) => (
            <CCSection key={block.title} title={block.title} padding={false}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-800">
                  {(!block.data || block.data.length === 0) && (
                    <tr><td className="px-5 py-4 text-center text-zinc-500">No data</td></tr>
                  )}
                  {(block.data as Record<string, unknown>[])?.map((r) => (
                    <tr key={String(r[block.keyField])} className="hover:bg-zinc-800/30">
                      <td className="px-5 py-2 text-zinc-400 font-mono text-xs">{String(r[block.keyField])}</td>
                      <td className={`px-3 py-2 text-right ${block.valueColor}`}>
                        {block.valueFmt ? block.valueFmt(Number(r[block.valueField])) : formatCurrency(Number(r[block.valueField]))}
                      </td>
                      {block.countField && (
                        <td className="px-3 py-2 text-right text-zinc-500 text-xs">
                          {Number((r as Record<string, unknown>)[block.countField])}{block.suffix}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CCSection>
          ))}
        </div>
      )}

      {/* Active Initiatives */}
      {initiatives.length > 0 && (
        <CCSection title="Active Initiatives">
          <div className="flex flex-wrap gap-3">
            {initiatives.map((init) => (
              <div key={init.id} className="px-3.5 py-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
                <div className="text-sm text-white font-medium">{init.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{init.type} &middot; {init.status}</div>
              </div>
            ))}
          </div>
        </CCSection>
      )}

      {/* Recent Activity Feed */}
      <CCSection title="Recent Activity" padding={false}>
        <div className="divide-y divide-zinc-800">
          {activity.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              {loading ? 'Loading...' : 'No recent activity'}
            </div>
          )}
          {activity.map((item) => (
            <div key={item.id} className="px-5 py-3 flex items-start gap-3">
              <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${item.source === 'task' ? 'bg-blue-400' : 'bg-purple-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500 uppercase">{item.type}</span>
                  <span className="text-xs text-zinc-600">{item.agent_id}</span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{item.title}</p>
              </div>
              <span className="text-xs text-zinc-600 whitespace-nowrap">{timeAgo(item.ts)}</span>
            </div>
          ))}
        </div>
      </CCSection>
    </CommandCenterShell>
  );
}
