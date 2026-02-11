'use client';

import { useState, useEffect } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { Trophy, Loader2, RefreshCw, TrendingUp, BarChart, Lightbulb, Zap, Star, Target } from 'lucide-react';

// --- Types ---

interface HookType {
  type: string;
  count: number;
  avg_views: number;
  example: string;
}

interface BestFormat {
  format: string;
  count: number;
  win_rate: number;
}

interface TopCategory {
  category: string;
  wins: number;
  total: number;
  win_rate: number;
}

interface PatternAnalysis {
  id?: string;
  winning_formula: string;
  top_hook_types: HookType[];
  best_formats: BestFormat[];
  common_phrases: string[];
  top_categories: TopCategory[];
  recommendations: string[];
  analyzed_at: string;
  winners_analyzed: number;
}

// --- Helpers ---

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// --- Component ---

export default function WinnerPatternsPage() {
  const { showError } = useToast();

  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch latest analysis on mount
  useEffect(() => {
    fetchLatestAnalysis();
  }, []);

  async function fetchLatestAnalysis() {
    setLoading(true);
    try {
      const res = await fetch('/api/winners/analyze-patterns');
      const data = await res.json();
      if (data.ok && data.data) {
        setAnalysis(data.data);
      } else {
        setAnalysis(null);
      }
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/winners/analyze-patterns', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setAnalysis(data.data);
      } else {
        showError(data.error || 'Analysis failed. Please try again.');
      }
    } catch {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  // Find max values for bar chart scaling
  const maxFormatCount = analysis?.best_formats?.length
    ? Math.max(...analysis.best_formats.map((f) => f.count))
    : 1;
  const maxCategoryWinRate = analysis?.top_categories?.length
    ? Math.max(...analysis.top_categories.map((c) => c.win_rate))
    : 1;

  return (
    <AdminPageLayout
      title="Winner Patterns"
      subtitle="AI-powered analysis of your top-performing videos"
      maxWidth="2xl"
      headerActions={
        <div className="flex items-center gap-3">
          {analysis && (
            <span className="text-xs text-zinc-500">
              Last analyzed: {formatRelativeTime(analysis.analyzed_at)}
            </span>
          )}
          <AdminButton
            onClick={runAnalysis}
            disabled={analyzing}
            variant="primary"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : analysis ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-analyze
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Analyze Patterns
              </>
            )}
          </AdminButton>
        </div>
      }
    >
      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-zinc-900/50 border border-white/10 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Analyzing Overlay */}
      {analyzing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">
              Analyzing Winner Patterns
            </h3>
            <p className="text-sm text-zinc-400">
              Claude is reviewing your winners bank and extracting patterns.
              This usually takes 10-20 seconds.
            </p>
            <div className="mt-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-indeterminate" />
            </div>
          </div>
        </div>
      )}

      {/* Empty State / CTA */}
      {!loading && !analysis && !analyzing && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            Run Your First Analysis
          </h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
            Analyze your winners bank to discover patterns in hooks, formats,
            and categories that drive the best performance.
          </p>
          <AdminButton onClick={runAnalysis} variant="primary" size="lg">
            <Zap className="w-5 h-5 mr-2" />
            Analyze Patterns
          </AdminButton>
        </div>
      )}

      {/* Analysis Results */}
      {!loading && analysis && (
        <div className="space-y-6">
          {/* Meta bar */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>
              Based on <strong className="text-zinc-300">{analysis.winners_analyzed}</strong> winner{analysis.winners_analyzed !== 1 ? 's' : ''}
            </span>
            <span className="text-zinc-700">|</span>
            <span>
              Analyzed {formatRelativeTime(analysis.analyzed_at)}
            </span>
          </div>

          {/* Winning Formula */}
          <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
            <div className="relative p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-amber-300">
                    Winning Formula
                  </h2>
                  <p className="text-xs text-amber-500/70">
                    The pattern behind your best performers
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-zinc-200">
                {analysis.winning_formula}
              </p>
            </div>
          </div>

          {/* Two-column grid for Hook Types + Best Formats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Hook Types */}
            <AdminCard
              title="Top Hook Types"
              subtitle="Most effective opening patterns"
              headerActions={
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              }
            >
              {analysis.top_hook_types?.length > 0 ? (
                <div className="space-y-3">
                  {analysis.top_hook_types.map((hook, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-zinc-800/50 border border-white/5 hover:border-emerald-500/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-medium text-zinc-100">
                            {hook.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 flex-shrink-0">
                          <span>{hook.count} winner{hook.count !== 1 ? 's' : ''}</span>
                          <span className="text-emerald-400 font-medium">
                            {formatNumber(hook.avg_views)} avg views
                          </span>
                        </div>
                      </div>
                      {hook.example && (
                        <p className="text-xs text-zinc-400 mt-1.5 pl-8 italic">
                          &ldquo;{hook.example}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No hook type data available
                </p>
              )}
            </AdminCard>

            {/* Best Formats */}
            <AdminCard
              title="Best Formats"
              subtitle="Content formats with highest win rates"
              headerActions={
                <BarChart className="w-4 h-4 text-blue-400" />
              }
            >
              {analysis.best_formats?.length > 0 ? (
                <div className="space-y-3">
                  {analysis.best_formats.map((format, idx) => {
                    const widthPct = Math.max(
                      8,
                      (format.count / maxFormatCount) * 100
                    );
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-zinc-200">
                            {format.format}
                          </span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-zinc-500">
                              {format.count} video{format.count !== 1 ? 's' : ''}
                            </span>
                            <span className="text-blue-400 font-semibold">
                              {format.win_rate}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No format data available
                </p>
              )}
            </AdminCard>
          </div>

          {/* Common Phrases */}
          <AdminCard
            title="Common Phrases"
            subtitle="Words and phrases that appear in winning content"
            headerActions={
              <Lightbulb className="w-4 h-4 text-yellow-400" />
            }
          >
            {analysis.common_phrases?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysis.common_phrases.map((phrase, idx) => {
                  // Cycle through accent colors for visual variety
                  const colors = [
                    'bg-violet-500/15 text-violet-300 border-violet-500/20',
                    'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
                    'bg-amber-500/15 text-amber-300 border-amber-500/20',
                    'bg-blue-500/15 text-blue-300 border-blue-500/20',
                    'bg-rose-500/15 text-rose-300 border-rose-500/20',
                    'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
                    'bg-orange-500/15 text-orange-300 border-orange-500/20',
                    'bg-pink-500/15 text-pink-300 border-pink-500/20',
                  ];
                  const colorClass = colors[idx % colors.length];

                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border ${colorClass}`}
                    >
                      {phrase}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                No phrase data available
              </p>
            )}
          </AdminCard>

          {/* Top Categories */}
          <AdminCard
            title="Top Categories"
            subtitle="Product categories ranked by win rate"
            headerActions={
              <Target className="w-4 h-4 text-orange-400" />
            }
          >
            {analysis.top_categories?.length > 0 ? (
              <div className="space-y-3">
                {analysis.top_categories.map((cat, idx) => {
                  const barPct = Math.max(
                    8,
                    (cat.win_rate / maxCategoryWinRate) * 100
                  );
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-40 flex-shrink-0">
                        <span className="flex-shrink-0 w-6 h-6 rounded-md bg-orange-500/15 text-orange-400 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-zinc-200 truncate capitalize">
                          {cat.category}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-shrink-0 w-32 justify-end">
                          <span className="text-zinc-500">
                            {cat.wins}/{cat.total}
                          </span>
                          <span className="text-orange-400 font-semibold w-12 text-right">
                            {cat.win_rate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">
                No category data available
              </p>
            )}
          </AdminCard>

          {/* Recommendations */}
          <div className="relative overflow-hidden rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent">
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/5 rounded-full blur-2xl translate-y-12 -translate-x-12" />
            <div className="relative p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Star className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-blue-300">
                    Recommendations
                  </h2>
                  <p className="text-xs text-blue-500/70">
                    Actionable tips to improve your next videos
                  </p>
                </div>
              </div>
              {analysis.recommendations?.length > 0 ? (
                <ol className="space-y-3">
                  {analysis.recommendations.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 text-sm font-bold flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-zinc-200 pt-1">
                        {tip}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No recommendations available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indeterminate progress bar animation */}
      <style jsx>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
            width: 40%;
          }
          50% {
            transform: translateX(60%);
            width: 60%;
          }
          100% {
            transform: translateX(200%);
            width: 40%;
          }
        }
        .animate-indeterminate {
          animation: indeterminate 1.8s ease-in-out infinite;
        }
      `}</style>
    </AdminPageLayout>
  );
}
