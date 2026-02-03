'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  icon?: LucideIcon;
  iconColor?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  trend,
  icon: Icon,
  iconColor = 'text-zinc-400',
}: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className={`w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend.direction === 'up'
                ? 'text-emerald-400'
                : trend.direction === 'down'
                ? 'text-red-400'
                : 'text-zinc-500'
            }`}
          >
            {trend.direction === 'up' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-3xl font-semibold text-white">{value}</p>
        <p className="text-sm text-zinc-400">{label}</p>
        {subtext && (
          <p className="text-xs text-zinc-500">{subtext}</p>
        )}
      </div>
    </div>
  );
}

export default StatCard;
