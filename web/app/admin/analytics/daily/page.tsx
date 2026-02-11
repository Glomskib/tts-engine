'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { BarChart, Loader2, RefreshCw, TrendingUp, TrendingDown, Video, Eye, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BestVideo {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  tiktok_url: string | null;
  product_name: string | null;
  product_brand: string | null;
}

interface DailySummary {
  id: string;
  user_id: string;
  summary_date: string;
  videos_created: number;
  videos_posted: number;
  total_views: number;
  best_video_id: string | null;
  pipeline_health: Record<string, number>;
  data: {
    videos_created: number;
    videos_posted: number;
    total_views: number;
    best_video: BestVideo | null;
    pipeline_health: Record<string, number>;
    brand_breakdown: Record<string, number>;
    generated_at: string;
  };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  SCRIPT_READY: '#a78bfa',    // violet
  RECORDING: '#60a5fa',       // blue
  RECORDED: '#38bdf8',        // sky
  EDITING: '#facc15',         // yellow
  EDITED: '#fbbf24',          // amber
  READY_TO_POST: '#34d399',   // emerald
  POSTED: '#22c55e',          // green
  ARCHIVED: '#71717a',        // zinc
  REJECTED: '#ef4444',        // red
  unknown: '#52525b',         // gray
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MiniBarChart({
  data,
  color,
  label,
}: {
  data: { date: string; count: number }[];
  color: string;
  label: string;
}) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div>
      <div className="text-xs font-medium text-zinc-400 mb-2">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {data.map(day => (
          <div
            key={day.date}
            className="flex-1 rounded-t transition-all duration-300 group relative"
            style={{
              height: `${Math.max((day.count / maxCount) * 100, 2)}%`,
              backgroundColor: color,
            }}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-100 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {day.count} &middot; {formatDate(day.date)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-zinc-600">{data.length > 0 ? formatDate(data[0].date) : ''}</span>
        <span className="text-[10px] text-zinc-600">{data.length > 0 ? formatDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

function PipelineDots({ health }: { health: Record<string, number> }) {
  const total = Object.values(health).reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="text-sm text-zinc-600">No videos</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(health)
        .sort(([, a], [, b]) => b - a)
        .map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.unknown }}
            />
            <span className="text-xs text-zinc-400">
              {status.replace(/_/g, ' ').toLowerCase()} ({count})
            </span>
          </div>
        ))}
    </div>
  );
}

function WeekComparison({
  thisWeek,
  lastWeek,
}: {
  thisWeek: { created: number; posted: number; views: number };
  lastWeek: { created: number; posted: number; views: number };
}) {
  const metrics = [
    { label: 'Created', current: thisWeek.created, prev: lastWeek.created },
    { label: 'Posted', current: thisWeek.posted, prev: lastWeek.posted },
    { label: 'Views', current: thisWeek.views, prev: lastWeek.views },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {metrics.map(m => {
        const change = pctChange(m.current, m.prev);
        const isUp = change > 0;
        const isDown = change < 0;

        return (
          <div key={m.label} className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{m.label}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold text-zinc-100">{formatNumber(m.current)}</span>
              <span className="text-sm text-zinc-500">vs {formatNumber(m.prev)}</span>
            </div>
            {change !== 0 && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? '+' : ''}{change}%
              </div>
            )}
            {change === 0 && (
              <div className="text-xs text-zinc-600 mt-1">No change</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DailyAnalyticsPage() {
  const { showSuccess, showError } = useToast();

  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);

  const HISTORY_PAGE_SIZE = 7;

  // ------ Fetch summaries ------
  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/daily-summary?days=30');
      const json = await res.json();
      if (json.ok) {
        setSummaries(json.data);
      } else {
        showError(json.error?.message || 'Failed to load summaries');
      }
    } catch {
      showError('Network error loading summaries');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // ------ Generate today's summary ------
  const generateToday = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/analytics/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayDateStr() }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess('Daily summary generated');
        await fetchSummaries();
      } else {
        showError(json.error?.message || 'Failed to generate summary');
      }
    } catch {
      showError('Network error generating summary');
    } finally {
      setGenerating(false);
    }
  };

  // ------ Derived data ------
  const today = todayDateStr();
  const todaySummary = summaries.find(s => s.summary_date === today);

  // Last 7 days for charts (oldest -> newest)
  const last7 = summaries.slice(0, 7).reverse();
  const createdChartData = last7.map(s => ({ date: s.summary_date, count: s.videos_created }));
  const postedChartData = last7.map(s => ({ date: s.summary_date, count: s.videos_posted }));
  const viewsChartData = last7.map(s => ({ date: s.summary_date, count: s.total_views }));

  // Week-over-week comparison
  const thisWeekSummaries = summaries.slice(0, 7);
  const lastWeekSummaries = summaries.slice(7, 14);

  const sumField = (arr: DailySummary[], field: 'videos_created' | 'videos_posted' | 'total_views') =>
    arr.reduce((acc, s) => acc + (s[field] || 0), 0);

  const thisWeek = {
    created: sumField(thisWeekSummaries, 'videos_created'),
    posted: sumField(thisWeekSummaries, 'videos_posted'),
    views: sumField(thisWeekSummaries, 'total_views'),
  };

  const lastWeek = {
    created: sumField(lastWeekSummaries, 'videos_created'),
    posted: sumField(lastWeekSummaries, 'videos_posted'),
    views: sumField(lastWeekSummaries, 'total_views'),
  };

  // Historical list (paginated)
  const historicalSummaries = summaries.filter(s => s.summary_date !== today);
  const totalHistoryPages = Math.max(1, Math.ceil(historicalSummaries.length / HISTORY_PAGE_SIZE));
  const pagedHistory = historicalSummaries.slice(
    historyPage * HISTORY_PAGE_SIZE,
    (historyPage + 1) * HISTORY_PAGE_SIZE
  );

  // ------ Render ------
  if (loading) {
    return (
      <AdminPageLayout title="Daily Analytics" subtitle="Loading summaries...">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Daily Analytics"
      subtitle="Track daily production metrics and trends"
      headerActions={
        <AdminButton onClick={generateToday} disabled={generating} variant="primary">
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate Today&apos;s Summary
            </>
          )}
        </AdminButton>
      }
    >
      {/* ===================== TODAY'S SUMMARY ===================== */}
      <AdminCard
        title="Today's Summary"
        subtitle={todaySummary ? formatDateFull(todaySummary.summary_date) : today}
        headerActions={
          todaySummary?.data?.generated_at ? (
            <span className="text-[11px] text-zinc-600">
              Generated {new Date(todaySummary.data.generated_at).toLocaleTimeString()}
            </span>
          ) : null
        }
      >
        {todaySummary ? (
          <div className="space-y-5">
            {/* Stat row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                <Video className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide">Created</div>
                  <div className="text-xl font-semibold text-blue-300">{todaySummary.videos_created}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <Video className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide">Posted</div>
                  <div className="text-xl font-semibold text-emerald-300">{todaySummary.videos_posted}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <Eye className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide">Total Views</div>
                  <div className="text-xl font-semibold text-amber-300">{formatNumber(todaySummary.total_views)}</div>
                </div>
              </div>
            </div>

            {/* Best video */}
            {todaySummary.data?.best_video && (
              <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Best Performing Video (30d)</div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">
                      {todaySummary.data.best_video.title || 'Untitled'}
                    </div>
                    {todaySummary.data.best_video.product_name && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {todaySummary.data.best_video.product_brand && (
                          <span className="text-zinc-400">{todaySummary.data.best_video.product_brand} &middot; </span>
                        )}
                        {todaySummary.data.best_video.product_name}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold text-violet-400">
                      {formatNumber(todaySummary.data.best_video.views)} views
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {formatNumber(todaySummary.data.best_video.likes)} likes &middot;{' '}
                      {formatNumber(todaySummary.data.best_video.comments)} comments
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline health */}
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Pipeline Health</div>
              <PipelineDots health={todaySummary.pipeline_health || todaySummary.data?.pipeline_health || {}} />
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <BarChart className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 mb-3">
              No summary generated for today yet.
            </p>
            <AdminButton onClick={generateToday} disabled={generating} variant="secondary" size="sm">
              {generating ? 'Generating...' : 'Generate Now'}
            </AdminButton>
          </div>
        )}
      </AdminCard>

      {/* ===================== TRENDS (BAR CHARTS) ===================== */}
      {last7.length > 1 && (
        <AdminCard title="7-Day Trends" subtitle="Daily production metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <MiniBarChart data={createdChartData} color="#3b82f6" label="Videos Created" />
            <MiniBarChart data={postedChartData} color="#22c55e" label="Videos Posted" />
            <MiniBarChart data={viewsChartData} color="#f59e0b" label="Total Views" />
          </div>
        </AdminCard>
      )}

      {/* ================ WEEK-OVER-WEEK COMPARISON ================ */}
      {thisWeekSummaries.length > 0 && (
        <AdminCard title="Week-over-Week" subtitle="This week vs. last week">
          <WeekComparison thisWeek={thisWeek} lastWeek={lastWeek} />
        </AdminCard>
      )}

      {/* ==================== HISTORICAL LIST ==================== */}
      {historicalSummaries.length > 0 && (
        <AdminCard
          title="Historical Summaries"
          subtitle={`${historicalSummaries.length} past ${historicalSummaries.length === 1 ? 'summary' : 'summaries'}`}
          headerActions={
            totalHistoryPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className="p-1 rounded hover:bg-white/5 text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-zinc-500">
                  {historyPage + 1} / {totalHistoryPages}
                </span>
                <button
                  onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))}
                  disabled={historyPage >= totalHistoryPages - 1}
                  className="p-1 rounded hover:bg-white/5 text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : null
          }
        >
          <div className="divide-y divide-white/5">
            {pagedHistory.map(s => {
              const bestVideo = s.data?.best_video;
              return (
                <div key={s.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{formatDateFull(s.summary_date)}</div>
                      {bestVideo && (
                        <div className="text-xs text-zinc-500 truncate">
                          Top: {bestVideo.title || 'Untitled'} ({formatNumber(bestVideo.views)} views)
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <div className="text-sm font-medium text-blue-400">{s.videos_created}</div>
                      <div className="text-[10px] text-zinc-600">created</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-emerald-400">{s.videos_posted}</div>
                      <div className="text-[10px] text-zinc-600">posted</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-amber-400">{formatNumber(s.total_views)}</div>
                      <div className="text-[10px] text-zinc-600">views</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      )}

      {/* Empty state when no summaries at all */}
      {summaries.length === 0 && (
        <AdminCard>
          <div className="text-center py-12">
            <BarChart className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-100 mb-1">No Summaries Yet</h3>
            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
              Generate your first daily summary to start tracking production trends over time.
            </p>
            <AdminButton onClick={generateToday} disabled={generating}>
              {generating ? 'Generating...' : "Generate Today's Summary"}
            </AdminButton>
          </div>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
