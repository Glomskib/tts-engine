'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, StatCard } from '../components/AdminPageLayout';
import {
  Brain, TrendingUp, Clock, Package, Sparkles, Loader2, RefreshCw,
  FlaskConical, Trophy, Lightbulb, ArrowRight,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface ContentInsight {
  type: string;
  title: string;
  message: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

interface ContentIntelligence {
  insights: ContentInsight[];
  top_hook: string | null;
  best_product: string | null;
  best_time: string | null;
  replication_suggestion: string | null;
}

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  top_hook: <Trophy className="w-4 h-4 text-amber-400" />,
  best_product: <Package className="w-4 h-4 text-teal-400" />,
  best_time: <Clock className="w-4 h-4 text-blue-400" />,
  replication: <Sparkles className="w-4 h-4 text-violet-400" />,
};

export default function IntelligencePage() {
  const { showError } = useToast();
  const [data, setData] = useState<ContentIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      showError('Failed to load intelligence data');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <AdminPageLayout title="Content Intelligence" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Content Intelligence"
      subtitle="Data-driven insights from your content performance"
      maxWidth="2xl"
      headerActions={
        <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Top Hook" value={data?.top_hook ? '1' : '—'} variant="success" />
        <StatCard label="Best Product" value={data?.best_product || '—'} />
        <StatCard label="Best Time" value={data?.best_time || '—'} variant="warning" />
        <StatCard label="Insights" value={data?.insights.length || 0} />
      </div>

      {/* Insights */}
      <AdminCard title="Insights" subtitle="Patterns detected from your content data">
        {!data?.insights.length ? (
          <p className="text-sm text-zinc-500 py-6 text-center">No insights yet. Post more content to unlock intelligence.</p>
        ) : (
          <div className="space-y-3">
            {data.insights.map((insight, idx) => (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {INSIGHT_ICONS[insight.type] || <Lightbulb className="w-4 h-4 text-zinc-400" />}
                  <h3 className="text-sm font-semibold text-white">{insight.title}</h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{insight.message}</p>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {/* Replication Suggestion */}
      {data?.replication_suggestion && (
        <AdminCard title="Replication Suggestion" subtitle="Based on your winning content">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-sm text-white leading-relaxed">{data.replication_suggestion}</p>
            <Link
              href={`/admin/content-studio?inspiration=${encodeURIComponent(data.replication_suggestion)}`}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium bg-teal-600 text-white active:bg-teal-700"
            >
              <Sparkles className="w-4 h-4" /> Create Script from This
            </Link>
          </div>
        </AdminCard>
      )}

      {/* Navigation to sub-pages */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/intelligence/hooks" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Hook Performance</h3>
          </div>
          <p className="text-xs text-zinc-500">See your best, worst, and trending hooks</p>
          <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 mt-2 transition-colors" />
        </Link>

        <Link href="/admin/intelligence/experiments" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Experiments</h3>
          </div>
          <p className="text-xs text-zinc-500">Generate new hooks from winning patterns</p>
          <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 mt-2 transition-colors" />
        </Link>

        <Link href="/admin/intelligence/winners" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Replication Engine</h3>
          </div>
          <p className="text-xs text-zinc-500">Replicate your top-performing content</p>
          <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 mt-2 transition-colors" />
        </Link>
      </div>
    </AdminPageLayout>
  );
}
