'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton } from '../components/AdminPageLayout';
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Trophy,
  Users,
  Package,
  FileText,
  Sparkles,
  Target,
  Zap,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrendingHook {
  hookText: string;
  hookType: string;
  performanceScore: number | null;
  viewCount: number | null;
  category: string | null;
}

interface TopPersona {
  personaName: string;
  avgScore: number;
  scriptCount: number;
}

interface Suggestion {
  type: string;
  title: string;
  message: string;
  action?: { label: string; href: string };
}

interface ContentIdeasData {
  trendingHooks: TrendingHook[];
  topPersonas: TopPersona[];
  suggestions: Suggestion[];
  stats: {
    totalWinners: number;
    totalPersonas: number;
    totalProducts: number;
    totalScripts: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HOOK_TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  question:  { label: 'Question',   classes: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  story:     { label: 'Story',      classes: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  problem:   { label: 'Problem',    classes: 'text-red-400 bg-red-500/10 border-red-500/20' },
  direct:    { label: 'Direct',     classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  shock:     { label: 'Shock/Stat', classes: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  statement: { label: 'Statement',  classes: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};

const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  stale_product: <Package size={16} className="text-amber-400" />,
  hot_persona:   <TrendingUp size={16} className="text-emerald-400" />,
  need_personas: <Users size={16} className="text-blue-400" />,
  need_winners:  <Trophy size={16} className="text-violet-400" />,
};

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ContentIdeasPage() {
  const [data, setData] = useState<ContentIdeasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/content-ideas');
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to load content ideas');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AdminPageLayout
      title="Content Ideas"
      subtitle="Get inspired by what's working — hooks, personas, and smart suggestions"
      headerActions={
        <Link href="/admin/content-studio">
          <AdminButton variant="primary" size="sm">
            <Sparkles size={16} className="mr-1.5" />
            Content Studio
          </AdminButton>
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
        </div>
      ) : error ? (
        <AdminCard>
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle size={20} />
            <p className="text-sm">{error}</p>
          </div>
        </AdminCard>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Winners',  value: data.stats.totalWinners,  icon: Trophy,   color: 'text-amber-400' },
              { label: 'Personas', value: data.stats.totalPersonas, icon: Users,    color: 'text-blue-400' },
              { label: 'Products', value: data.stats.totalProducts, icon: Package,  color: 'text-emerald-400' },
              { label: 'Scripts',  value: data.stats.totalScripts,  icon: FileText, color: 'text-violet-400' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon size={14} className={stat.color} />
                  <span className="text-xs text-zinc-500">{stat.label}</span>
                </div>
                <p className="text-xl font-semibold text-zinc-100">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* ─── Trending Angles ─────────────────────────────────────── */}
          <AdminCard
            title="Trending Angles"
            subtitle="Top performing hooks and personas based on your winners and scripts"
          >
            {data.trendingHooks.length === 0 && data.topPersonas.length === 0 ? (
              <div className="text-center py-8">
                <Trophy size={32} className="mx-auto text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400 mb-1">No trending data yet</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Save winners to the Winners Bank and generate scored scripts to see what works best
                </p>
                <Link href="/admin/winners">
                  <AdminButton variant="secondary" size="sm">
                    <Trophy size={14} className="mr-1.5" />
                    Go to Winners Bank
                  </AdminButton>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Top Hooks */}
                {data.trendingHooks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Zap size={12} />
                      Top Performing Hooks
                    </h4>
                    <div className="space-y-2">
                      {data.trendingHooks.map((hook, idx) => {
                        const style = HOOK_TYPE_STYLES[hook.hookType] || HOOK_TYPE_STYLES.statement;
                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-4 py-3 group hover:border-white/10 transition-colors"
                          >
                            <span className="text-lg font-bold text-zinc-600 mt-0.5 w-5 text-right shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 leading-relaxed">
                                &ldquo;{hook.hookText}&rdquo;
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-xs border ${style.classes}`}>
                                  {style.label}
                                </span>
                                {hook.category && (
                                  <span className="text-xs text-zinc-500">{hook.category}</span>
                                )}
                                {hook.viewCount != null && hook.viewCount > 0 && (
                                  <span className="text-xs text-zinc-500">
                                    {hook.viewCount >= 1000
                                      ? `${(hook.viewCount / 1000).toFixed(1)}K`
                                      : hook.viewCount}{' '}
                                    views
                                  </span>
                                )}
                              </div>
                            </div>
                            <Link
                              href={`/admin/content-studio?inspiration=${encodeURIComponent(hook.hookText)}`}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            >
                              <AdminButton variant="secondary" size="sm">
                                Use this angle
                                <ArrowRight size={12} className="ml-1" />
                              </AdminButton>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top Personas */}
                {data.topPersonas.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Target size={12} />
                      Top Performing Personas
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {data.topPersonas.map((persona, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-white/10 bg-zinc-800/40 px-4 py-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-sm font-medium text-zinc-100">{persona.personaName}</h5>
                            {persona.avgScore > 0 && (
                              <span className="text-xs font-mono text-emerald-400">
                                {persona.avgScore.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mb-2">
                            {persona.scriptCount} script{persona.scriptCount !== 1 ? 's' : ''} scored
                          </p>
                          <Link
                            href="/admin/content-studio"
                            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                          >
                            Use this persona <ArrowRight size={10} />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </AdminCard>

          {/* ─── Suggestions ─────────────────────────────────────────── */}
          <AdminCard
            title="Suggestions"
            subtitle="Smart recommendations to improve your content output"
          >
            {data.suggestions.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles size={32} className="mx-auto text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400">You&apos;re all caught up!</p>
                <p className="text-xs text-zinc-500">
                  No suggestions right now — keep creating great content
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.suggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-4 py-3"
                  >
                    <div className="mt-0.5 shrink-0">
                      {SUGGESTION_ICONS[suggestion.type] || (
                        <Lightbulb size={16} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{suggestion.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{suggestion.message}</p>
                    </div>
                    {suggestion.action && (
                      <Link href={suggestion.action.href} className="shrink-0">
                        <AdminButton variant="secondary" size="sm">
                          {suggestion.action.label}
                          <ArrowRight size={12} className="ml-1" />
                        </AdminButton>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      ) : null}
    </AdminPageLayout>
  );
}
