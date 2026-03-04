'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, StatCard } from '../../components/AdminPageLayout';
import {
  TrendingUp, TrendingDown, Sparkles, Loader2, RefreshCw,
  ArrowRight, Zap, AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface HookEntry {
  id: string;
  hook: string;
  pattern: string;
  avg_score: number;
  videos: number;
}

interface TrendingHook {
  id: string;
  hook: string;
  pattern: string;
  growth_rate: number;
}

interface HookData {
  best_hooks: HookEntry[];
  worst_hooks: HookEntry[];
  trending_hooks: TrendingHook[];
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
    : score >= 4 ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
    : 'text-red-400 bg-red-400/10 border-red-400/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function HookRow({ hook, action }: { hook: HookEntry | TrendingHook; action: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-white leading-relaxed">
        &ldquo;{hook.hook}&rdquo;
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        {'avg_score' in hook && <ScoreBadge score={hook.avg_score} />}
        {'videos' in hook && (
          <span className="text-xs text-zinc-500">{hook.videos} video{hook.videos !== 1 ? 's' : ''}</span>
        )}
        {'growth_rate' in hook && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${hook.growth_rate > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {hook.growth_rate > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {hook.growth_rate > 0 ? '+' : ''}{hook.growth_rate}%
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export default function HookPerformancePage() {
  const { showError } = useToast();
  const [data, setData] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/hooks');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      showError('Failed to load hook data');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generateLink = (hook: string) => {
    const params = new URLSearchParams({ inspiration: hook });
    return `/admin/content-studio?${params.toString()}`;
  };

  if (loading) {
    return (
      <AdminPageLayout title="Hook Performance" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  const totalHooks = (data?.best_hooks.length || 0) + (data?.worst_hooks.length || 0);

  return (
    <AdminPageLayout
      title="Hook Performance"
      subtitle="See which hooks perform best, worst, and trending"
      maxWidth="2xl"
      headerActions={
        <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Hooks" value={totalHooks} />
        <StatCard label="Top Score" value={data?.best_hooks[0]?.avg_score.toFixed(1) || '—'} variant="success" />
        <StatCard label="Trending" value={data?.trending_hooks.length || 0} variant="warning" />
      </div>

      {/* Top Hooks */}
      <AdminCard title="Top Hooks" subtitle="Your best performing hook patterns">
        {!data?.best_hooks.length ? (
          <p className="text-sm text-zinc-500 py-6 text-center">No hook performance data yet. Post more content to see patterns.</p>
        ) : (
          <div className="space-y-3">
            {data.best_hooks.map(hook => (
              <HookRow key={hook.id} hook={hook} action={
                <Link
                  href={generateLink(hook.hook)}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium transition-colors bg-teal-600 text-white active:bg-teal-700"
                >
                  <Sparkles className="w-4 h-4" /> Generate 3 Variations
                </Link>
              } />
            ))}
          </div>
        )}
      </AdminCard>

      {/* Worst Hooks */}
      {data?.worst_hooks && data.worst_hooks.length > 0 && (
        <AdminCard title="Worst Hooks" subtitle="Consider retiring or reworking these">
          <div className="space-y-3">
            {data.worst_hooks.map(hook => (
              <HookRow key={hook.id} hook={hook} action={
                <Link
                  href={generateLink(hook.hook)}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium transition-colors bg-zinc-800 text-zinc-200 border border-zinc-700 active:bg-zinc-700"
                >
                  <AlertTriangle className="w-4 h-4" /> Rework This Hook
                </Link>
              } />
            ))}
          </div>
        </AdminCard>
      )}

      {/* Trending Hooks */}
      {data?.trending_hooks && data.trending_hooks.length > 0 && (
        <AdminCard title="Trending Hooks" subtitle="Recently added hooks outperforming your average">
          <div className="space-y-3">
            {data.trending_hooks.map(hook => (
              <HookRow key={hook.id} hook={hook} action={
                <Link
                  href={generateLink(hook.hook)}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium transition-colors bg-violet-600 text-white active:bg-violet-700"
                >
                  <Zap className="w-4 h-4" /> Double Down
                </Link>
              } />
            ))}
          </div>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
