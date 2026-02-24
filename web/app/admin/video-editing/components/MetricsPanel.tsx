'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Clock, CheckCircle2, Users,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';

interface Metrics {
  throughput: {
    submitted_today: number;
    approved_today: number;
    avg_turnaround_7d_hours: number | null;
    completed_7d: number;
  };
  sla: {
    compliance_rate_pct: number | null;
    avg_queue_time_hours: number | null;
    avg_editing_time_hours: number | null;
    under_24h_count: number;
    total_measured: number;
  };
  editors: {
    active_editors: number;
    total_claimed_30d: number;
    total_completed_30d: number;
  };
}

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/video-requests/metrics');
        const data = await res.json();
        if (data.ok) {
          setMetrics(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-zinc-800 rounded-lg p-3">
              <div className="h-6 w-8 bg-zinc-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-20 bg-zinc-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const { throughput, sla, editors } = metrics;
  const slaColor = sla.compliance_rate_pct === null
    ? 'text-zinc-500'
    : sla.compliance_rate_pct >= 80
      ? 'text-green-400'
      : sla.compliance_rate_pct >= 50
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      {/* Header (always visible) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-400">Editing Metrics</span>
        </div>

        {/* Quick summary chips */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            <span className="text-green-400 font-medium">{throughput.approved_today}</span> approved today
          </span>
          {sla.compliance_rate_pct !== null && (
            <span className="text-xs text-zinc-500">
              SLA <span className={`font-medium ${slaColor}`}>{sla.compliance_rate_pct}%</span>
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Throughput Row */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Throughput
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                value={throughput.submitted_today}
                label="Submitted Today"
                color="text-orange-400"
              />
              <MetricCard
                value={throughput.approved_today}
                label="Approved Today"
                color="text-green-400"
              />
              <MetricCard
                value={formatHours(throughput.avg_turnaround_7d_hours)}
                label="Avg Turnaround (7d)"
                color="text-blue-400"
              />
              <MetricCard
                value={throughput.completed_7d}
                label="Completed (7d)"
                color="text-teal-400"
              />
            </div>
          </div>

          {/* SLA Compliance Row */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              SLA Compliance
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                value={sla.compliance_rate_pct !== null ? `${sla.compliance_rate_pct}%` : '—'}
                label="Under 24h"
                color={slaColor}
                warn={sla.compliance_rate_pct !== null && sla.compliance_rate_pct < 50}
              />
              <MetricCard
                value={formatHours(sla.avg_queue_time_hours)}
                label="Avg Queue Time"
                color="text-violet-400"
              />
              <MetricCard
                value={formatHours(sla.avg_editing_time_hours)}
                label="Avg Editing Time"
                color="text-blue-400"
              />
              <MetricCard
                value={`${sla.under_24h_count}/${sla.total_measured}`}
                label="Within SLA"
                color="text-zinc-300"
              />
            </div>
          </div>

          {/* Editor Utilization Row */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Editor Utilization (30d)
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                value={editors.active_editors}
                label="Active Editors"
                color="text-indigo-400"
              />
              <MetricCard
                value={editors.total_claimed_30d}
                label="Jobs Claimed"
                color="text-blue-400"
              />
              <MetricCard
                value={editors.total_completed_30d}
                label="Jobs Completed"
                color="text-green-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  value,
  label,
  color,
  warn = false,
}: {
  value: string | number;
  label: string;
  color: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-3">
      <div className={`text-xl font-bold ${color} flex items-center gap-1`}>
        {warn && <AlertTriangle className="w-4 h-4 text-red-400" />}
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
