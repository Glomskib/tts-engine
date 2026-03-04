'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2, RefreshCw, Mic, Scissors, Send, Flame, Trophy, Zap,
  ChevronRight, ExternalLink, Lightbulb, Plus, Sparkles, Check,
  BarChart3,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminPageLayout, { AdminCard, EmptyState } from '@/app/admin/components/AdminPageLayout';

// ─── Types ────────────────────────────────────────────────────

interface ContentItem {
  id: string;
  title: string | null;
  product_id: string | null;
  created_at: string;
}

interface ViralInsight {
  id: string;
  content_item_id: string;
  content_item_post_id: string | null;
  generated_at: string;
  json: Record<string, unknown> | null;
  markdown: string | null;
}

interface WinnerEntry {
  id: string;
  hook: string | null;
  full_script: string | null;
  video_url: string | null;
  view_count: number | null;
  engagement_rate: number | null;
  performance_score: number | null;
  created_at: string;
}

interface HookPattern {
  id: string;
  pattern: string;
  example_hook: string | null;
  performance_score: number;
  uses_count: number;
}

interface ProductPerf {
  product_id: string;
  total_posts: number;
  avg_views: number;
  avg_engagement: number;
  products: { name: string } | null;
}

interface CommandCenterData {
  record_queue: ContentItem[];
  editing_queue: ContentItem[];
  posting_queue: ContentItem[];
  viral_content: ViralInsight[];
  recent_winners: WinnerEntry[];
  top_hooks: HookPattern[];
  product_performance: ProductPerf[];
}

interface GeneratedIdea {
  title: string;
  hook: string;
  angle: string;
  product_opportunity: string | null;
  estimated_difficulty: 'easy' | 'medium' | 'hard';
}

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  easy: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Easy' },
  medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Medium' },
  hard: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Hard' },
};

// ─── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Queue Card ───────────────────────────────────────────────

function QueueSection({
  title,
  icon,
  accent,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  items: ContentItem[];
  emptyText: string;
}) {
  return (
    <AdminCard
      title={title}
      headerActions={
        items.length > 0 ? (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${accent}`}>
            {items.length}
          </span>
        ) : null
      }
    >
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/admin/pipeline?video=${item.id}`}
              className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div className="flex-shrink-0 text-zinc-600 group-hover:text-zinc-400">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">
                  {item.title || 'Untitled'}
                </div>
                <div className="text-[11px] text-zinc-600">{timeAgo(item.created_at)}</div>
              </div>
              <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 py-4 text-center">{emptyText}</p>
      )}
    </AdminCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function CommandCenter() {
  const router = useRouter();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [createdIds, setCreatedIds] = useState<Set<number>>(new Set());

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/command-center');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateIdeas = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ideas/generate', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setIdeas(json.data.ideas);
        setCreatedIds(new Set());
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  };

  const createFromIdea = async (idea: GeneratedIdea, index: number) => {
    try {
      const res = await fetch('/api/content-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: idea.title }),
      });
      const json = await res.json();
      if (json.ok) {
        setCreatedIds(prev => new Set(prev).add(index));
      }
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <AdminPageLayout title="Command Center">
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!data) {
    return (
      <AdminPageLayout title="Command Center">
        <EmptyState
          icon={<Zap size={24} />}
          title="Unable to load data"
          description="Try refreshing the page."
        />
      </AdminPageLayout>
    );
  }

  const totalActionable = data.record_queue.length + data.editing_queue.length + data.posting_queue.length;

  return (
    <AdminPageLayout
      title="Command Center"
      subtitle={totalActionable > 0 ? `${totalActionable} items need action` : 'All clear'}
      maxWidth="2xl"
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/content-studio?action=create"
            className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Content Item
          </Link>
          <button
            type="button"
            onClick={generateIdeas}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate Ideas
          </button>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      {/* Action Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QueueSection
          title="Record Queue"
          icon={<Mic size={14} />}
          accent="bg-violet-500/20 text-violet-400"
          items={data.record_queue}
          emptyText="Nothing to record"
        />
        <QueueSection
          title="Editing Queue"
          icon={<Scissors size={14} />}
          accent="bg-blue-500/20 text-blue-400"
          items={data.editing_queue}
          emptyText="Nothing in editing"
        />
        <QueueSection
          title="Posting Queue"
          icon={<Send size={14} />}
          accent="bg-teal-500/20 text-teal-400"
          items={data.posting_queue}
          emptyText="Nothing to post"
        />
      </div>

      {/* Intelligence Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Viral Content */}
        <AdminCard title="Viral Alerts" subtitle="AI-detected winners">
          {data.viral_content.length > 0 ? (
            <div className="space-y-2">
              {data.viral_content.map((insight) => {
                const summary =
                  (insight.json as Record<string, string>)?.summary ||
                  insight.markdown?.slice(0, 80) ||
                  'Winner candidate detected';
                return (
                  <Link
                    key={insight.id}
                    href={`/admin/pipeline?video=${insight.content_item_id}`}
                    className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-500/10 flex-shrink-0 mt-0.5">
                      <Flame size={14} className="text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 line-clamp-2">{summary}</div>
                      <div className="text-[11px] text-zinc-600 mt-0.5">{timeAgo(insight.generated_at)}</div>
                    </div>
                    <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 py-4 text-center">No viral alerts yet</p>
          )}
        </AdminCard>

        {/* Recent Winners */}
        <AdminCard title="Recent Winners" subtitle="Latest winning content">
          {data.recent_winners.length > 0 ? (
            <div className="space-y-2">
              {data.recent_winners.map((winner) => (
                <Link
                  key={winner.id}
                  href="/admin/winners"
                  className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-yellow-500/10 flex-shrink-0 mt-0.5">
                    <Trophy size={14} className="text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 line-clamp-1">
                      {winner.hook || winner.full_script?.slice(0, 60) || 'Winner'}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {winner.view_count != null && (
                        <span className="text-[11px] text-zinc-500">{formatNum(winner.view_count)} views</span>
                      )}
                      {winner.engagement_rate != null && (
                        <span className="text-[11px] text-zinc-500">{winner.engagement_rate}% eng</span>
                      )}
                      {winner.performance_score != null && (
                        <span className="text-[11px] text-emerald-500 font-medium">{winner.performance_score}/10</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 py-4 text-center">No winners yet</p>
          )}
        </AdminCard>

        {/* Top Hooks */}
        <AdminCard title="Top Hooks" subtitle="Best performing patterns">
          {data.top_hooks.length > 0 ? (
            <div className="space-y-2">
              {data.top_hooks.map((hook) => (
                <div
                  key={hook.id}
                  className="flex items-start gap-3 py-2"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-yellow-500/10 flex-shrink-0 mt-0.5">
                    <Zap size={14} className="text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">{hook.pattern}</div>
                    {hook.example_hook && (
                      <div className="text-xs text-zinc-500 mt-0.5 italic truncate">{hook.example_hook}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-yellow-400">{hook.performance_score}/10</div>
                    <div className="text-[10px] text-zinc-600">{hook.uses_count} uses</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600 py-4 text-center">No hook patterns yet</p>
          )}
        </AdminCard>
      </div>

      {/* Top Products */}
      <AdminCard title="Top Products" subtitle="By engagement rate">
        {data.product_performance.length > 0 ? (
          <div className="space-y-1">
            {data.product_performance.map((pp) => (
              <Link
                key={pp.product_id}
                href="/admin/products"
                className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/10 flex-shrink-0">
                  <BarChart3 size={14} className="text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">
                    {pp.products?.name || 'Unknown Product'}
                  </div>
                  <div className="text-[11px] text-zinc-600">
                    {pp.total_posts} post{pp.total_posts !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-medium text-teal-400">{pp.avg_engagement}% eng</div>
                  <div className="text-[10px] text-zinc-600">{formatNum(pp.avg_views)} avg views</div>
                </div>
                <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 py-4 text-center">No product data yet</p>
        )}
      </AdminCard>

      {/* Generated Ideas */}
      {ideas.length > 0 && (
        <AdminCard title="AI-Generated Ideas" subtitle="Click to create a content item">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => {
              const diff = DIFFICULTY_STYLES[idea.estimated_difficulty] || DIFFICULTY_STYLES.medium;
              const created = createdIds.has(i);
              return (
                <div
                  key={i}
                  className="p-4 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium text-zinc-100 leading-snug">{idea.title}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${diff.bg} ${diff.text} flex-shrink-0`}>
                      {diff.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 italic mb-1.5">&ldquo;{idea.hook}&rdquo;</p>
                  <p className="text-xs text-zinc-500 mb-2">{idea.angle}</p>
                  {idea.product_opportunity && (
                    <p className="text-[11px] text-teal-500 mb-3">Product: {idea.product_opportunity}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => createFromIdea(idea, i)}
                    disabled={created}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                      created
                        ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                        : 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30'
                    }`}
                  >
                    {created ? (
                      <>
                        <Check size={12} />
                        Created
                      </>
                    ) : (
                      <>
                        <Plus size={12} />
                        Create Content Item
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </AdminCard>
      )}

      {/* Generating spinner */}
      {generating && ideas.length === 0 && (
        <div className="flex items-center justify-center gap-3 py-12">
          <Loader2 size={20} className="animate-spin text-violet-400" />
          <span className="text-sm text-zinc-400">Generating ideas...</span>
        </div>
      )}
    </AdminPageLayout>
  );
}
