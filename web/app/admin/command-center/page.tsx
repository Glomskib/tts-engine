'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign, Activity, AlertTriangle, ListTodo,
  Lightbulb, TrendingUp, ChevronRight, RefreshCw,
  Zap, Target, Bot, Handshake, HeartPulse,
} from 'lucide-react';
import type { PipelineHealth } from '@/lib/command-center/types';
import InitiativeFilter from './_components/InitiativeFilter';

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

function StatCard({ label, value, sub, icon: Icon, href, color }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  href?: string;
  color: string;
}) {
  const content = (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 ${href ? 'hover:border-zinc-600 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
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

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-500/20 text-emerald-400',
    running: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
    queued: 'bg-zinc-500/20 text-zinc-400',
    active: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-zinc-700 text-zinc-400'}`}>
      {status}
    </span>
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

  useEffect(() => { fetchData(); }, [initiativeId]);

  useEffect(() => {
    fetchPipelineHealth();
    const id = setInterval(fetchPipelineHealth, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-sm text-zinc-500 mt-1">Internal ops dashboard</p>
        </div>
        <InitiativeFilter value={initiativeId} onChange={setInitiativeId} />
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Spend Today"
          value={stats ? formatCurrency(stats.spend.today) : '--'}
          sub={stats ? `7d: ${formatCurrency(stats.spend.week)} | 30d: ${formatCurrency(stats.spend.month)}` : undefined}
          icon={DollarSign}
          color="text-emerald-400"
          href="/admin/command-center/usage"
        />
        <StatCard
          label="Requests Today"
          value={stats?.requests.today ?? '--'}
          sub={stats ? `7d: ${stats.requests.week.toLocaleString()}` : undefined}
          icon={Activity}
          color="text-blue-400"
          href="/admin/command-center/usage"
        />
        <StatCard
          label="Errors Today"
          value={stats?.errors_today ?? '--'}
          icon={AlertTriangle}
          color="text-red-400"
          href="/admin/command-center/usage"
        />
        <StatCard
          label="Active Tasks"
          value={stats?.active_tasks ?? '--'}
          sub={stats ? `${stats.blocked_tasks} blocked` : undefined}
          icon={ListTodo}
          color="text-amber-400"
          href="/admin/command-center/projects"
        />
        <StatCard
          label="Ideas Queued"
          value={stats?.ideas_queued ?? '--'}
          sub={stats ? `${stats.ideas_researched_24h} researched (24h)` : undefined}
          icon={Lightbulb}
          color="text-purple-400"
          href="/admin/command-center/ideas"
        />
        <StatCard
          label="Initiatives"
          value={initiatives.length}
          sub={initiatives.length > 0 ? initiatives.map((i) => i.title).join(', ') : 'None active'}
          icon={Target}
          color="text-cyan-400"
        />
        <StatCard
          label="CRM Pipeline"
          value={crmStats ? crmStats.deals : '--'}
          sub={crmStats ? `Weighted: $${(crmStats.weighted_value / 100).toLocaleString()}` : undefined}
          icon={Handshake}
          color="text-pink-400"
          href="/admin/command-center/crm"
        />

        {/* Pipeline Health Card */}
        <div className={`rounded-lg border ${phDegraded ? 'border-amber-600/60' : 'border-zinc-800'} bg-zinc-900/50 p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Pipeline Health</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={fetchPipelineHealth}
                disabled={phRefreshing}
                className="p-0.5 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
                title="Refresh pipeline health"
              >
                <RefreshCw className={`w-3 h-3 text-zinc-500 ${phRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <HeartPulse className="w-4 h-4 text-teal-400" />
            </div>
          </div>
          {pipelineHealth ? (
            <>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-semibold text-zinc-300">{pipelineHealth.queued_count} <span className="text-xs font-normal text-zinc-500">queued</span></span>
                <span className="text-sm font-semibold text-blue-400">{pipelineHealth.executing_count} <span className="text-xs font-normal text-zinc-500">executing</span></span>
                <span className={`text-sm font-semibold ${pipelineHealth.blocked_count > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{pipelineHealth.blocked_count} <span className="text-xs font-normal text-zinc-500">blocked</span></span>
              </div>
              <div className="text-xs text-zinc-600 mt-2">
                Updated {timeAgo(pipelineHealth.last_updated)}
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-500 mt-1">{phDegraded ? 'MC unreachable' : 'Loading...'}</div>
          )}
          {phDegraded && pipelineHealth && (
            <div className="text-xs text-amber-500 mt-1">MC unreachable — showing last snapshot</div>
          )}
        </div>
      </div>

      {/* 7-Day Cost Trend */}
      {stats?.cost_trend_7d && stats.cost_trend_7d.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">7-Day Cost Trend</h3>
          <CostTrendBar trend={stats.cost_trend_7d} />
        </div>
      )}

      {/* Quick Nav */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'API Usage', href: '/admin/command-center/usage' },
          { label: 'Projects & Tasks', href: '/admin/command-center/projects' },
          { label: 'Idea Dump', href: '/admin/command-center/ideas' },
          { label: 'Finance', href: '/admin/command-center/finance' },
          { label: 'Agent Scoreboard', href: '/admin/command-center/agents' },
          { label: 'FinOps', href: '/admin/command-center/finops' },
          { label: 'CRM Pipeline', href: '/admin/command-center/crm' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
          >
            <span className="text-sm text-zinc-300">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </Link>
        ))}
      </div>

      {/* Two-column: Agent Runs + Ideas Processed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latest Agent Runs */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
            <Bot className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Latest Agent Runs</h3>
          </div>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {agentRuns.length === 0 && (
              <div className="p-4 text-center text-zinc-500 text-sm">No agent runs yet</div>
            )}
            {agentRuns.slice(0, 20).map((run) => (
              <div key={run.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-zinc-400 w-24 truncate">{run.agent_id}</span>
                <span className="text-zinc-500 w-28 truncate">{run.action}</span>
                {statusBadge(run.status)}
                <span className="text-zinc-600 text-xs ml-auto">
                  {run.cost_usd > 0 ? formatCurrency(run.cost_usd) : '--'}
                </span>
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {run.started_at ? timeAgo(run.started_at) : timeAgo(run.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ideas Processed Last Run */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
            <Zap className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Recently Processed Ideas</h3>
          </div>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {processedIdeas.length === 0 && (
              <div className="p-4 text-center text-zinc-500 text-sm">No ideas processed yet</div>
            )}
            {processedIdeas.map((idea) => (
              <div key={idea.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-zinc-300 flex-1 truncate">{idea.title}</span>
                {idea.score !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    idea.score >= 8 ? 'bg-emerald-500/20 text-emerald-400' :
                    idea.score >= 5 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-zinc-500/20 text-zinc-400'
                  }`}>
                    {idea.score}
                  </span>
                )}
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {idea.last_processed_at ? timeAgo(idea.last_processed_at) : '--'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Telemetry: What's burning money/time */}
      {telemetry && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top spend agents */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Top Spend Agents (7d)</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {telemetry.spend_by_agent_7d.length === 0 && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">No data</td></tr>
                )}
                {telemetry.spend_by_agent_7d.map((r) => (
                  <tr key={r.agent}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs">{r.agent}</td>
                    <td className="px-4 py-1.5 text-right text-emerald-400">{formatCurrency(r.cost)}</td>
                    <td className="px-4 py-1.5 text-right text-zinc-500 text-xs">{r.count} req</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top spend models */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Top Spend Models (7d)</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {telemetry.spend_by_model_7d.length === 0 && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">No data</td></tr>
                )}
                {telemetry.spend_by_model_7d.map((r) => (
                  <tr key={r.model}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs">{r.model}</td>
                    <td className="px-4 py-1.5 text-right text-emerald-400">{formatCurrency(r.cost)}</td>
                    <td className="px-4 py-1.5 text-right text-zinc-500 text-xs">{r.count} req</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Slowest models (p95 latency) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Slowest Models p95 (7d)</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {telemetry.latency_p95_by_model_7d.length === 0 && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">No latency data</td></tr>
                )}
                {telemetry.latency_p95_by_model_7d.map((r) => (
                  <tr key={r.model}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs">{r.model}</td>
                    <td className="px-4 py-1.5 text-right text-amber-400">{r.p95_ms.toLocaleString()}ms</td>
                    <td className="px-4 py-1.5 text-right text-zinc-500 text-xs">{r.samples} samples</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Failures by agent */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Failures by Agent (7d)</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {telemetry.failures_by_agent_7d.length === 0 && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">No failures</td></tr>
                )}
                {telemetry.failures_by_agent_7d.map((r) => (
                  <tr key={r.agent}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs">{r.agent}</td>
                    <td className="px-4 py-1.5 text-right text-red-400">{r.count} failures</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Initiatives */}
      {initiatives.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Active Initiatives</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {initiatives.map((init) => (
              <div key={init.id} className="px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
                <div className="text-sm text-white font-medium">{init.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{init.type} &middot; {init.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Recent Activity</h2>
        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 bg-zinc-900/50">
          {activity.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              {loading ? 'Loading...' : 'No recent activity'}
            </div>
          )}
          {activity.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-start gap-3">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${item.source === 'task' ? 'bg-blue-400' : 'bg-purple-400'}`} />
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
      </div>
    </div>
  );
}
