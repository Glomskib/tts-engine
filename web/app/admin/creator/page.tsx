'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../components/AdminPageLayout';
import {
  Loader2, RefreshCw, Video, Scissors, BarChart3,
  ChevronRight, ArrowRight, Eye, Heart, MessageSquare, Share2,
  Sparkles, Clock, Clapperboard, Upload, CheckCircle2,
  Copy, Check, ChevronDown, ChevronUp, Flame, Target,
  TrendingUp, MousePointerClick, Zap, Play, Edit3,
  AlertCircle, Calendar, Plus, ExternalLink,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  title: string;
  status: string;
  product_name: string | null;
  primary_hook: string | null;
  script_text?: string | null;
  created_at: string;
}

interface PostItem {
  id: string;
  title: string;
  status: string;
  product_name: string | null;
  tiktok_product_id: string | null;
  link_code: string | null;
  primary_hook: string | null;
  caption: string | null;
  hashtags: string[];
  final_video_url: string | null;
  created_at: string;
}

interface TopVideo {
  post_id: string;
  content_item_id: string;
  title: string;
  platform: string;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

interface WeeklyStats {
  posted_this_week: number;
  views_7d: number;
  likes_7d: number;
  shares_7d: number;
  comments_7d: number;
  affiliate_clicks_7d: number;
}

interface DashboardData {
  next_video: QueueItem | null;
  recording_queue: QueueItem[];
  editing_queue: QueueItem[];
  posting_queue: PostItem[];
  briefing_queue: QueueItem[];
  top_video: TopVideo | null;
  stats: Record<string, number>;
  weekly_stats: WeeklyStats;
  posting_streak: number;
  weekly_goal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function getDayLabels(): { label: string; short: string }[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const idx = (today - 6 + i + 7) % 7;
    return { label: days[idx], short: days[idx] };
  });
}

// ─── Copy Hook ────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);
  return { copiedKey, copy };
}

// ─── Components ───────────────────────────────────────────────────────────────

function SectionDivider({ icon: Icon, label, count, color }: {
  icon: typeof Upload;
  label: string;
  count: number;
  color: 'green' | 'teal' | 'amber' | 'zinc';
}) {
  const colorMap = {
    green: 'text-green-400 border-green-500/30 bg-green-500/10',
    teal: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    zinc: 'text-zinc-400 border-zinc-700 bg-zinc-800/60',
  };
  const badgeMap = {
    green: 'bg-green-500 text-white',
    teal: 'bg-teal-500 text-white',
    amber: 'bg-amber-500 text-white',
    zinc: 'bg-zinc-600 text-white',
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${colorMap[color]}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="font-semibold text-sm">{label}</span>
      <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${badgeMap[color]}`}>{count}</span>
    </div>
  );
}

function CopyButton({ text, label, copyKey, copiedKey, onCopy }: {
  text: string;
  label: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        copied
          ? 'bg-green-600 text-white'
          : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Readiness Score ──────────────────────────────────────────────────────────

function computeReadiness(item: PostItem) {
  const checks = [
    { label: 'Caption written', pass: Boolean(item.caption || item.primary_hook) },
    { label: 'Hook line', pass: Boolean(item.primary_hook) },
    { label: '#ad tag (FTC required)', pass: (item.hashtags || []).some(h => h.toLowerCase() === '#ad'), critical: true },
    { label: 'TikTok Shop product linked', pass: Boolean(item.tiktok_product_id), critical: true },
    { label: 'Video file ready', pass: Boolean(item.final_video_url), critical: true },
  ];
  const score = checks.filter(c => c.pass).length;
  return { score, max: checks.length, checks };
}

function ReadinessScore({ item }: { item: PostItem }) {
  const { score, max, checks } = computeReadiness(item);

  const label =
    score === 5 ? 'Post-Ready' :
    score === 4 ? 'Almost Ready' :
    score === 3 ? 'Needs Review' :
    'Incomplete';

  const labelColor =
    score === 5 ? 'text-green-400' :
    score === 4 ? 'text-lime-400' :
    score === 3 ? 'text-amber-400' :
    'text-red-400';

  const dotColor = (pass: boolean) =>
    pass ? 'bg-green-500' : 'bg-zinc-700';

  const failingCritical = checks.filter(c => c.critical && !c.pass);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {checks.map((c, i) => (
            <div
              key={i}
              title={`${c.label}: ${c.pass ? 'pass' : 'fail'}`}
              className={`w-2.5 h-2.5 rounded-full ${dotColor(c.pass)}`}
            />
          ))}
        </div>
        <span className={`text-[10px] font-semibold ${labelColor}`}>{label}</span>
        <span className="text-[10px] text-zinc-600">{score}/{max}</span>
      </div>
      {failingCritical.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {failingCritical.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Upload-ready posting card — the core daily workflow component
function PostCard({
  item,
  onMarkPosted,
  onPushDraft,
  copiedKey,
  onCopy,
}: {
  item: PostItem;
  onMarkPosted: (id: string) => Promise<void>;
  onPushDraft: (id: string) => Promise<void>;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [pushing, setPushing] = useState(false);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const captionText = item.caption || item.primary_hook || '';
  const hashtagText = (item.hashtags || []).join(' ');
  const fullPost = [captionText, hashtagText, item.link_code ? `\n🔗 Link in bio` : ''].filter(Boolean).join('\n');
  const affiliateUrl = item.link_code ? `${appUrl}/api/r/${item.link_code}` : null;

  const handleMarkPosted = async () => {
    setMarking(true);
    await onMarkPosted(item.id);
    setMarking(false);
  };

  const handlePushDraft = async () => {
    setPushing(true);
    await onPushDraft(item.id);
    setPushing(false);
  };

  const canPushDraft = Boolean(item.tiktok_product_id);

  return (
    <div className="bg-zinc-900 border border-green-500/20 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{item.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {item.product_name && (
                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                  {item.product_name}
                </span>
              )}
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                Ready {timeAgo(item.created_at)}
              </span>
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
            READY
          </span>
        </div>

        {/* Hook line */}
        {item.primary_hook && (
          <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 mb-3">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide mb-1">Hook</p>
            <p className="text-xs text-zinc-200 leading-relaxed">{item.primary_hook}</p>
          </div>
        )}

        {/* Caption block */}
        {captionText && (
          <div className="bg-zinc-800/40 rounded-xl px-3 py-2.5 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Caption</p>
              <CopyButton
                text={captionText}
                label="Copy Caption"
                copyKey={`cap-${item.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
              />
            </div>
            <p className={`text-xs text-zinc-300 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
              {captionText}
            </p>
            {captionText.length > 120 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-400 flex items-center gap-1"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Hashtags */}
        {hashtagText && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">Hashtags</p>
              <CopyButton
                text={hashtagText}
                label="Copy Tags"
                copyKey={`tags-${item.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(item.hashtags || []).slice(0, 8).map((tag, i) => (
                <span key={i} className="text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  {tag}
                </span>
              ))}
              {(item.hashtags || []).length > 8 && (
                <span className="text-[10px] text-zinc-500">+{item.hashtags.length - 8} more</span>
              )}
            </div>
          </div>
        )}

        {/* Affiliate link */}
        {affiliateUrl && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-zinc-800/40 rounded-xl">
            <MousePointerClick className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
            <span className="text-xs text-zinc-400 truncate flex-1">{affiliateUrl}</span>
            <CopyButton
              text={affiliateUrl}
              label="Copy Link"
              copyKey={`link-${item.id}`}
              copiedKey={copiedKey}
              onCopy={onCopy}
            />
          </div>
        )}
      </div>

      {/* Readiness score */}
      <div className="px-4 pb-3">
        <ReadinessScore item={item} />
      </div>

      {/* Action bar */}
      <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-2 flex-wrap bg-zinc-900/50">
        <CopyButton
          text={fullPost}
          label="Copy Full Post"
          copyKey={`full-${item.id}`}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
        {item.final_video_url && (
          <a
            href={item.final_video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            <Play className="w-3 h-3" />
            Download Video
          </a>
        )}
        <Link
          href={`/admin/content-items/${item.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View
        </Link>
        <button
          onClick={handlePushDraft}
          disabled={pushing || !canPushDraft}
          title={!canPushDraft ? 'Link TikTok Shop product first' : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Push to TikTok Draft
        </button>
        <button
          onClick={handleMarkPosted}
          disabled={marking}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Mark as Posted
        </button>
      </div>
    </div>
  );
}

// Film queue card — shows hook inline
function FilmCard({ item, copiedKey, onCopy }: {
  item: QueueItem;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [scriptOpen, setScriptOpen] = useState(false);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{item.title}</p>
            <div className="flex items-center gap-2 mt-1">
              {item.product_name && (
                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                  {item.product_name}
                </span>
              )}
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(item.created_at)}
              </span>
            </div>
          </div>
          <Link
            href={`/admin/content-items/${item.id}`}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors"
          >
            <Clapperboard className="w-3.5 h-3.5" />
            Open Script
          </Link>
        </div>

        {item.primary_hook && (
          <div className="mt-3 flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-300 leading-relaxed italic">"{item.primary_hook}"</p>
          </div>
        )}

        {item.script_text && (
          <>
            <button
              onClick={() => setScriptOpen(!scriptOpen)}
              className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              {scriptOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {scriptOpen ? 'Hide script' : 'Preview script'}
            </button>
            {scriptOpen && (
              <div className="mt-2 bg-zinc-800/60 rounded-xl p-3 relative">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{item.script_text}</pre>
                <CopyButton
                  text={item.script_text}
                  label="Copy Script"
                  copyKey={`script-${item.id}`}
                  copiedKey={copiedKey}
                  onCopy={onCopy}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Edit queue card
function EditCard({ item, onMarkEdited }: {
  item: QueueItem;
  onMarkEdited: (id: string) => Promise<void>;
}) {
  const [marking, setMarking] = useState(false);
  const handleMark = async () => {
    setMarking(true);
    await onMarkEdited(item.id);
    setMarking(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.product_name && (
            <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
              {item.product_name}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            item.status === 'editing'
              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
              : 'text-zinc-400 bg-zinc-800 border border-zinc-700'
          }`}>
            {item.status === 'editing' ? 'In Edit' : 'Filmed'}
          </span>
        </div>
        {item.primary_hook && (
          <p className="text-xs text-zinc-500 mt-1.5 truncate italic">"{item.primary_hook}"</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/admin/content-items/${item.id}`}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </Link>
        <button
          onClick={handleMark}
          disabled={marking}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
        >
          {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Done Editing
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyStudio() {
  const { showError, showSuccess } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftingAll, setDraftingAll] = useState(false);
  const postRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const { copiedKey, copy } = useCopy();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/creator/dashboard');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      showError('Failed to load studio');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateItemStatus = async (id: string, status: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/content-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
      return true;
    } catch {
      showError('Failed to update status');
      return false;
    }
  };

  const handleMarkPosted = async (id: string) => {
    const ok = await updateItemStatus(id, 'posted');
    if (ok) {
      showSuccess('Marked as posted!');
      fetchData();
    }
  };

  const handleMarkEdited = async (id: string) => {
    const ok = await updateItemStatus(id, 'ready_to_post');
    if (ok) {
      showSuccess('Moved to Ready to Post!');
      fetchData();
    }
  };

  const handlePushAllDrafts = async () => {
    setDraftingAll(true);
    try {
      const res = await fetch('/api/creator/push-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'draft' }),
      });
      const json = await res.json();
      if (json.ok) showSuccess(`${json.queued} video${json.queued !== 1 ? 's' : ''} queued for TikTok draft`);
      else showError('Failed to queue drafts');
    } catch { showError('Failed to queue drafts'); }
    finally { setDraftingAll(false); }
  };

  const handlePushDraft = async (id: string) => {
    const res = await fetch('/api/creator/push-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_ids: [id], mode: 'draft' }),
    });
    const json = await res.json();
    if (json.ok) showSuccess('Queued for TikTok draft!');
    else showError('Failed to queue draft');
  };

  if (loading) {
    return (
      <AdminPageLayout title="My Studio" subtitle="Loading your content pipeline...">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  const stats = data?.stats || {};
  const weekly = data?.weekly_stats || { posted_this_week: 0, views_7d: 0, likes_7d: 0, shares_7d: 0, comments_7d: 0, affiliate_clicks_7d: 0 };
  const streak = data?.posting_streak || 0;
  const weeklyGoal = data?.weekly_goal || 5;
  const postingQueue = data?.posting_queue || [];
  const recordingQueue = data?.recording_queue || [];
  const editingQueue = data?.editing_queue || [];
  const briefingQueue = data?.briefing_queue || [];

  const totalPending = postingQueue.length + recordingQueue.length + editingQueue.length;
  const goalProgress = Math.min(weekly.posted_this_week / weeklyGoal, 1);
  const days = getDayLabels();

  return (
    <AdminPageLayout
      title="My Studio"
      subtitle="Your daily TikTok content workflow"
      maxWidth="2xl"
      headerActions={
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-orange-400">{streak} day streak</span>
            </div>
          )}
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      }
    >

      {/* ── DAILY BRIEFING ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {totalPending === 0 ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-white">All caught up!</p>
              <p className="text-sm text-zinc-400">No pending tasks. Generate a new script to keep your queue full.</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-lg font-bold text-white mb-3">
              {postingQueue.length > 0
                ? `You have ${postingQueue.length} video${postingQueue.length !== 1 ? 's' : ''} ready to post right now`
                : `${totalPending} content task${totalPending !== 1 ? 's' : ''} need your attention`}
            </p>
            <div className="flex flex-wrap gap-2">
              {postingQueue.length > 0 && (
                <button
                  onClick={() => postRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-500 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Post {postingQueue.length} Video{postingQueue.length !== 1 ? 's' : ''}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {recordingQueue.length > 0 && (
                <button
                  onClick={() => filmRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-600/20 text-teal-300 border border-teal-500/30 hover:bg-teal-600/30 transition-colors"
                >
                  <Clapperboard className="w-4 h-4" />
                  Film {recordingQueue.length} Script{recordingQueue.length !== 1 ? 's' : ''}
                </button>
              )}
              {editingQueue.length > 0 && (
                <button
                  onClick={() => editRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 transition-colors"
                >
                  <Scissors className="w-4 h-4" />
                  Edit {editingQueue.length} Video{editingQueue.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── WEEKLY TRACKER ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Weekly Goal */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-semibold text-white">Weekly Goal</span>
            </div>
            <span className="text-xs text-zinc-500">
              {weekly.posted_this_week} / {weeklyGoal} posted
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-zinc-800 rounded-full h-2.5 mb-3">
            <div
              className="bg-teal-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${goalProgress * 100}%` }}
            />
          </div>
          {/* Day dots */}
          <div className="flex items-center justify-between">
            {days.map((day, i) => {
              const posted = i < weekly.posted_this_week;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                    posted ? 'bg-teal-500 text-white' : 'bg-zinc-800 text-zinc-600'
                  }`}>
                    {posted ? <Check className="w-3 h-3" /> : <span>{day.short[0]}</span>}
                  </div>
                  <span className="text-[9px] text-zinc-600">{day.short}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* This Week Stats */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">Last 7 Days</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xl font-bold text-white">{formatNumber(weekly.views_7d)}</p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5"><Eye className="w-3 h-3" /> Views</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{formatNumber(weekly.likes_7d)}</p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5"><Heart className="w-3 h-3" /> Likes</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{formatNumber(weekly.affiliate_clicks_7d)}</p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5"><MousePointerClick className="w-3 h-3" /> Link Clicks</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{formatNumber(weekly.shares_7d)}</p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5"><Share2 className="w-3 h-3" /> Shares</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── UPLOAD TO TIKTOK ───────────────────────────────────────────── */}
      {postingQueue.length > 0 && (
        <div ref={postRef} className="space-y-3">
          <div className="flex items-center gap-3">
            <SectionDivider icon={Upload} label="Ready to Post — Upload These Now" count={postingQueue.length} color="green" />
            <button
              onClick={handlePushAllDrafts}
              disabled={draftingAll}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {draftingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Draft All in TikTok
            </button>
          </div>
          <p className="text-xs text-zinc-500 px-1">
            Caption, hashtags, and link are pre-written. Copy → paste into TikTok → tap post.
          </p>
          {postingQueue.map(item => (
            <PostCard
              key={item.id}
              item={item}
              onMarkPosted={handleMarkPosted}
              onPushDraft={handlePushDraft}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
        </div>
      )}

      {/* ── FILM THESE ─────────────────────────────────────────────────── */}
      {recordingQueue.length > 0 && (
        <div ref={filmRef} className="space-y-3">
          <SectionDivider icon={Clapperboard} label="Film These — Scripts Ready" count={recordingQueue.length} color="teal" />
          <p className="text-xs text-zinc-500 px-1">
            Read the hook and script, record your video, then come back and mark it filmed.
          </p>
          {recordingQueue.map(item => (
            <FilmCard
              key={item.id}
              item={item}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
        </div>
      )}

      {/* ── EDIT THESE ─────────────────────────────────────────────────── */}
      {editingQueue.length > 0 && (
        <div ref={editRef} className="space-y-3">
          <SectionDivider icon={Edit3} label="Edit These — Footage Waiting" count={editingQueue.length} color="amber" />
          <p className="text-xs text-zinc-500 px-1">
            Footage is recorded. Edit and export, then mark as done to move it to the posting queue.
          </p>
          {editingQueue.map(item => (
            <EditCard
              key={item.id}
              item={item}
              onMarkEdited={handleMarkEdited}
            />
          ))}
        </div>
      )}

      {/* ── BRIEFING QUEUE ─────────────────────────────────────────────── */}
      {briefingQueue.length > 0 && (
        <div className="space-y-2">
          <SectionDivider icon={Sparkles} label="In Scripting — AI Writing These" count={briefingQueue.length} color="zinc" />
          <div className="space-y-2">
            {briefingQueue.map(item => (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{item.title}</p>
                  {item.product_name && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{item.product_name}</p>
                  )}
                </div>
                <Link href={`/admin/content-items/${item.id}`} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ────────────────────────────────────────────────── */}
      {totalPending === 0 && briefingQueue.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <Sparkles className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-zinc-300 mb-2">Queue is empty</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-xs mx-auto">
            Generate AI scripts for your products and they'll appear here ready to film, edit, and post.
          </p>
          <Link
            href="/admin/content-studio"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Scripts
          </Link>
        </div>
      )}

      {/* ── TOP PERFORMING VIDEO ───────────────────────────────────────── */}
      {data?.top_video && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white">Top Video This Week</span>
          </div>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{data.top_video.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded uppercase">{data.top_video.platform}</span>
                <span className="text-[10px] text-zinc-600">{timeAgo(data.top_video.posted_at)}</span>
              </div>
            </div>
            <Link
              href={`/admin/content-items/${data.top_video.content_item_id}`}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-1"
            >
              Details <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Eye, value: data.top_video.views, label: 'Views' },
              { icon: Heart, value: data.top_video.likes, label: 'Likes' },
              { icon: MessageSquare, value: data.top_video.comments, label: 'Comments' },
              { icon: Share2, value: data.top_video.shares, label: 'Shares' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-white">{formatNumber(value)}</p>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <Icon className="w-3 h-3 text-zinc-500" />
                  <p className="text-[10px] text-zinc-500">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GENERATE NEW CONTENT ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/admin/creator/clip-studio"
          className="flex items-center gap-3 px-5 py-4 bg-teal-600/10 border border-teal-500/20 rounded-2xl text-teal-300 hover:bg-teal-600/20 hover:border-teal-500/40 transition-all group"
        >
          <Sparkles className="w-5 h-5 text-teal-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Clip Studio</p>
            <p className="text-[11px] text-teal-500">Upload clips → ready to post</p>
          </div>
          <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        <Link
          href="/admin/performance"
          className="flex items-center gap-3 px-5 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-300 hover:bg-zinc-800 transition-all group"
        >
          <BarChart3 className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Analytics</p>
            <p className="text-[11px] text-zinc-500">Track all performance</p>
          </div>
          <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        <Link
          href="/admin/link-hub"
          className="flex items-center gap-3 px-5 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-300 hover:bg-zinc-800 transition-all group"
        >
          <MousePointerClick className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Affiliate Links</p>
            <p className="text-[11px] text-zinc-500">Manage & track clicks</p>
          </div>
          <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    </AdminPageLayout>
  );
}
