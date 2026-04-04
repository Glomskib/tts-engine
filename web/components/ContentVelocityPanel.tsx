'use client';

import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

interface VelocityMetric {
  label: string;
  today: number;
  thisWeek: number;
  lastWeek: number;
  color: string;
}

interface ContentVelocityPanelProps {
  metrics: VelocityMetric[];
}

function getTrendIcon(thisWeek: number, lastWeek: number) {
  if (lastWeek === 0) return <Minus className="w-3 h-3 text-zinc-600" />;
  const change = ((thisWeek - lastWeek) / lastWeek) * 100;
  if (change > 10) return <TrendingUp className="w-3 h-3 text-green-400" />;
  if (change < -10) return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-zinc-500" />;
}

function getTrendLabel(thisWeek: number, lastWeek: number): string {
  if (lastWeek === 0) return 'new';
  const change = ((thisWeek - lastWeek) / lastWeek) * 100;
  if (change > 0) return `+${Math.round(change)}%`;
  if (change < 0) return `${Math.round(change)}%`;
  return 'flat';
}

export function ContentVelocityPanel({ metrics }: ContentVelocityPanelProps) {
  const totalThisWeek = metrics.reduce((sum, m) => sum + m.thisWeek, 0);
  const totalLastWeek = metrics.reduce((sum, m) => sum + m.lastWeek, 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Content Velocity</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Production throughput by stage</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">This week</div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-white tabular-nums">{totalThisWeek}</span>
            {getTrendIcon(totalThisWeek, totalLastWeek)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-zinc-800/50 rounded-lg px-3 py-2.5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{m.label}</span>
              {getTrendIcon(m.thisWeek, m.lastWeek)}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-lg font-bold tabular-nums ${m.color}`}>{m.today}</span>
              <span className="text-[10px] text-zinc-600">today</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-zinc-400 tabular-nums">{m.thisWeek}/wk</span>
              <span className="text-[10px] text-zinc-600">{getTrendLabel(m.thisWeek, m.lastWeek)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
