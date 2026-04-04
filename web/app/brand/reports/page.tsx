'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Loader2, TrendingUp, BarChart3, Trophy, FlaskConical } from 'lucide-react';
import type { BrandDashboardData } from '@/lib/brands/types';

export default function BrandReportsPage() {
  const searchParams = useSearchParams();
  const brandId = searchParams.get('brand_id');
  const [data, setData] = useState<BrandDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    fetch(`/api/brand/dashboard?brand_id=${brandId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) setData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8 text-center">
          <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No data available</p>
        </div>
      </div>
    );
  }

  const { velocity, experiments } = data;
  const completedExperiments = experiments.filter(e => e.status === 'completed');
  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">Monthly Report</h1>
        <p className="text-sm text-zinc-500 mt-1">{monthName} — {data.brand.name}</p>
      </div>

      {/* Summary Stats */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <BarChart3 className="w-5 h-5 text-teal-400" />
            </div>
            <div className="text-lg font-bold text-zinc-100">{velocity.creatives_this_month}</div>
            <div className="text-xs text-zinc-500">Creatives</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <FlaskConical className="w-5 h-5 text-violet-400" />
            </div>
            <div className="text-lg font-bold text-zinc-100">{velocity.active_experiments}</div>
            <div className="text-xs text-zinc-500">Active Experiments</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-zinc-100">{velocity.total_winners}</div>
            <div className="text-xs text-zinc-500">Winners</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-zinc-100">{velocity.avg_engagement_rate}%</div>
            <div className="text-xs text-zinc-500">Avg Engagement</div>
          </div>
        </div>
      </div>

      {/* Velocity Trend */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Creative Velocity</h2>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-2xl font-bold text-zinc-100">{velocity.creatives_this_month}</div>
            <div className="text-xs text-zinc-500">This month</div>
          </div>
          <div className="text-zinc-600">vs</div>
          <div>
            <div className="text-2xl font-bold text-zinc-400">{velocity.creatives_last_month}</div>
            <div className="text-xs text-zinc-500">Last month</div>
          </div>
          {velocity.velocity_change !== 0 && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              velocity.velocity_change > 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              {velocity.velocity_change > 0 ? '+' : ''}{velocity.velocity_change}%
            </div>
          )}
        </div>
      </div>

      {/* Completed Experiments */}
      {completedExperiments.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">Completed Experiments</h2>
          <div className="space-y-3">
            {completedExperiments.map(exp => (
              <div key={exp.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-sm font-medium text-zinc-200">{exp.name}</div>
                  <div className="text-xs text-zinc-500">{exp.product_name || 'No product'}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{exp.hook_count} hooks</span>
                  {exp.winner_count > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Trophy className="w-3 h-3" />
                      {exp.winner_count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
