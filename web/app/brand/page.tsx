'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  FlaskConical,
  Trophy,
  BarChart3,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import type { BrandDashboardData, Experiment } from '@/lib/brands/types';

function StatCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-teal-400" />
        </div>
        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-medium ${change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function ExperimentRow({ experiment, brandId }: { experiment: Experiment; brandId: string }) {
  const statusColors: Record<string, string> = {
    draft: 'bg-zinc-500/10 text-zinc-400',
    running: 'bg-teal-500/10 text-teal-400',
    paused: 'bg-amber-500/10 text-amber-400',
    completed: 'bg-blue-500/10 text-blue-400',
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-200 truncate">{experiment.name}</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {experiment.product_name || 'No product'} &middot; {experiment.hook_count} hooks
        </div>
      </div>
      <div className="flex items-center gap-3 ml-3">
        <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[experiment.status] || statusColors.draft}`}>
          {experiment.status}
        </span>
        {experiment.winner_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <Trophy className="w-3 h-3" />
            {experiment.winner_count}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BrandDashboardPage() {
  const searchParams = useSearchParams();
  const brandId = searchParams.get('brand_id');
  const [data, setData] = useState<BrandDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandId) {
      setError('No brand selected');
      setLoading(false);
      return;
    }

    fetch(`/api/brand/dashboard?brand_id=${brandId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setData(res.data);
        } else {
          setError(res.message || 'Failed to load dashboard');
        }
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-sm text-red-400">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const { velocity, experiments, recent_winners } = data;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          {data.brand.name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Creative velocity and experiment performance</p>
      </div>

      {/* Velocity Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Creatives This Month"
          value={velocity.creatives_this_month}
          change={velocity.velocity_change}
          icon={BarChart3}
        />
        <StatCard
          label="Active Experiments"
          value={velocity.active_experiments}
          icon={FlaskConical}
        />
        <StatCard
          label="Total Winners"
          value={velocity.total_winners}
          icon={Trophy}
        />
        <StatCard
          label="Avg Engagement"
          value={`${velocity.avg_engagement_rate}%`}
          icon={TrendingUp}
        />
      </div>

      {/* Experiments */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-zinc-200">Experiments</h2>
          <Link
            href={`/brand/creative-lab?brand_id=${brandId}`}
            className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
          >
            Creative Lab <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-5 py-2">
          {experiments.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No experiments yet</p>
          ) : (
            experiments.slice(0, 8).map(exp => (
              <ExperimentRow key={exp.id} experiment={exp} brandId={brandId!} />
            ))
          )}
        </div>
      </div>

      {/* Recent Winners */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Winners</h2>
          <Link
            href={`/brand/winners?brand_id=${brandId}`}
            className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
          >
            All Winners <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-5 py-2">
          {recent_winners.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No winners identified yet</p>
          ) : (
            recent_winners.map(w => (
              <div key={w.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {w.content_item_title || 'Untitled'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {[w.hook, w.angle, w.persona].filter(Boolean).join(' / ') || 'No tags'}
                  </div>
                </div>
                <Trophy className="w-4 h-4 text-amber-400 ml-3" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
