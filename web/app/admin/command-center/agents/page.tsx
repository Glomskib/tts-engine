'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, RefreshCw, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

interface AgentScoreboard {
  agent_id: string;
  total_runs_7d: number;
  total_runs_30d: number;
  tasks_completed_7d: number;
  tasks_completed_30d: number;
  avg_duration_ms: number | null;
  cost_today: number;
  cost_7d: number;
  cost_30d: number;
  cost_per_run: number;
  cost_per_task: number;
  runs_ok_7d: number;
  runs_fail_7d: number;
  runs_ok_30d: number;
  runs_fail_30d: number;
  success_rate: number;
  throughput_per_day: number;
  efficiency_score: number;
  most_common_action: string;
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
  model_primary: string | null;
  model_used: string | null;
  related_type: string | null;
  created_at: string;
}

type SortField = 'agent_id' | 'total_runs' | 'tasks_completed' | 'avg_duration_ms' | 'cost' |
  'cost_per_run' | 'cost_per_task' | 'success_rate' | 'throughput_per_day' | 'efficiency_score';
type TimeRange = '7d' | '30d';

function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AgentScoreboardPage() {
  const [scoreboard, setScoreboard] = useState<AgentScoreboard[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [sortField, setSortField] = useState<SortField>('efficiency_score');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/command-center/agents');
      if (res.ok) {
        const json = await res.json();
        setScoreboard(json.data.scoreboard || []);
        setRecentRuns(json.data.recent_runs || []);
      }
    } catch (err) {
      console.error('Failed to fetch agent data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const sorted = useMemo(() => {
    const is7d = timeRange === '7d';
    return [...scoreboard].sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case 'agent_id': return (sortAsc ? 1 : -1) * a.agent_id.localeCompare(b.agent_id);
        case 'total_runs': va = is7d ? a.total_runs_7d : a.total_runs_30d; vb = is7d ? b.total_runs_7d : b.total_runs_30d; break;
        case 'tasks_completed': va = is7d ? a.tasks_completed_7d : a.tasks_completed_30d; vb = is7d ? b.tasks_completed_7d : b.tasks_completed_30d; break;
        case 'avg_duration_ms': va = a.avg_duration_ms ?? 0; vb = b.avg_duration_ms ?? 0; break;
        case 'cost': va = is7d ? a.cost_7d : a.cost_30d; vb = is7d ? b.cost_7d : b.cost_30d; break;
        case 'cost_per_run': va = a.cost_per_run; vb = b.cost_per_run; break;
        case 'cost_per_task': va = a.cost_per_task; vb = b.cost_per_task; break;
        case 'success_rate': va = a.success_rate; vb = b.success_rate; break;
        case 'throughput_per_day': va = a.throughput_per_day; vb = b.throughput_per_day; break;
        case 'efficiency_score': va = a.efficiency_score; vb = b.efficiency_score; break;
        default: va = 0; vb = 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
  }, [scoreboard, sortField, sortAsc, timeRange]);

  function SortHeader({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) {
    return (
      <th
        className={`px-3 py-3 font-medium cursor-pointer hover:text-zinc-300 select-none ${className}`}
        onClick={() => toggleSort(field)}
      >
        <span className="flex items-center gap-1">
          {children}
          {sortField === field && <ArrowUpDown className="w-3 h-3 text-emerald-400" />}
        </span>
      </th>
    );
  }

  const is7d = timeRange === '7d';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/command-center" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Agent Scoreboard</h1>
          <p className="text-sm text-zinc-500">Performance, cost & efficiency by agent</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              timeRange === '7d' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Last 7 days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              timeRange === '30d' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Last 30 days
          </button>
        </div>
        <button onClick={fetchData} className="p-2 text-zinc-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Scoreboard table */}
      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left text-xs">
              <SortHeader field="agent_id">Agent</SortHeader>
              <SortHeader field="total_runs" className="text-right">Runs</SortHeader>
              <SortHeader field="tasks_completed" className="text-right">OK / Fail</SortHeader>
              <SortHeader field="success_rate" className="text-right">Success %</SortHeader>
              <SortHeader field="avg_duration_ms" className="text-right">Avg Duration</SortHeader>
              <SortHeader field="cost" className="text-right">Cost</SortHeader>
              <SortHeader field="cost_per_run" className="text-right">$/Run</SortHeader>
              <SortHeader field="cost_per_task" className="text-right">$/Task</SortHeader>
              <SortHeader field="throughput_per_day" className="text-right">Tasks/Day</SortHeader>
              <SortHeader field="efficiency_score" className="text-right">Efficiency</SortHeader>
              <th className="px-3 py-3 font-medium text-xs">Top Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sorted.map((agent) => {
              const runs = is7d ? agent.total_runs_7d : agent.total_runs_30d;
              const ok = is7d ? agent.runs_ok_7d : agent.runs_ok_30d;
              const fail = is7d ? agent.runs_fail_7d : agent.runs_fail_30d;
              const cost = is7d ? agent.cost_7d : agent.cost_30d;

              return (
                <tr key={agent.agent_id} className="hover:bg-zinc-800/50">
                  <td className="px-3 py-3 text-zinc-300 font-mono text-xs">{agent.agent_id}</td>
                  <td className="px-3 py-3 text-right text-zinc-400">{runs}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-green-400">{ok}</span>
                    {fail > 0 && <span className="text-red-400 ml-1">/ {fail}</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={agent.success_rate >= 90 ? 'text-green-400' : agent.success_rate >= 70 ? 'text-amber-400' : 'text-red-400'}>
                      {agent.success_rate}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-zinc-500">{formatDuration(agent.avg_duration_ms)}</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-mono">${cost.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-zinc-400 font-mono">${agent.cost_per_run.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right text-zinc-400 font-mono">${agent.cost_per_task.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right text-zinc-400">{agent.throughput_per_day.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-semibold ${
                      agent.efficiency_score >= 100 ? 'text-emerald-400' :
                      agent.efficiency_score >= 50 ? 'text-amber-400' : 'text-zinc-400'
                    }`}>
                      {agent.efficiency_score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-zinc-400 text-xs">{agent.most_common_action || '—'}</td>
                </tr>
              );
            })}
            {scoreboard.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No agent data yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Recent Agent Runs (last 50)</h2>
        <div className="border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium text-right">Tokens</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium">Related</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {recentRuns.map((run) => (
                <tr key={run.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-2 text-zinc-400 text-xs font-mono whitespace-nowrap">{new Date(run.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-zinc-300 font-mono">{run.agent_id}</td>
                  <td className="px-4 py-2 text-zinc-400">{run.action}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 text-xs rounded ${
                      run.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                      run.status === 'failed' ? 'bg-red-900/40 text-red-400' :
                      run.status === 'running' ? 'bg-blue-900/40 text-blue-400' :
                      'bg-zinc-700/40 text-zinc-400'
                    }`}>{run.status}</span>
                  </td>
                  <td className="px-4 py-2 text-zinc-500 text-xs font-mono">{run.model_used || run.model_primary || '—'}</td>
                  <td className="px-4 py-2 text-right text-zinc-400 text-xs">{(run.tokens_in + run.tokens_out).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">${Number(run.cost_usd).toFixed(4)}</td>
                  <td className="px-4 py-2 text-zinc-600 text-xs">{run.related_type || '—'}</td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No runs yet'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
