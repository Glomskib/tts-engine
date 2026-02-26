'use client';

import { useState, useCallback } from 'react';
import AdminPageLayout, { AdminCard } from '../components/AdminPageLayout';
import {
  MessageSquare,
  Sparkles,
  Loader2,
  AlertCircle,
  Clipboard,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface GeneratedComment {
  text: string;
  strategy: string;
  why: string;
}

// ============================================================================
// Constants
// ============================================================================

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'youtube', label: 'YouTube Shorts' },
];

const GOALS = [
  { value: 'drive_comments', label: 'Drive Comments', desc: 'Spark replies and conversation' },
  { value: 'drive_saves', label: 'Drive Saves', desc: 'Encourage bookmarks' },
  { value: 'drive_sales', label: 'Drive Sales', desc: 'Push clicks and purchases' },
  { value: 'drive_follows', label: 'Drive Follows', desc: 'Earn new followers' },
  { value: 'build_trust', label: 'Build Trust', desc: 'Authority and transparency' },
];

const TONES = [
  { value: 'casual', label: 'Casual' },
  { value: 'hype', label: 'Hype' },
  { value: 'professional', label: 'Professional' },
  { value: 'sarcastic', label: 'Sarcastic' },
  { value: 'storytelling', label: 'Storytelling' },
];

const STRATEGY_COLORS: Record<string, string> = {
  question: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  controversy: 'bg-red-500/10 text-red-400 border-red-500/20',
  'social proof': 'bg-green-500/10 text-green-400 border-green-500/20',
  urgency: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  cliffhanger: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'behind-the-scenes': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  cta: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  relatable: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

function strategyColor(strategy: string): string {
  const key = strategy.toLowerCase();
  for (const [k, v] of Object.entries(STRATEGY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

// ============================================================================
// Copy button
// ============================================================================

function CopyButton({ text, id, copiedId, onCopy }: {
  text: string;
  id: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const copied = copiedId === id;
  return (
    <button
      onClick={() => onCopy(text, id)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors shrink-0"
    >
      {copied ? (
        <><Check size={13} className="text-green-400" /> Copied</>
      ) : (
        <><Clipboard size={13} /> Copy</>
      )}
    </button>
  );
}

// ============================================================================
// Comment card
// ============================================================================

function CommentCard({ comment, index, copiedId, onCopy }: {
  comment: GeneratedComment;
  index: number;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const id = `comment-${index}`;

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-zinc-100 text-sm leading-relaxed flex-1 whitespace-pre-wrap">{comment.text}</p>
        <CopyButton text={comment.text} id={id} copiedId={copiedId} onCopy={onCopy} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${strategyColor(comment.strategy)}`}>
          {comment.strategy}
        </span>
        {comment.why && (
          <button
            onClick={() => setShowWhy(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showWhy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Why this works
          </button>
        )}
      </div>

      {showWhy && comment.why && (
        <p className="text-xs text-zinc-500 leading-relaxed border-t border-white/5 pt-2">{comment.why}</p>
      )}
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CommentCreatorPage() {
  const [topic, setTopic] = useState('');
  const [product, setProduct] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [goal, setGoal] = useState('drive_comments');
  const [tone, setTone] = useState('casual');
  const [count, setCount] = useState(5);

  const [comments, setComments] = useState<GeneratedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleCopyAll = useCallback(() => {
    if (comments.length === 0) return;
    const all = comments.map((c, i) => `${i + 1}. ${c.text}`).join('\n\n');
    navigator.clipboard.writeText(all);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  }, [comments]);

  const generate = useCallback(async () => {
    if (!topic.trim()) {
      setError('Please describe your video topic.');
      return;
    }
    setLoading(true);
    setError('');
    setComments([]);

    try {
      const res = await fetch('/api/comment-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), platform, goal, tone, product: product.trim() || undefined, count }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Generation failed. Please try again.');
        return;
      }

      setComments(data.comments || []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [topic, product, platform, goal, tone, count]);

  return (
    <AdminPageLayout
      title="Comment Creator"
      subtitle="Generate first pinned comments that drive engagement on your videos"
    >
      {/* Input card */}
      <AdminCard>
        <div className="p-5 space-y-5">
          {/* Topic */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              What&apos;s your video about? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              rows={3}
              placeholder="e.g. Showing how I lost 15 lbs in 60 days using a simple morning routine, no diet..."
              className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Product or brand <span className="text-zinc-600 text-xs font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="e.g. SlimTea Pro, Nike Air Max 95..."
              className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Platform + Goal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Platform</label>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                      platform === p.value
                        ? 'bg-white/10 border-white/20 text-zinc-100'
                        : 'bg-zinc-800/50 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Tone</label>
              <div className="flex gap-2 flex-wrap">
                {TONES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                      tone === t.value
                        ? 'bg-white/10 border-white/20 text-zinc-100'
                        : 'bg-zinc-800/50 border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Primary Goal</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={`flex flex-col items-start px-3 py-2.5 rounded-lg text-left text-sm transition-colors border ${
                    goal === g.value
                      ? 'bg-white/10 border-white/20 text-zinc-100'
                      : 'bg-zinc-800/50 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="font-medium text-xs">{g.label}</span>
                  <span className="text-zinc-600 text-xs mt-0.5 leading-tight">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Count + Generate */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Generate</span>
              <select
                value={count}
                onChange={e => setCount(parseInt(e.target.value, 10))}
                className="bg-zinc-800/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              >
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-sm text-zinc-400">comments</span>
            </div>

            <button
              onClick={generate}
              disabled={loading || !topic.trim()}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={15} /> Generate Comments</>
              )}
            </button>
          </div>
        </div>
      </AdminCard>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {comments.length > 0 && (
        <AdminCard
          title="Generated Comments"
          subtitle={`${comments.length} first-comment options — pick your favorite and pin it right after posting`}
          headerActions={
            <button
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
            >
              {copiedId === 'all' ? (
                <><Check size={13} className="text-green-400" /> Copied all</>
              ) : (
                <><Clipboard size={13} /> Copy all</>
              )}
            </button>
          }
        >
          <div className="p-4 space-y-3">
            {comments.map((comment, i) => (
              <CommentCard
                key={i}
                comment={comment}
                index={i}
                copiedId={copiedId}
                onCopy={handleCopy}
              />
            ))}
          </div>
        </AdminCard>
      )}

      {/* Empty state */}
      {!loading && comments.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center">
            <MessageSquare size={24} className="text-zinc-600" />
          </div>
          <p className="text-zinc-500 text-sm max-w-xs">
            Describe your video above and hit Generate — get first pinned comments engineered to drive engagement.
          </p>
        </div>
      )}
    </AdminPageLayout>
  );
}
