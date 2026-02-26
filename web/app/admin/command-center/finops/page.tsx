'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw, Download,
  DollarSign, TrendingUp, Activity, Calculator,
} from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';

interface DashboardData {
  summary: { today: number; week: number; month: number; mtd_calls: number };
  burn_rate: { mtd_cost: number; days_elapsed: number; days_in_month: number; projected_monthly: number };
  daily_series: { day: string; cost: number; calls: number }[];
  top_models: { model: string; calls: number; cost: number }[];
  top_endpoints: { endpoint: string; calls: number; cost: number }[];
  by_lane: { lane: string; calls: number; cost: number }[];
}

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function CostTrendBar({ series }: { series: { day: string; cost: number }[] }) {
  const maxCost = Math.max(...series.map((t) => t.cost), 0.01);
  return (
    <div className="flex items-end gap-1 h-24">
      {series.map((t) => (
        <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-emerald-500/60 rounded-t"
            style={{ height: `${Math.max((t.cost / maxCost) * 100, 2)}%` }}
            title={`${t.day}: ${formatCurrency(t.cost)}`}
          />
          {series.length <= 15 && (
            <span className="text-[8px] text-zinc-600">{t.day.slice(5)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FinOpsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finops/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch FinOps data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const exportUrl = (() => {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = now.toISOString().slice(0, 10);
    return `/api/finops/export?start=${start}&end=${end}`;
  })();

  return (
    <div className="space-y-6">
      <CCSubnav />
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">FinOps</h2>
        <div className="flex items-center gap-2">
          <a
            href={exportUrl}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Spend Today"
          value={data ? formatCurrency(data.summary.today) : '--'}
          icon={DollarSign}
          color="text-emerald-400"
        />
        <StatCard
          label="7-Day Spend"
          value={data ? formatCurrency(data.summary.week) : '--'}
          icon={Activity}
          color="text-blue-400"
        />
        <StatCard
          label="MTD Spend"
          value={data ? formatCurrency(data.summary.month) : '--'}
          sub={data ? `${data.summary.mtd_calls.toLocaleString()} calls` : undefined}
          icon={TrendingUp}
          color="text-amber-400"
        />
        <StatCard
          label="Projected Monthly"
          value={data ? formatCurrency(data.burn_rate.projected_monthly) : '--'}
          sub={data ? `Day ${data.burn_rate.days_elapsed} of ${data.burn_rate.days_in_month}` : undefined}
          icon={Calculator}
          color="text-purple-400"
        />
      </div>

      {/* 30-Day Cost Bar Chart */}
      {data && data.daily_series.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">30-Day Cost Trend</h3>
          <CostTrendBar series={data.daily_series} />
        </div>
      )}

      {/* Three-column grid: Models, Endpoints, Lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Models */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-800">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Top Models (30d)</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {(!data || data.top_models.length === 0) && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">{loading ? 'Loading...' : 'No data'}</td></tr>
                )}
                {data?.top_models.map((r) => (
                  <tr key={r.model}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs truncate max-w-[180px]">{r.model}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-400 whitespace-nowrap">{formatCurrency(r.cost)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-500 text-xs whitespace-nowrap">{r.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Endpoints */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-800">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Top Endpoints (7d)</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {(!data || data.top_endpoints.length === 0) && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">{loading ? 'Loading...' : 'No data'}</td></tr>
                )}
                {data?.top_endpoints.map((r) => (
                  <tr key={r.endpoint}>
                    <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs truncate max-w-[180px]">{r.endpoint}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-400 whitespace-nowrap">{formatCurrency(r.cost)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-500 text-xs whitespace-nowrap">{r.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost by Lane */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-800">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider">Cost by Lane (30d)</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {(!data || data.by_lane.length === 0) && (
                  <tr><td className="px-4 py-3 text-center text-zinc-500">{loading ? 'Loading...' : 'No data'}</td></tr>
                )}
                {data?.by_lane.map((r) => (
                  <tr key={r.lane}>
                    <td className="px-4 py-1.5 text-zinc-400 text-xs">{r.lane}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-400 whitespace-nowrap">{formatCurrency(r.cost)}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-500 text-xs whitespace-nowrap">{r.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
