'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, EmptyState } from '../components/AdminPageLayout';
import { GraduationCap, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';

interface ReportCard {
  id: string;
  week_start: string;
  week_end: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  videos_published: number;
  engagement_rate: number;
  views_change_pct: number | null;
  likes_change_pct: number | null;
  engagement_change_pct: number | null;
  videos_change_pct: number | null;
  best_video_title: string | null;
  best_video_views: number | null;
  worst_video_title: string | null;
  worst_video_views: number | null;
  grade: string;
  ai_summary: string;
  wins: string[];
  improvements: string[];
  tip_of_the_week: string;
  created_at: string;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  'A': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  'A-': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  'B+': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'B': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'B-': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'C+': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'C': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'C-': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'D': 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  'F': 'text-red-400 bg-red-500/10 border-red-500/30',
};

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function HeroReportCard({ card }: { card: ReportCard }) {
  const gradeClass = GRADE_COLORS[card.grade] || GRADE_COLORS['C'];

  return (
    <AdminCard>
      {/* Grade + Period Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${gradeClass}`}>
          {card.grade}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">This Week&apos;s Report Card</h2>
          <p className="text-sm text-zinc-500">{formatDateRange(card.week_start, card.week_end)}</p>
        </div>
      </div>

      {/* AI Summary */}
      <p className="text-zinc-300 text-sm leading-relaxed mb-6">{card.ai_summary}</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <Eye className="w-3 h-3" /> Views
          </div>
          <div className="text-lg font-semibold text-zinc-100">{card.total_views.toLocaleString()}</div>
          <ChangeIndicator value={card.views_change_pct} />
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <Heart className="w-3 h-3" /> Likes
          </div>
          <div className="text-lg font-semibold text-zinc-100">{card.total_likes.toLocaleString()}</div>
          <ChangeIndicator value={card.likes_change_pct} />
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <MessageCircle className="w-3 h-3" /> Engagement
          </div>
          <div className="text-lg font-semibold text-zinc-100">{card.engagement_rate.toFixed(1)}%</div>
          <ChangeIndicator value={card.engagement_change_pct} />
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <Share2 className="w-3 h-3" /> Videos
          </div>
          <div className="text-lg font-semibold text-zinc-100">{card.videos_published}</div>
          <ChangeIndicator value={card.videos_change_pct} />
        </div>
      </div>

      {/* Wins & Improvements */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {card.wins && card.wins.length > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-4">
            <h3 className="text-sm font-medium text-emerald-400 mb-2">Wins</h3>
            <ul className="space-y-1.5">
              {card.wins.map((w, i) => (
                <li key={i} className="text-sm text-zinc-300 flex gap-2">
                  <span className="text-emerald-400 shrink-0">+</span> {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {card.improvements && card.improvements.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-4">
            <h3 className="text-sm font-medium text-amber-400 mb-2">Room for Growth</h3>
            <ul className="space-y-1.5">
              {card.improvements.map((imp, i) => (
                <li key={i} className="text-sm text-zinc-300 flex gap-2">
                  <span className="text-amber-400 shrink-0">-</span> {imp}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Tip of the Week */}
      {card.tip_of_the_week && (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-4">
          <h3 className="text-sm font-medium text-teal-400 mb-1">Tip of the Week</h3>
          <p className="text-sm text-zinc-300">{card.tip_of_the_week}</p>
        </div>
      )}

      {/* Best / Worst Videos */}
      {(card.best_video_title || card.worst_video_title) && (
        <div className="mt-4 pt-4 border-t border-white/5 grid sm:grid-cols-2 gap-3">
          {card.best_video_title && (
            <div className="text-sm">
              <span className="text-zinc-500">Best:</span>{' '}
              <span className="text-zinc-300">&ldquo;{card.best_video_title}&rdquo;</span>{' '}
              <span className="text-zinc-500">({card.best_video_views?.toLocaleString()} views)</span>
            </div>
          )}
          {card.worst_video_title && (
            <div className="text-sm">
              <span className="text-zinc-500">Lowest:</span>{' '}
              <span className="text-zinc-300">&ldquo;{card.worst_video_title}&rdquo;</span>{' '}
              <span className="text-zinc-500">({card.worst_video_views?.toLocaleString()} views)</span>
            </div>
          )}
        </div>
      )}
    </AdminCard>
  );
}

function HistoricalCard({ card }: { card: ReportCard }) {
  const [expanded, setExpanded] = useState(false);
  const gradeClass = GRADE_COLORS[card.grade] || GRADE_COLORS['C'];

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-sm font-bold ${gradeClass}`}>
            {card.grade}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-zinc-200">{formatDateRange(card.week_start, card.week_end)}</p>
            <p className="text-xs text-zinc-500">
              {card.total_views.toLocaleString()} views · {card.videos_published} videos · {card.engagement_rate.toFixed(1)}% engagement
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-white/5 pt-4 space-y-3">
          <p className="text-sm text-zinc-300">{card.ai_summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-xs text-zinc-500">Views</div>
              <div className="text-sm font-medium text-zinc-200">{card.total_views.toLocaleString()}</div>
              <ChangeIndicator value={card.views_change_pct} />
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500">Likes</div>
              <div className="text-sm font-medium text-zinc-200">{card.total_likes.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500">Engagement</div>
              <div className="text-sm font-medium text-zinc-200">{card.engagement_rate.toFixed(1)}%</div>
              <ChangeIndicator value={card.engagement_change_pct} />
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500">Videos</div>
              <div className="text-sm font-medium text-zinc-200">{card.videos_published}</div>
            </div>
          </div>

          {card.wins && card.wins.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-emerald-400 mb-1">Wins</h4>
              {card.wins.map((w, i) => (
                <p key={i} className="text-xs text-zinc-400">+ {w}</p>
              ))}
            </div>
          )}

          {card.improvements && card.improvements.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-amber-400 mb-1">Improvements</h4>
              {card.improvements.map((imp, i) => (
                <p key={i} className="text-xs text-zinc-400">- {imp}</p>
              ))}
            </div>
          )}

          {card.tip_of_the_week && (
            <div className="bg-teal-500/5 border border-teal-500/10 rounded p-2">
              <p className="text-xs text-teal-300">{card.tip_of_the_week}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportCardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ReportCard[]>([]);

  const fetchCards = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login?redirect=/admin/report-card');
        return;
      }

      const { data, error } = await supabase
        .from('content_report_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(52);

      if (error) {
        console.error('[report-card] Fetch error:', error);
      }

      setCards(data || []);
    } catch (err) {
      console.error('[report-card] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  if (loading) {
    return (
      <AdminPageLayout title="Report Card" subtitle="Weekly AI-powered performance reviews" showNav maxWidth="xl">
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminPageLayout>
    );
  }

  const [latest, ...historical] = cards;

  return (
    <AdminPageLayout title="Report Card" subtitle="Weekly AI-powered performance reviews" showNav maxWidth="xl">
      {!latest ? (
        <AdminCard>
          <EmptyState
            icon={<GraduationCap className="w-6 h-6" />}
            title="No Report Cards Yet"
            description="Your first report card will be generated after your TikTok videos are synced. Report cards are created weekly with AI-powered insights about your content performance."
          />
        </AdminCard>
      ) : (
        <>
          <HeroReportCard card={latest} />

          {historical.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-100 mb-3">Previous Weeks</h2>
              <div className="space-y-2">
                {historical.map((card) => (
                  <HistoricalCard key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AdminPageLayout>
  );
}
