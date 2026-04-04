'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Sparkles,
  Zap,
  TrendingUp,
  Eye,
  Clock,
  Users,
  Bookmark,
  BookmarkCheck,
  X,
  ArrowRight,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import VisualHooksPanel from '@/components/VisualHooksPanel';

// ── Types ─────────────────────────────────────────────────────────

interface OpportunityCard {
  id: string;
  topic: string;
  recommendation: 'ACT_NOW' | 'TEST_SOON' | 'WATCH' | 'SKIP';
  score: number;
  earlyness: number;
  saturation: number;
  why_now: string;
  suggested_angle: string;
  signals: {
    creator_count: number;
    signal_count: number;
    velocity_24h: number;
    community_wins: number;
    community_views: number;
    best_hook: string | null;
  };
  first_seen: string | null;
  last_signal: string | null;
  saved: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const REC_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ACT_NOW: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Act Now' },
  TEST_SOON: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Test Soon' },
  WATCH: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30', label: 'Watch' },
  SKIP: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Skip' },
};

// ── Page ──────────────────────────────────────────────────────────

export default function OpportunityScannerPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<OpportunityCard[]>([]);
  const [counts, setCounts] = useState({ act_now: 0, test_soon: 0, watch: 0, total: 0 });
  const [filter, setFilter] = useState<'actionable' | 'all' | 'saved'>('actionable');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities?filter=${f}&limit=30`, { credentials: 'include' });
      const json = await res.json();
      if (json.ok) {
        setOpportunities(json.data || []);
        setCounts(json.counts || { act_now: 0, test_soon: 0, watch: 0, total: 0 });
      } else {
        showError('Failed to load opportunities');
      }
    } catch {
      showError('Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchOpportunities(filter);
  }, [filter, fetchOpportunities]);

  const handleSave = async (id: string, currentlySaved: boolean) => {
    setActionLoading(id);
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cluster_id: id, action: currentlySaved ? 'unsave' : 'save' }),
      });
      const json = await res.json();
      if (json.ok) {
        setOpportunities(prev => prev.map(o => o.id === id ? { ...o, saved: !currentlySaved } : o));
        showSuccess(currentlySaved ? 'Removed from saved' : 'Saved');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cluster_id: id, action: 'dismiss' }),
      });
      const json = await res.json();
      if (json.ok) {
        setOpportunities(prev => prev.filter(o => o.id !== id));
        showSuccess('Dismissed');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const buildStudioUrl = (topic: string) => {
    return `/admin/content-studio?inspiration=${encodeURIComponent(topic)}`;
  };

  const buildHooksUrl = (topic: string) => {
    return `/admin/hook-generator?product=${encodeURIComponent(topic)}`;
  };

  const buildContentPackUrl = (opp: OpportunityCard) => {
    const params = new URLSearchParams({
      topic: opp.topic,
      source: 'opportunity',
      context: opp.suggested_angle,
    });
    if (opp.signals.best_hook) params.set('seed_hook', opp.signals.best_hook);
    return `/admin/content-pack?${params.toString()}`;
  };

  return (
    <AdminPageLayout
      title="Opportunities"
      subtitle="What to make right now — based on trends, signals, and what's working"
      stage="create"
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { key: 'actionable' as const, label: 'Ready to Act', count: counts.act_now + counts.test_soon },
          { key: 'all' as const, label: 'All', count: counts.total },
          { key: 'saved' as const, label: 'Saved', count: null },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700'
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
            )}
          </button>
        ))}

        {/* Cross-links */}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link
            href="/admin/content-studio"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Sparkles size={14} />
            Content Studio
          </Link>
          <Link
            href="/admin/hook-generator"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Zap size={14} />
            Hooks
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          <span className="ml-3 text-zinc-400 text-sm">Scanning opportunities...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && opportunities.length === 0 && (
        <AdminCard>
          <div className="text-center py-12">
            <TrendingUp className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-200 mb-2">
              {filter === 'saved'
                ? 'No saved opportunities yet'
                : filter === 'actionable'
                  ? 'Nothing urgent right now'
                  : 'No opportunities yet'}
            </h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mb-4">
              {filter === 'saved'
                ? 'Tap the bookmark icon on any opportunity to save it here for later.'
                : filter === 'actionable'
                  ? 'When the system spots a trending product or early-mover window, it\'ll show up here with a recommended action. Check back soon.'
                  : 'Opportunities are powered by your product catalog, creator signals, and community trends. The more products you add, the smarter this gets.'}
            </p>

            {/* Actionable next steps based on filter */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {filter === 'saved' && (
                <button
                  onClick={() => setFilter('actionable')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <TrendingUp size={14} />
                  Browse opportunities
                </button>
              )}
              {filter === 'actionable' && (
                <button
                  onClick={() => setFilter('all')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Eye size={14} />
                  View all signals
                </button>
              )}
              {filter !== 'saved' && (
                <>
                  <Link
                    href="/admin/products"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg border border-white/10 transition-colors"
                  >
                    Add products
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/admin/content-studio"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg border border-white/10 transition-colors"
                  >
                    Write a script anyway
                    <ArrowRight size={14} />
                  </Link>
                </>
              )}
            </div>

            {/* How it works explainer */}
            {filter !== 'saved' && (
              <div className="mt-8 max-w-lg mx-auto text-left">
                <div className="text-xs font-medium text-zinc-500 mb-3 text-center">How opportunities are found</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-xs font-medium text-teal-400 mb-1">Signals</div>
                    <p className="text-xs text-zinc-500">We watch for trending products, rising search interest, and creator activity across platforms.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-xs font-medium text-amber-400 mb-1">Scoring</div>
                    <p className="text-xs text-zinc-500">Each opportunity gets a trend score, earlyness score, and saturation check so you know what&apos;s worth your time.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-xs font-medium text-violet-400 mb-1">Action</div>
                    <p className="text-xs text-zinc-500">Act Now means go. Test Soon means explore. Watch means keep an eye on it. We do the math, you make the content.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </AdminCard>
      )}

      {/* Opportunity cards */}
      {!loading && opportunities.length > 0 && (
        <div className="space-y-4">
          {opportunities.map(opp => {
            const style = REC_STYLES[opp.recommendation] || REC_STYLES.WATCH;
            const isExpanded = expandedId === opp.id;
            const isActioning = actionLoading === opp.id;

            return (
              <div
                key={opp.id}
                className="bg-zinc-900/60 border border-white/10 rounded-xl overflow-hidden hover:border-white/15 transition-colors"
              >
                {/* Card header */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    {/* Score indicator */}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${style.bg} border ${style.border} flex flex-col items-center justify-center`}>
                      <span className={`text-lg font-bold ${style.text}`}>{opp.score}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-base font-semibold text-white truncate">{opp.topic}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                      </div>

                      <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{opp.why_now}</p>

                      {/* Signal pills */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} />
                          {opp.signals.creator_count} creator{opp.signals.creator_count !== 1 ? 's' : ''}
                        </span>
                        {opp.signals.velocity_24h > 0 && (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <TrendingUp size={12} />
                            {opp.signals.velocity_24h} new today
                          </span>
                        )}
                        {opp.signals.community_wins > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <Sparkles size={12} />
                            {opp.signals.community_wins} win{opp.signals.community_wins !== 1 ? 's' : ''}
                            {opp.signals.community_views > 0 && ` · ${formatViews(opp.signals.community_views)} views`}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {timeAgo(opp.last_signal)}
                        </span>
                      </div>
                    </div>

                    {/* Actions (right side) */}
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      <button
                        onClick={() => handleSave(opp.id, opp.saved)}
                        disabled={isActioning}
                        className={`p-2 rounded-lg transition-colors ${
                          opp.saved
                            ? 'text-teal-400 bg-teal-500/10 hover:bg-teal-500/20'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                        title={opp.saved ? 'Remove from saved' : 'Save'}
                      >
                        {opp.saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                      </button>
                      <button
                        onClick={() => handleDismiss(opp.id)}
                        disabled={isActioning}
                        className="p-2 text-zinc-600 hover:text-zinc-400 hover:bg-white/5 rounded-lg transition-colors"
                        title="Dismiss"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : opp.id)}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isExpanded ? 'Less' : 'Details & angle'}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 space-y-4">
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <div className="text-xs font-medium text-zinc-500 mb-1">Suggested angle</div>
                      <p className="text-sm text-zinc-300">{opp.suggested_angle}</p>
                    </div>

                    {/* Score breakdown */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Trend</div>
                        <div className="text-lg font-bold text-white">{opp.score}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Earlyness</div>
                        <div className={`text-lg font-bold ${opp.earlyness >= 50 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                          {opp.earlyness}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Saturation</div>
                        <div className={`text-lg font-bold ${opp.saturation >= 50 ? 'text-red-400' : 'text-zinc-300'}`}>
                          {opp.saturation}
                        </div>
                      </div>
                    </div>

                    {/* Best hook from community */}
                    {opp.signals.best_hook && (
                      <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
                        <div className="text-xs font-medium text-violet-400 mb-1">Winning hook from community</div>
                        <p className="text-sm text-zinc-300 italic">&ldquo;{opp.signals.best_hook}&rdquo;</p>
                      </div>
                    )}

                    {/* Visual Ideas for this opportunity */}
                    <VisualHooksPanel
                      topic={opp.topic}
                      verbalHook={opp.signals.best_hook || undefined}
                      variant="inline"
                    />
                  </div>
                )}

                {/* Action bar */}
                <div className="px-4 sm:px-5 py-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
                  <Link
                    href={buildHooksUrl(opp.topic)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-lg transition-colors"
                  >
                    <Zap size={13} />
                    Make Hooks
                  </Link>
                  <Link
                    href={buildStudioUrl(opp.topic)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-colors"
                  >
                    <FileText size={13} />
                    Write Script
                  </Link>
                  <Link
                    href={buildContentPackUrl(opp)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                  >
                    <Sparkles size={13} />
                    Content Pack
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminPageLayout>
  );
}
