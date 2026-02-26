'use client';

import { useState, useEffect } from 'react';
import {
  Download,
  DollarSign, TrendingUp, Activity, Calculator,
} from 'lucide-react';
import CommandCenterShell from '../_components/CommandCenterShell';
import { CCPageHeader, CCSection, CCStatCard } from '../_components/ui';

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
    <CommandCenterShell>
      <CCPageHeader
        title="FinOps"
        subtitle="AI spend tracking and cost optimization"
        loading={loading}
        onRefresh={fetchData}
        actions={
          <a
            href={exportUrl}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CCStatCard
          label="Spend Today"
          value={data ? formatCurrency(data.summary.today) : '--'}
          icon={DollarSign}
          color="text-emerald-400"
        />
        <CCStatCard
          label="7-Day Spend"
          value={data ? formatCurrency(data.summary.week) : '--'}
          icon={Activity}
          color="text-blue-400"
        />
        <CCStatCard
          label="MTD Spend"
          value={data ? formatCurrency(data.summary.month) : '--'}
          sub={data ? `${data.summary.mtd_calls.toLocaleString()} calls` : undefined}
          icon={TrendingUp}
          color="text-amber-400"
        />
        <CCStatCard
          label="Projected Monthly"
          value={data ? formatCurrency(data.burn_rate.projected_monthly) : '--'}
          sub={data ? `Day ${data.burn_rate.days_elapsed} of ${data.burn_rate.days_in_month}` : undefined}
          icon={Calculator}
          color="text-purple-400"
        />
      </div>

      {/* 30-Day Cost Bar Chart */}
      {data && data.daily_series.length > 0 && (
        <CCSection title="30-Day Cost Trend">
          <CostTrendBar series={data.daily_series} />
        </CCSection>
      )}

      {/* Three-column grid: Models, Endpoints, Lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: 'Top Models (30d)', rows: data?.top_models || [], keyField: 'model', mono: true },
          { title: 'Top Endpoints (7d)', rows: data?.top_endpoints || [], keyField: 'endpoint', mono: true },
          { title: 'Cost by Lane (30d)', rows: data?.by_lane || [], keyField: 'lane', mono: false },
        ].map((block) => (
          <CCSection key={block.title} title={block.title} padding={false}>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-800">
                  {block.rows.length === 0 && (
                    <tr><td className="px-5 py-4 text-center text-zinc-500">{loading ? 'Loading...' : 'No data'}</td></tr>
                  )}
                  {(block.rows as Record<string, unknown>[]).map((r) => (
                    <tr key={String(r[block.keyField])} className="hover:bg-zinc-800/30">
                      <td className={`px-5 py-2 text-zinc-400 text-xs truncate max-w-[180px] ${block.mono ? 'font-mono' : ''}`}>
                        {String(r[block.keyField])}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-400 whitespace-nowrap">
                        {formatCurrency(Number(r.cost))}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-500 text-xs whitespace-nowrap">
                        {Number(r.calls)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CCSection>
        ))}
      </div>
    </CommandCenterShell>
  );
}
