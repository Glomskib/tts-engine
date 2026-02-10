'use client';

import { useState, useEffect } from 'react';
import {
  Users, TrendingUp, Clock, CheckCircle, AlertTriangle,
  Award, BarChart3, Target, ChevronDown, Activity,
} from 'lucide-react';

interface VAMetric {
  va_id: string;
  display_name: string;
  role: string | null;
  assigned: number;
  completed: number;
  completion_rate: number;
  avg_turnaround_hours: number;
  overdue_count: number;
  in_progress: number;
}

interface VideoRow {
  id: string;
  assigned_to: string | null;
  recording_status: string | null;
  created_at: string;
  last_status_changed_at: string | null;
  sla_status?: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  display_name: string;
  role: string | null;
  is_active: boolean;
}

function computeVAMetrics(members: TeamMember[], videos: VideoRow[]): VAMetric[] {
  return members.map(member => {
    const vaVideos = videos.filter(v => v.assigned_to === member.user_id);
    const completed = vaVideos.filter(v =>
      ['POSTED', 'READY_TO_POST', 'EDITED'].includes(v.recording_status || '')
    );
    const overdue = vaVideos.filter(v => {
      if (!v.last_status_changed_at) return false;
      const age = Date.now() - new Date(v.last_status_changed_at).getTime();
      return age > 24 * 60 * 60 * 1000 && !['POSTED', 'READY_TO_POST'].includes(v.recording_status || '');
    });
    const inProgress = vaVideos.filter(v =>
      !['POSTED', 'READY_TO_POST', 'REJECTED'].includes(v.recording_status || '')
    );

    // Average turnaround: time from assignment (created_at) to completion
    const turnarounds = completed
      .map(v => {
        const start = new Date(v.created_at).getTime();
        const end = new Date(v.last_status_changed_at || v.created_at).getTime();
        return (end - start) / (1000 * 60 * 60); // hours
      })
      .filter(h => h > 0 && h < 720); // filter out outliers (> 30 days)

    const avgTurnaround = turnarounds.length > 0
      ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
      : 0;

    return {
      va_id: member.user_id,
      display_name: member.display_name,
      role: member.role,
      assigned: vaVideos.length,
      completed: completed.length,
      completion_rate: vaVideos.length > 0 ? Math.round((completed.length / vaVideos.length) * 100) : 0,
      avg_turnaround_hours: Math.round(avgTurnaround * 10) / 10,
      overdue_count: overdue.length,
      in_progress: inProgress.length,
    };
  }).sort((a, b) => b.completion_rate - a.completion_rate);
}

function getRatingColor(rate: number): string {
  if (rate >= 80) return 'text-green-400';
  if (rate >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function getRatingBg(rate: number): string {
  if (rate >= 80) return 'bg-green-500';
  if (rate >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getRank(index: number): string {
  if (index === 0) return 'MVP';
  if (index === 1) return '2nd';
  if (index === 2) return '3rd';
  return `${index + 1}th`;
}

export default function VAScorecard() {
  const [metrics, setMetrics] = useState<VAMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [teamTotals, setTeamTotals] = useState({ assigned: 0, completed: 0, overdue: 0, avgRate: 0 });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [membersRes, videosRes] = await Promise.all([
          fetch('/api/team-members'),
          fetch(`/api/admin/videos?limit=1000`),
        ]);
        const [membersData, videosData] = await Promise.all([
          membersRes.json(),
          videosRes.json(),
        ]);

        const members: TeamMember[] = (membersData.data || []).filter((m: TeamMember) => m.is_active);
        const allVideos: VideoRow[] = videosData.data || [];

        // Filter videos by date range
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const recentVideos = allVideos.filter(v => new Date(v.created_at) >= cutoff);

        const computed = computeVAMetrics(members, recentVideos);
        setMetrics(computed);

        // Team totals
        const totalAssigned = computed.reduce((s, m) => s + m.assigned, 0);
        const totalCompleted = computed.reduce((s, m) => s + m.completed, 0);
        const totalOverdue = computed.reduce((s, m) => s + m.overdue_count, 0);
        const avgRate = computed.length > 0
          ? Math.round(computed.reduce((s, m) => s + m.completion_rate, 0) / computed.length)
          : 0;
        setTeamTotals({ assigned: totalAssigned, completed: totalCompleted, overdue: totalOverdue, avgRate });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-zinc-500 text-sm">Loading scorecard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-white">VA Performance Scorecard</h1>
            <p className="text-xs text-zinc-500">Team metrics and workload balance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Period:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={Target} label="Total Assigned" value={teamTotals.assigned} />
        <SummaryCard icon={CheckCircle} label="Completed" value={teamTotals.completed} color="text-green-400" />
        <SummaryCard icon={AlertTriangle} label="Overdue" value={teamTotals.overdue} color="text-red-400" />
        <SummaryCard icon={TrendingUp} label="Avg Completion" value={`${teamTotals.avgRate}%`} color={getRatingColor(teamTotals.avgRate)} />
      </div>

      {/* Workload Balance */}
      {metrics.length > 0 && (
        <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Workload Distribution</h2>
          <div className="flex gap-1 items-end" style={{ height: '80px' }}>
            {metrics.map((m) => {
              const maxAssigned = Math.max(...metrics.map(x => x.assigned), 1);
              const height = Math.max(4, (m.assigned / maxAssigned) * 100);
              return (
                <div key={m.va_id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-zinc-500">{m.assigned}</span>
                  <div
                    className={`w-full rounded-t ${getRatingBg(m.completion_rate)} opacity-70`}
                    style={{ height: `${height}%` }}
                    title={`${m.display_name}: ${m.assigned} assigned`}
                  />
                  <span className="text-[9px] text-zinc-500 truncate max-w-full">{m.display_name.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual Scorecards */}
      {metrics.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No team members with assigned work in this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {metrics.map((metric, index) => (
            <VACard key={metric.va_id} metric={metric} rank={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function VACard({ metric, rank }: { metric: VAMetric; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-4 w-full px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
      >
        {/* Rank Badge */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
          rank === 0 ? 'bg-yellow-500/20 text-yellow-400' :
          rank === 1 ? 'bg-zinc-500/20 text-zinc-300' :
          rank === 2 ? 'bg-amber-700/20 text-amber-600' :
          'bg-zinc-800 text-zinc-500'
        }`}>
          {rank === 0 ? <Award className="w-4 h-4" /> : getRank(rank)}
        </div>

        {/* Name & Role */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{metric.display_name}</div>
          {metric.role && (
            <div className="text-[10px] text-zinc-500 uppercase">{metric.role}</div>
          )}
        </div>

        {/* Key Stats */}
        <div className="hidden sm:flex items-center gap-6">
          <div className="text-center">
            <div className="text-xs text-zinc-500">Assigned</div>
            <div className="text-sm font-bold text-zinc-300">{metric.assigned}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">Done</div>
            <div className="text-sm font-bold text-green-400">{metric.completed}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">Rate</div>
            <div className={`text-sm font-bold ${getRatingColor(metric.completion_rate)}`}>{metric.completion_rate}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500">Avg Time</div>
            <div className="text-sm font-bold text-zinc-300">{metric.avg_turnaround_hours}h</div>
          </div>
          {metric.overdue_count > 0 && (
            <div className="text-center">
              <div className="text-xs text-zinc-500">Overdue</div>
              <div className="text-sm font-bold text-red-400">{metric.overdue_count}</div>
            </div>
          )}
        </div>

        {/* Completion Bar */}
        <div className="w-20 hidden lg:block">
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full ${getRatingBg(metric.completion_rate)} rounded-full transition-all`} style={{ width: `${metric.completion_rate}%` }} />
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800/50">
          {/* Expanded metrics for mobile + additional detail */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <MetricBox label="Videos Assigned" value={metric.assigned} icon={Target} />
            <MetricBox label="Completed" value={metric.completed} icon={CheckCircle} color="text-green-400" />
            <MetricBox label="In Progress" value={metric.in_progress} icon={Activity} color="text-blue-400" />
            <MetricBox label="Overdue" value={metric.overdue_count} icon={AlertTriangle} color={metric.overdue_count > 0 ? 'text-red-400' : 'text-zinc-500'} />
            <MetricBox label="Completion Rate" value={`${metric.completion_rate}%`} icon={BarChart3} color={getRatingColor(metric.completion_rate)} />
            <MetricBox label="Avg Turnaround" value={`${metric.avg_turnaround_hours}h`} icon={Clock} />
          </div>

          {/* SLA compliance estimate */}
          <div className="mt-3 pt-3 border-t border-zinc-800/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">SLA Compliance (24h target)</span>
              <span className={metric.overdue_count === 0 ? 'text-green-400' : 'text-yellow-400'}>
                {metric.assigned > 0
                  ? `${Math.round(((metric.assigned - metric.overdue_count) / metric.assigned) * 100)}%`
                  : 'N/A'
                }
              </span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full ${metric.overdue_count === 0 ? 'bg-green-500' : 'bg-yellow-500'}`}
                style={{ width: `${metric.assigned > 0 ? ((metric.assigned - metric.overdue_count) / metric.assigned) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, icon: Icon, color = 'text-white' }: {
  label: string;
  value: string | number;
  icon: typeof Target;
  color?: string;
}) {
  return (
    <div className="p-3 bg-zinc-800/30 rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-zinc-500" />
        <span className="text-[10px] text-zinc-500 uppercase">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
