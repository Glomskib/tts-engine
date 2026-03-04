'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, Check, ExternalLink, Mic, Send, Plus, Sparkles, Anchor, Loader2, Target, Lightbulb, FlaskConical, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem } from '@/lib/content-items/types';
import type { DailyMission } from '@/lib/ai/missions/generateDailyMission';
import type { CoachInsight } from '@/lib/ai/coach/generateCoachInsight';

interface ContentItemRow extends ContentItem {
  products?: { name: string } | null;
  latest_brief?: { data?: { one_liner?: string } } | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-zinc-800 text-zinc-200 active:bg-zinc-700"
    >
      {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Caption</>}
    </button>
  );
}

function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function StudioPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [recordItems, setRecordItems] = useState<ContentItemRow[]>([]);
  const [postItems, setPostItems] = useState<ContentItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingPosted, setMarkingPosted] = useState<string | null>(null);
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [coachInsight, setCoachInsight] = useState<CoachInsight | null>(null);
  const [creatorScore, setCreatorScore] = useState<{ creator_score: number; trend: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [recordRes, postRes, missionRes, coachRes, scoreRes] = await Promise.all([
        fetch('/api/content-items?status=ready_to_record&view=board&limit=3'),
        fetch('/api/content-items?status=ready_to_post&view=board&limit=5'),
        fetch('/api/missions/daily'),
        fetch('/api/coach/insight'),
        fetch('/api/creator-score'),
      ]);
      const [recordJson, postJson, missionJson, coachJson, scoreJson] = await Promise.all([
        recordRes.json(), postRes.json(), missionRes.json(), coachRes.json(), scoreRes.json(),
      ]);

      if (recordJson.ok) {
        const sorted = (recordJson.data || []).sort((a: ContentItemRow, b: ContentItemRow) => {
          if (!a.due_at && !b.due_at) return 0;
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        });
        setRecordItems(sorted);
      }
      if (postJson.ok) setPostItems(postJson.data || []);
      if (missionJson.ok) setMission(missionJson.data);
      if (coachJson.ok) setCoachInsight(coachJson.data);
      if (scoreJson.ok) setCreatorScore(scoreJson.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkPosted = async (item: ContentItemRow) => {
    setMarkingPosted(item.id);
    try {
      const res = await fetch(`/api/content-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'posted' }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast({ message: 'Marked as posted!', type: 'success' });
        setPostItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setMarkingPosted(null);
    }
  };

  const hasMissionTasks = mission && (
    mission.record_tasks.length > 0 ||
    mission.post_tasks.length > 0 ||
    mission.experiment_tasks.length > 0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 space-y-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="pt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Creator Studio</h1>
          <p className="text-base text-[var(--text-muted)] mt-1">Your next actions at a glance.</p>
        </div>
        {creatorScore && (
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2">
            <span className="text-2xl font-bold text-[var(--text)]">{creatorScore.creator_score}</span>
            {creatorScore.trend === 'up' && <TrendingUp size={16} className="text-emerald-400" />}
            {creatorScore.trend === 'down' && <TrendingDown size={16} className="text-red-400" />}
            {creatorScore.trend === 'stable' && <Minus size={16} className="text-zinc-500" />}
          </div>
        )}
      </div>

      {/* AI Coach Insight */}
      {coachInsight && (
        <div className="bg-gradient-to-br from-violet-500/10 to-teal-500/10 border border-violet-500/20 rounded-xl p-4 flex items-start gap-3">
          <Lightbulb size={20} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--text)] leading-relaxed">{coachInsight.message}</p>
        </div>
      )}

      {/* Today's Mission */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
          <Target size={20} className="text-amber-400" /> Today&apos;s Mission
        </h2>

        {!hasMissionTasks ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
            <p className="text-base text-[var(--text-muted)]">All caught up! No missions today.</p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
            {/* Record tasks */}
            {mission!.record_tasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Record</p>
                <ul className="space-y-1.5">
                  {mission!.record_tasks.map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-sm text-[var(--text)]">
                      <Mic size={14} className="text-blue-400 flex-shrink-0" />
                      <span className="truncate">
                        {task.product_name && <span className="text-teal-400">{task.product_name}</span>}
                        {task.product_name && ' — '}
                        {task.title}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/admin/record/${mission!.record_tasks[0].content_item_id}`}
                  className="flex items-center justify-center gap-2 w-full min-h-[40px] mt-2 rounded-lg text-sm font-medium transition-colors bg-teal-600 text-white active:bg-teal-700"
                >
                  Open Recording Kit
                </Link>
              </div>
            )}

            {/* Post tasks */}
            {mission!.post_tasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Post</p>
                <ul className="space-y-1.5">
                  {mission!.post_tasks.map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-sm text-[var(--text)]">
                      <Send size={14} className="text-green-400 flex-shrink-0" />
                      <span className="truncate">
                        {task.product_name && <span className="text-violet-400">{task.product_name}</span>}
                        {task.product_name && ' — '}
                        {task.title}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/admin/post/${mission!.post_tasks[0].content_item_id}`}
                  className="flex items-center justify-center gap-2 w-full min-h-[40px] mt-2 rounded-lg text-sm font-medium transition-colors bg-green-600 text-white active:bg-green-700"
                >
                  Post Now
                </Link>
              </div>
            )}

            {/* Experiment tasks */}
            {mission!.experiment_tasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Experiment</p>
                <ul className="space-y-1.5">
                  {mission!.experiment_tasks.map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-sm text-[var(--text)]">
                      <FlaskConical size={14} className="text-amber-400 flex-shrink-0" />
                      <span className="truncate italic">{task.hook_text}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/admin/content-studio"
                  className="flex items-center justify-center gap-2 w-full min-h-[40px] mt-2 rounded-lg text-sm font-medium transition-colors bg-amber-600 text-white active:bg-amber-700"
                >
                  Create Script
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 1: Record Next */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
          <Mic size={20} className="text-blue-400" /> Record Next
        </h2>
        {recordItems.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
            <p className="text-base text-[var(--text-muted)]">Nothing to record right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recordItems.map(item => {
              const due = formatDate(item.due_at);
              const isOverdue = item.due_at && new Date(item.due_at) < new Date();
              return (
                <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                  {/* Hook line */}
                  <p className="text-base font-medium text-[var(--text)] line-clamp-1">
                    {item.title}
                  </p>
                  {/* Product + due */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.products?.name && (
                      <span className="text-sm px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        {item.products.name}
                      </span>
                    )}
                    {due && (
                      <span className={`text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                        Due {due}
                      </span>
                    )}
                  </div>
                  {/* Primary CTA */}
                  <Link
                    href={`/admin/record/${item.id}`}
                    className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold transition-colors bg-teal-600 text-white active:bg-teal-700"
                  >
                    Open Recording Kit
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Post Today */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
          <Send size={20} className="text-teal-400" /> Post Today
        </h2>
        {postItems.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
            <p className="text-base text-[var(--text-muted)]">No content ready to post.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {postItems.map(item => (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                {/* Product */}
                <div className="flex items-center gap-2">
                  {item.products?.name && (
                    <span className="text-sm px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      {item.products.name}
                    </span>
                  )}
                  <span className="text-sm text-[var(--text-muted)] ml-auto">{item.short_id}</span>
                </div>
                {/* Caption preview */}
                {item.caption && (
                  <p className="text-base text-[var(--text)] line-clamp-2">{item.caption}</p>
                )}
                {/* Action buttons */}
                <div className="space-y-2">
                  {item.caption && <CopyButton text={item.caption} />}
                  {item.final_video_url && (
                    <a
                      href={item.final_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-zinc-800 text-zinc-200 active:bg-zinc-700"
                    >
                      <ExternalLink size={18} /> Open Video
                    </a>
                  )}
                  <button
                    onClick={() => router.push(`/admin/post/${item.id}`)}
                    className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold transition-colors bg-green-600 text-white active:bg-green-700"
                  >
                    <Send size={18} /> Post Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Quick Create */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
          <Plus size={20} className="text-violet-400" /> Quick Create
        </h2>
        <div className="space-y-2">
          <Link
            href="/admin/content-studio"
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] active:bg-[var(--surface2)]"
          >
            <Sparkles size={18} /> Generate Script
          </Link>
          <Link
            href="/admin/content-items"
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] active:bg-[var(--surface2)]"
          >
            <Plus size={18} /> Create Content Item
          </Link>
          <Link
            href="/admin/hooks"
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] active:bg-[var(--surface2)]"
          >
            <Anchor size={18} /> Browse Hooks
          </Link>
        </div>
      </section>
    </div>
  );
}
