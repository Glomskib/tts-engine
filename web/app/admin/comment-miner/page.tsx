'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  MessageSquare,
  Zap,
  FileText,
  Package,
  Pickaxe,
  ThumbsUp,
  Eye,
  EyeOff,
  HelpCircle,
  AlertTriangle,
  Megaphone,
  HeartHandshake,
  Star,
  Flame,
  RefreshCw,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import type { CommentTheme, ThemeCategory, SuggestedAction } from '@/lib/comment-miner/types';

// ── Category display config ──

const CATEGORY_CONFIG: Record<ThemeCategory, { label: string; icon: typeof HelpCircle; color: string }> = {
  question: { label: 'Question', icon: HelpCircle, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  objection: { label: 'Objection', icon: AlertTriangle, color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  request: { label: 'Request', icon: Megaphone, color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  pain_point: { label: 'Pain Point', icon: HeartHandshake, color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  praise_pattern: { label: 'Praise', icon: Star, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  controversy: { label: 'Controversy', icon: Flame, color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

const ACTION_ROUTES: Record<SuggestedAction['type'], (theme: CommentTheme) => string> = {
  reply_video: (t) => `/admin/content-studio?topic=${enc(t.theme)}&context=${enc(t.content_angle)}`,
  hook: (t) => `/admin/hook-generator?seed=${enc(t.theme)}`,
  script: (t) => `/admin/content-studio?topic=${enc(t.theme)}&context=${enc(t.content_angle)}`,
  content_pack: (t) => `/admin/content-pack?topic=${enc(t.theme)}&source=comment&context=${enc(t.content_angle)}`,
  comment_reply: (t) => `/admin/tools/tok-comment?context=${enc(t.theme)}`,
};

function enc(s: string) {
  return encodeURIComponent(s);
}

export default function CommentMinerPage() {
  const { showSuccess, showError } = useToast();
  const [themes, setThemes] = useState<CommentTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mineStats, setMineStats] = useState<{ comments: number; videos: number } | null>(null);

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    try {
      const params = showDismissed ? '?dismissed=1' : '';
      const res = await fetch(`/api/comment-miner${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load themes');
      const data = await res.json();
      setThemes(data.themes || []);
    } catch {
      showError('Failed to load comment themes');
    } finally {
      setLoading(false);
    }
  }, [showDismissed, showError]);

  useEffect(() => { fetchThemes(); }, [fetchThemes]);

  const handleMine = async () => {
    setMining(true);
    setMineStats(null);
    try {
      const res = await fetch('/api/comment-miner', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Mining failed');
      }
      const data = await res.json();
      setThemes(data.themes || []);
      setMineStats({ comments: data.total_comments_analyzed || 0, videos: data.source_videos || 0 });
      showSuccess(`Found ${(data.themes || []).length} themes from ${data.total_comments_analyzed || 0} comments`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Mining failed');
    } finally {
      setMining(false);
    }
  };

  const handleDismiss = async (theme: CommentTheme) => {
    const newDismissed = !theme.dismissed;
    setDismissingId(theme.id);
    try {
      const res = await fetch('/api/comment-miner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: theme.id, dismissed: newDismissed }),
      });
      if (!res.ok) throw new Error('Failed');
      if (showDismissed) {
        setThemes(prev => prev.map(t => t.id === theme.id ? { ...t, dismissed: newDismissed } : t));
      } else {
        setThemes(prev => prev.filter(t => t.id !== theme.id));
      }
      showSuccess(newDismissed ? 'Theme dismissed' : 'Theme restored');
    } catch {
      showError('Failed to update theme');
    } finally {
      setDismissingId(null);
    }
  };

  const activeThemes = themes.filter(t => !t.dismissed);
  const dismissedThemes = themes.filter(t => t.dismissed);
  const displayThemes = showDismissed ? themes : activeThemes;

  return (
    <AdminPageLayout
      title="Comment Miner"
      subtitle="Turn your audience's comments into content opportunities"
      stage="create"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          {/* Toggle dismissed */}
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showDismissed
                ? 'bg-zinc-700 text-zinc-300 border-zinc-600'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {showDismissed ? <Eye size={12} /> : <EyeOff size={12} />}
            {showDismissed ? 'Showing all' : 'Show dismissed'}
          </button>

          {mineStats && (
            <span className="text-xs text-zinc-500">
              Analyzed {mineStats.comments} comments from {mineStats.videos} videos
            </span>
          )}
        </div>

        <button
          onClick={handleMine}
          disabled={mining}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {mining ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Mining comments...
            </>
          ) : (
            <>
              <Pickaxe size={14} />
              Mine Comments
            </>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && displayThemes.length === 0 && (
        <AdminCard>
          <div className="text-center py-12">
            <Pickaxe size={32} className="text-zinc-600 mx-auto mb-3" />
            {themes.length > 0 && !showDismissed ? (
              <>
                <p className="text-sm text-zinc-400 mb-1">All themes have been dismissed</p>
                <button
                  onClick={() => setShowDismissed(true)}
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  Show dismissed themes
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400 mb-2">No comment themes yet</p>
                <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
                  Comment Miner analyzes your classified RI comments and groups them into actionable content themes.
                  Make sure you have comments ingested and classified first.
                </p>
                <button
                  onClick={handleMine}
                  disabled={mining}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Pickaxe size={14} />
                  Mine Comments
                </button>
              </>
            )}
          </div>
        </AdminCard>
      )}

      {/* Theme cards */}
      {!loading && displayThemes.length > 0 && (
        <div className="space-y-4">
          {displayThemes.map((theme) => {
            const config = CATEGORY_CONFIG[theme.category] || CATEGORY_CONFIG.question;
            const CatIcon = config.icon;
            const isExpanded = expandedId === theme.id;

            return (
              <div
                key={theme.id}
                className={`p-4 bg-zinc-900/60 border rounded-xl transition-colors ${
                  theme.dismissed
                    ? 'border-zinc-800 opacity-60'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Category badge */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border rounded shrink-0 ${config.color}`}>
                      <CatIcon size={10} />
                      {config.label}
                    </span>

                    {/* Theme title */}
                    <h3 className="text-sm font-medium text-white leading-snug">
                      {theme.theme}
                    </h3>
                  </div>

                  {/* Score + dismiss */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-teal-400" title="Opportunity score">
                      {theme.opportunity_score}
                    </span>
                    <button
                      onClick={() => handleDismiss(theme)}
                      disabled={dismissingId === theme.id}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title={theme.dismissed ? 'Restore theme' : 'Dismiss theme'}
                    >
                      {dismissingId === theme.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : theme.dismissed ? (
                        <RefreshCw size={14} />
                      ) : (
                        <EyeOff size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content angle */}
                <p className="text-xs text-zinc-400 mb-3 ml-0">
                  {theme.content_angle}
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-[11px] text-zinc-500 mb-3">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare size={10} /> {theme.comment_count} comments
                  </span>
                  {theme.source_video_ids?.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      from {theme.source_video_ids.length} video{theme.source_video_ids.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Example comments (expandable) */}
                {theme.example_comments?.length > 0 && (
                  <div className="mb-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : theme.id)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
                    >
                      {isExpanded ? 'Hide' : 'Show'} {theme.example_comments.length} example comment{theme.example_comments.length !== 1 ? 's' : ''}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        {theme.example_comments.map((c, i) => (
                          <div key={i} className="pl-3 border-l-2 border-zinc-700">
                            <p className="text-xs text-zinc-400 leading-relaxed">&ldquo;{c.text}&rdquo;</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              @{c.username}
                              {c.like_count > 0 && (
                                <span className="inline-flex items-center gap-0.5 ml-2">
                                  <ThumbsUp size={8} /> {c.like_count}
                                </span>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {theme.suggested_actions?.length > 0 && !theme.dismissed && (
                  <div className="flex flex-wrap gap-2">
                    {theme.suggested_actions.map((action, i) => {
                      const href = ACTION_ROUTES[action.type]?.(theme);
                      if (!href) return null;

                      const ActionIcon = ACTION_ICONS[action.type] || Zap;

                      return (
                        <Link
                          key={i}
                          href={href}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg transition-colors"
                        >
                          <ActionIcon size={12} className="text-teal-400" />
                          {action.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dismissed section label */}
      {showDismissed && dismissedThemes.length > 0 && activeThemes.length > 0 && (
        <div className="mt-6 mb-2 text-xs text-zinc-600 uppercase tracking-wide font-medium">
          {dismissedThemes.length} dismissed
        </div>
      )}
    </AdminPageLayout>
  );
}

// ── Action icon mapping ──

const ACTION_ICONS: Record<SuggestedAction['type'], typeof Zap> = {
  reply_video: Zap,
  hook: Zap,
  script: FileText,
  content_pack: Package,
  comment_reply: MessageSquare,
};
