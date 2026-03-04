'use client';

import { useState, useEffect, useCallback } from 'react';
import { Anchor, Star, Copy, Check, ExternalLink } from 'lucide-react';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard } from '../components/AdminPageLayout';

interface HookPattern {
  id: string;
  pattern: string;
  example_hook: string | null;
  performance_score: number;
  uses_count: number;
  source_post_id: string | null;
  created_at: string;
}

const SCORE_FILTERS = [
  { label: 'All Scores', value: 0 },
  { label: '7+ (Good)', value: 7 },
  { label: '8+ (Great)', value: 8 },
  { label: '9+ (Elite)', value: 9 },
];

export default function HookLibraryPage() {
  const [hooks, setHooks] = useState<HookPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (minScore > 0) params.set('min_score', String(minScore));

      const res = await fetch(`/api/hook-patterns?${params}`);
      const data = await res.json();

      if (data.ok) {
        setHooks(data.data);
        setError('');
      } else {
        setError(data.error || 'Failed to load hooks');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [minScore]);

  useEffect(() => {
    fetchHooks();
  }, [fetchHooks]);

  const handleCopy = async (hook: HookPattern) => {
    const text = hook.example_hook || hook.pattern;
    await navigator.clipboard.writeText(text);
    setCopiedId(hook.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleUseHook = (hook: HookPattern) => {
    const hookText = hook.example_hook || hook.pattern;
    // Navigate to content studio with hook pre-filled via query param
    window.location.href = `/admin/content-studio?hook=${encodeURIComponent(hookText)}`;
  };

  const avgScore = hooks.length > 0
    ? (hooks.reduce((sum, h) => sum + h.performance_score, 0) / hooks.length).toFixed(1)
    : '0';

  const totalUses = hooks.reduce((sum, h) => sum + h.uses_count, 0);
  const eliteCount = hooks.filter(h => h.performance_score >= 9).length;

  const scoreColor = (score: number) => {
    if (score >= 9) return 'text-emerald-400';
    if (score >= 7) return 'text-teal-400';
    if (score >= 5) return 'text-amber-400';
    return 'text-zinc-400';
  };

  const scoreBg = (score: number) => {
    if (score >= 9) return 'bg-emerald-500/10 border-emerald-500/20';
    if (score >= 7) return 'bg-teal-500/10 border-teal-500/20';
    if (score >= 5) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-zinc-500/10 border-zinc-500/20';
  };

  return (
    <AdminPageLayout
      title="Hook Library"
      subtitle="High-performing hook patterns extracted from your content"
      maxWidth="2xl"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Hooks" value={hooks.length} />
        <StatCard label="Avg Score" value={avgScore} />
        <StatCard label="Total Uses" value={totalUses} />
        <StatCard label="Elite (9+)" value={eliteCount} variant="success" />
      </div>

      {/* Filters */}
      <AdminCard title="Hook Patterns" noPadding>
        <div className="px-5 py-3 border-b border-white/10 flex flex-col sm:flex-row gap-3">
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          >
            {SCORE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12 text-center text-zinc-500">Loading hook patterns...</div>
        ) : error ? (
          <div className="py-12 text-center text-red-400">{error}</div>
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={<Anchor className="w-8 h-8" />}
            title="No hook patterns yet"
            description="Hook patterns are automatically extracted when AI postmortems detect high-performing hooks (score 7+). Generate postmortems on your posts to start building your library."
          />
        ) : (
          <>
            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-white/5">
              {hooks.map((hook) => (
                <div key={hook.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{hook.pattern}</p>
                      {hook.example_hook && hook.example_hook !== hook.pattern && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">&ldquo;{hook.example_hook}&rdquo;</p>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${scoreBg(hook.performance_score)} ${scoreColor(hook.performance_score)}`}>
                      <Star className="w-3 h-3 mr-1" />
                      {hook.performance_score}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">{hook.uses_count} uses</span>
                    <span className="text-zinc-700">&middot;</span>
                    <span className="text-xs text-zinc-600">{new Date(hook.created_at).toLocaleDateString()}</span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => handleCopy(hook)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] ${
                          copiedId === hook.id
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                        }`}
                      >
                        {copiedId === hook.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => handleUseHook(hook)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500/20 text-teal-400 active:bg-teal-500/30 min-h-[36px]"
                      >
                        Use Hook
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Pattern</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Example</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-zinc-500 uppercase tracking-wide">Score</th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-zinc-500 uppercase tracking-wide">Uses</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {hooks.map((hook) => (
                    <tr key={hook.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-zinc-200 font-medium max-w-[200px] truncate">{hook.pattern}</td>
                      <td className="px-5 py-3 text-zinc-400 max-w-[300px] truncate">
                        {hook.example_hook && hook.example_hook !== hook.pattern ? hook.example_hook : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${scoreBg(hook.performance_score)} ${scoreColor(hook.performance_score)}`}>
                          {hook.performance_score}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-zinc-400">{hook.uses_count}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopy(hook)}
                            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors p-1"
                            title="Copy hook text"
                          >
                            {copiedId === hook.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <AdminButton
                            onClick={() => handleUseHook(hook)}
                            variant="primary"
                            size="sm"
                          >
                            Use Hook
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
