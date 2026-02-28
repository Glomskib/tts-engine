'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/contexts/ToastContext';
import {
  DollarSign,
  AlertTriangle,
  Copy,
  Check,
  CheckCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface RevenueModeItem {
  commentId: string;
  commenterUsername: string;
  commentText: string;
  category: 'buying_intent' | 'objection';
  leadScore: number;
  urgencyScore: number;
  status: string | null;
  drafts: {
    neutral?: string;
    friendly?: string;
    conversion?: string;
  };
}

type Tone = 'neutral' | 'friendly' | 'conversion';

const TONE_LABELS: Record<Tone, string> = {
  neutral: 'Neutral',
  friendly: 'Friendly',
  conversion: 'Conversion',
};

const CATEGORY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  buying_intent: { label: 'Buying Intent', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  objection: { label: 'Objection', bg: 'bg-amber-500/20', text: 'text-amber-400' },
};

// ── Page ──────────────────────────────────────────────────────

export default function RevenueModePage() {
  const { showSuccess, showError } = useToast();

  const [items, setItems] = useState<RevenueModeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tones, setTones] = useState<Record<string, Tone>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/revenue-mode');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error('API returned error');
      setItems(json.data ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      showError('Failed to load Revenue Mode inbox');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTone = (id: string): Tone => tones[id] ?? 'friendly';

  const setTone = (id: string, tone: Tone) => {
    setTones((prev) => ({ ...prev, [id]: tone }));
  };

  const copyDraft = async (item: RevenueModeItem) => {
    const tone = getTone(item.commentId);
    const text = item.drafts[tone];
    if (!text) {
      showError(`No ${tone} draft available`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.commentId);
      showSuccess('Draft copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showError('Failed to copy to clipboard');
    }
  };

  const markResolved = async (commentId: string) => {
    setResolvingId(commentId);
    try {
      const res = await fetch('/api/revenue-mode/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, status: 'resolved' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error('API returned error');

      setItems((prev) =>
        prev.map((i) =>
          i.commentId === commentId ? { ...i, status: 'resolved' } : i,
        ),
      );
      showSuccess('Marked as resolved');
    } catch {
      showError('Failed to update status');
    } finally {
      setResolvingId(null);
    }
  };

  // ── Loading state ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 lg:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Revenue Mode</h1>
          <p className="text-sm text-zinc-400 mt-1">High-intent comments ready for action</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-1/4 mb-3" />
              <div className="h-3 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────

  if (error) {
    return (
      <div className="px-4 lg:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Revenue Mode</h1>
          <p className="text-sm text-zinc-400 mt-1">High-intent comments ready for action</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium mb-1">Failed to load inbox</p>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={fetchItems}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div className="px-4 lg:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Revenue Mode</h1>
          <p className="text-sm text-zinc-400 mt-1">High-intent comments ready for action</p>
        </div>
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-12 text-center">
          <DollarSign className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No high-intent comments yet</p>
          <p className="text-sm text-zinc-500">
            Comments with buying intent or objections and lead score &ge; 70 will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── Main content ──────────────────────────────────────────

  const unresolvedCount = items.filter((i) => i.status !== 'resolved').length;

  return (
    <div className="px-4 lg:px-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Mode</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {unresolvedCount} actionable comment{unresolvedCount !== 1 ? 's' : ''} &middot; {items.length} total
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {items.map((item) => {
          const tone = getTone(item.commentId);
          const draftText = item.drafts[tone];
          const isResolved = item.status === 'resolved';
          const isExpanded = expandedId === item.commentId;
          const catConfig = CATEGORY_CONFIG[item.category] ?? { label: item.category, bg: 'bg-zinc-700/30', text: 'text-zinc-400' };

          return (
            <div
              key={item.commentId}
              className={`bg-zinc-900/50 border rounded-xl transition-colors ${
                isResolved ? 'border-white/5 opacity-60' : 'border-white/10'
              }`}
            >
              {/* Row header */}
              <div className="p-4 lg:p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  {/* Left: username + badges */}
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-white font-medium truncate">@{item.commenterUsername}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catConfig.bg} ${catConfig.text}`}>
                      {catConfig.label}
                    </span>
                    {item.urgencyScore >= 60 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                        Urgent
                      </span>
                    )}
                    {isResolved && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/30 text-zinc-500">
                        Resolved
                      </span>
                    )}
                  </div>
                  {/* Right: scores */}
                  <div className="flex items-center gap-3 text-xs text-zinc-500 flex-shrink-0">
                    <span>Lead: <span className="text-zinc-300">{item.leadScore}</span></span>
                    <span>Urgency: <span className="text-zinc-300">{item.urgencyScore}</span></span>
                  </div>
                </div>

                {/* Comment text */}
                <p className="text-sm text-zinc-300 mb-3">{item.commentText}</p>

                {/* Draft section */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Tone selector */}
                  <div className="relative">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.commentId)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:text-white transition-colors"
                    >
                      {TONE_LABELS[tone]}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {isExpanded && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setExpandedId(null)} />
                        <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-20 min-w-[120px]">
                          {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setTone(item.commentId, t);
                                setExpandedId(null);
                              }}
                              className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                t === tone
                                  ? 'text-teal-400 bg-teal-500/10'
                                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
                              }`}
                            >
                              {TONE_LABELS[t]}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={() => copyDraft(item)}
                    disabled={!draftText}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
                  >
                    {copiedId === item.commentId ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedId === item.commentId ? 'Copied' : 'Copy Draft'}
                  </button>

                  {/* Resolve button */}
                  {!isResolved && (
                    <button
                      onClick={() => markResolved(item.commentId)}
                      disabled={resolvingId === item.commentId}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {resolvingId === item.commentId ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      Resolve
                    </button>
                  )}
                </div>

                {/* Draft preview */}
                {draftText && (
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 mt-2">
                    <p className="text-xs text-zinc-500 mb-1 font-medium">{TONE_LABELS[tone]} draft</p>
                    <p className="text-sm text-zinc-300">{draftText}</p>
                  </div>
                )}
                {!draftText && (
                  <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-3 mt-2">
                    <p className="text-xs text-zinc-500">No {TONE_LABELS[tone].toLowerCase()} draft available</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
