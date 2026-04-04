'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard, SectionDivider } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ───────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  display_name: string;
  recommendation: 'ACT_NOW' | 'TEST_SOON' | 'WATCH';
  trend_score: number;
  earlyness_score: number;
  saturation_score: number;
  creator_count: number;
  signal_count: number;
  signals_24h: number;
  velocity_score: number;
  community_wins: number;
  community_total_views: number;
  community_best_hook: string | null;
  first_signal_at: string | null;
  last_signal_at: string | null;
  forecast_breakdown: Record<string, unknown> | null;
  winning_hooks: Array<{ hook_text: string; performance_score: number }>;
}

interface FeedCounts {
  act_now: number;
  test_soon: number;
  watch: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RECOMMENDATION_STYLES = {
  ACT_NOW: {
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-400',
    border: 'border-emerald-400/30',
    label: 'Act Now',
    sectionBg: 'border-l-emerald-500',
  },
  TEST_SOON: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    border: 'border-amber-400/30',
    label: 'Test Soon',
    sectionBg: 'border-l-amber-500',
  },
  WATCH: {
    bg: 'bg-zinc-400/10',
    text: 'text-zinc-400',
    border: 'border-zinc-400/30',
    label: 'Watch',
    sectionBg: 'border-l-zinc-500',
  },
};

// ── Experiment Modal Types ───────────────────────────────────────────

interface ExperimentResult {
  experiment_id: string;
  product_name: string;
  total_hooks: number;
  total_scripts: number;
  total_items: number;
  matrix_size: number;
  angles_used: string[];
  personas_used: string[];
}

const ANGLE_OPTIONS = [
  { id: 'pain/problem', label: 'Pain / Problem' },
  { id: 'curiosity', label: 'Curiosity' },
  { id: 'contrarian', label: 'Contrarian' },
  { id: 'product demo', label: 'Product Demo' },
  { id: 'story/relatable', label: 'Story / Relatable' },
  { id: 'social proof', label: 'Social Proof' },
  { id: 'urgency', label: 'Urgency' },
];

// ── Page ────────────────────────────────────────────────────────────

export default function OpportunityFeedPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [counts, setCounts] = useState<FeedCounts>({ act_now: 0, test_soon: 0, watch: 0 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Experiment modal state
  const [experimentModal, setExperimentModal] = useState<FeedItem | null>(null);
  const [experimentVariants, setExperimentVariants] = useState(5);
  const [experimentAngles, setExperimentAngles] = useState<string[]>([]);
  const [experimentGenerating, setExperimentGenerating] = useState(false);
  const [experimentResult, setExperimentResult] = useState<ExperimentResult | null>(null);

  const openExperimentModal = (item: FeedItem) => {
    setExperimentModal(item);
    setExperimentVariants(5);
    setExperimentAngles([]);
    setExperimentResult(null);
    setExperimentGenerating(false);
  };

  const generateExperiment = async () => {
    if (!experimentModal) return;
    setExperimentGenerating(true);
    try {
      const res = await fetch('/api/admin/experiments/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_id: experimentModal.id,
          variant_count: experimentVariants,
          angles: experimentAngles.length > 0 ? experimentAngles : undefined,
        }),
      });
      const json = await res.json();
      if (json.ok || json.data?.experiment_id) {
        setExperimentResult(json.data);
        showSuccess(`Experiment created with ${json.data.total_hooks} hooks`);
      } else {
        showError(json.error || json.errors?.[0] || 'Generation failed');
      }
    } catch {
      showError('Failed to generate experiment');
    } finally {
      setExperimentGenerating(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/opportunity-feed'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/opportunity-feed');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchFeed = async () => {
      try {
        const res = await fetch('/api/admin/opportunity-feed');
        const json = await res.json();
        if (json.ok) {
          setFeed(json.data || []);
          setCounts(json.counts || { act_now: 0, test_soon: 0, watch: 0 });
        }
      } catch {
        showError('Failed to load opportunity feed');
      } finally {
        setLoading(false);
      }
    };
    fetchFeed();
  }, [isAdmin, showError]);

  const handleAction = async (clusterId: string, action: string) => {
    setActionLoading(clusterId);
    try {
      const res = await fetch('/api/admin/opportunity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster_id: clusterId, action }),
      });
      const json = await res.json();
      if (json.ok) {
        if (action === 'create_video') {
          showSuccess(`Content item created: ${json.data?.short_id || 'ready'}`);
        } else if (action === 'dismiss') {
          setFeed(prev => prev.filter(f => f.id !== clusterId));
          showSuccess('Dismissed from feed');
        }
      } else {
        showError(json.error || 'Action failed');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  const actNow = feed.filter(f => f.recommendation === 'ACT_NOW');
  const testSoon = feed.filter(f => f.recommendation === 'TEST_SOON');
  const watch = feed.filter(f => f.recommendation === 'WATCH');

  return (
    <AdminPageLayout
      title="Opportunity Feed"
      subtitle="What should you post today?"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar', href: '/admin/opportunity-radar' },
        { label: 'Feed' },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          <Link href="/admin/alerts">
            <AdminButton variant="secondary" size="sm">Alerts</AdminButton>
          </Link>
          <Link href="/admin/opportunity-radar/trends">
            <AdminButton variant="secondary" size="sm">All Trends</AdminButton>
          </Link>
          <Link href="/admin/opportunity-radar">
            <AdminButton variant="secondary" size="sm">Radar</AdminButton>
          </Link>
        </div>
      }
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Act Now" value={loading ? '...' : counts.act_now} variant="success" />
        <StatCard label="Test Soon" value={loading ? '...' : counts.test_soon} variant="warning" />
        <StatCard label="Watching" value={loading ? '...' : counts.watch} />
      </div>

      {/* Experiment Modal */}
      {experimentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !experimentGenerating && setExperimentModal(null)}>
          <div className="bg-zinc-900 rounded-xl border border-white/[0.1] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            {experimentResult ? (
              /* ── Result View ── */
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200">Experiment Created</h3>
                <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-4 space-y-2">
                  <div className="text-xs text-zinc-400">Product: <span className="text-zinc-200">{experimentResult.product_name}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-emerald-400">{experimentResult.total_hooks}</div>
                      <div className="text-[10px] text-zinc-500">Hooks</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-blue-400">{experimentResult.total_scripts}</div>
                      <div className="text-[10px] text-zinc-500">Scripts</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-violet-400">{experimentResult.total_items}</div>
                      <div className="text-[10px] text-zinc-500">Content Items</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-500 pt-1">
                    Angles: {experimentResult.angles_used.join(', ')}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Personas: {experimentResult.personas_used.join(', ')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/experiments/${experimentResult.experiment_id}`} className="flex-1">
                    <button className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                      View Experiment
                    </button>
                  </Link>
                  <button
                    onClick={() => setExperimentModal(null)}
                    className="px-3 py-2 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* ── Config View ── */
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Create Experiment</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Auto-generate hook/script variations for &ldquo;{experimentModal.display_name}&rdquo;
                  </p>
                </div>

                {/* Variant count */}
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Variants: <span className="text-zinc-200 font-medium">{experimentVariants}</span></label>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={experimentVariants}
                    onChange={e => setExperimentVariants(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                    disabled={experimentGenerating}
                  />
                  <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                    <span>3 (quick)</span>
                    <span>10 (thorough)</span>
                  </div>
                </div>

                {/* Angle selection */}
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Angles <span className="text-zinc-600">(optional — auto-picks if empty)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {ANGLE_OPTIONS.map(angle => {
                      const selected = experimentAngles.includes(angle.id);
                      return (
                        <button
                          key={angle.id}
                          onClick={() => {
                            if (selected) {
                              setExperimentAngles(prev => prev.filter(a => a !== angle.id));
                            } else if (experimentAngles.length < 5) {
                              setExperimentAngles(prev => [...prev, angle.id]);
                            }
                          }}
                          disabled={experimentGenerating}
                          className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                            selected
                              ? 'bg-emerald-400/20 border-emerald-400/40 text-emerald-400'
                              : 'bg-zinc-800 border-white/[0.06] text-zinc-500 hover:text-zinc-300'
                          } disabled:opacity-50`}
                        >
                          {angle.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generate */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={generateExperiment}
                    disabled={experimentGenerating}
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {experimentGenerating ? 'Generating...' : `Generate ${experimentVariants} Variants`}
                  </button>
                  <button
                    onClick={() => setExperimentModal(null)}
                    disabled={experimentGenerating}
                    className="px-3 py-2 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>

                {experimentGenerating && (
                  <div className="text-[11px] text-zinc-500 text-center animate-pulse">
                    Generating hooks, scripts, and content items... this may take up to 2 minutes.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : feed.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          description="Add creators to the watchlist and log observations to generate scored opportunities."
          action={
            <Link href="/admin/opportunity-radar/watchlist">
              <AdminButton variant="primary" size="sm">Go to Watchlist</AdminButton>
            </Link>
          }
        />
      ) : (
        <>
          {/* ACT NOW Section */}
          {actNow.length > 0 && (
            <>
              <SectionDivider label={`Act Now (${actNow.length})`} />
              <div className="space-y-3">
                {actNow.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onAction={handleAction}
                    onExperiment={openExperimentModal}
                    loading={actionLoading === item.id}
                  />
                ))}
              </div>
            </>
          )}

          {/* TEST SOON Section */}
          {testSoon.length > 0 && (
            <>
              <SectionDivider label={`Test Soon (${testSoon.length})`} />
              <div className="space-y-3">
                {testSoon.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onAction={handleAction}
                    onExperiment={openExperimentModal}
                    loading={actionLoading === item.id}
                  />
                ))}
              </div>
            </>
          )}

          {/* WATCH Section (collapsed by default) */}
          {watch.length > 0 && (
            <WatchSection items={watch} onAction={handleAction} actionLoading={actionLoading} />
          )}
        </>
      )}
    </AdminPageLayout>
  );
}

// ── Feed Card Component ─────────────────────────────────────────────

function FeedCard({
  item,
  onAction,
  onExperiment,
  loading,
}: {
  item: FeedItem;
  onAction: (id: string, action: string) => void;
  onExperiment?: (item: FeedItem) => void;
  loading: boolean;
}) {
  const style = RECOMMENDATION_STYLES[item.recommendation];
  const hasCommunity = item.community_wins > 0;

  return (
    <div className={`bg-zinc-900/50 rounded-xl border border-white/[0.08] p-5 border-l-4 ${style.sectionBg}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Left: Product info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-zinc-200 truncate">{item.display_name}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text} border ${style.border}`}>
              {style.label}
            </span>
            {hasCommunity && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-orange-400/10 text-orange-400 border border-orange-400/30">
                Community Momentum
              </span>
            )}
          </div>

          {/* Scores row */}
          <div className="flex items-center gap-4 text-xs mb-2">
            <span className="text-zinc-500">
              Trend <span className="text-zinc-300 font-medium tabular-nums">{item.trend_score}</span>
            </span>
            <span className="text-zinc-500">
              Early <span className="text-emerald-400 font-medium tabular-nums">{item.earlyness_score}</span>
            </span>
            <span className="text-zinc-500">
              Sat <span className="text-blue-400 font-medium tabular-nums">{item.saturation_score}</span>
            </span>
            <span className="text-zinc-500">
              Creators <span className="text-zinc-300 font-medium tabular-nums">{item.creator_count}</span>
            </span>
            {item.signals_24h > 0 && (
              <span className="text-zinc-500">
                24h <span className="text-amber-400 font-medium tabular-nums">{item.signals_24h}</span>
              </span>
            )}
            {item.velocity_score > 0 && (
              <span className="text-zinc-500">
                Vel <span className="text-violet-400 font-medium tabular-nums">{item.velocity_score}</span>
              </span>
            )}
          </div>

          {/* Community intelligence */}
          {hasCommunity && (
            <div className="text-xs text-orange-400/80 mb-2">
              {item.community_wins} video{item.community_wins > 1 ? 's' : ''} published
              {item.community_total_views > 0 && ` — ${formatViews(item.community_total_views)} total views`}
            </div>
          )}

          {/* Best hook */}
          {item.community_best_hook && (
            <div className="text-xs text-zinc-500 italic mb-2 truncate">
              Best hook: &ldquo;{item.community_best_hook}&rdquo;
            </div>
          )}

          {/* Winning hooks from feed */}
          {item.winning_hooks.length > 0 && !item.community_best_hook && (
            <div className="text-xs text-zinc-500 italic mb-2 truncate">
              Top hook: &ldquo;{item.winning_hooks[0].hook_text}&rdquo;
              <span className="text-emerald-400 ml-1">({item.winning_hooks[0].performance_score}/100)</span>
            </div>
          )}

          {/* Recommendation reason */}
          {item.forecast_breakdown && (
            <div className="text-[11px] text-zinc-600">
              {(item.forecast_breakdown as { recommendation_reason?: string }).recommendation_reason || ''}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {item.recommendation === 'ACT_NOW' && (
            <button
              onClick={() => onAction(item.id, 'create_video')}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : 'Create Video'}
            </button>
          )}
          {item.recommendation === 'TEST_SOON' && (
            <Link href={`/admin/opportunity-radar/trends?recommendation=TEST_SOON`}>
              <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                Research
              </button>
            </Link>
          )}
          {onExperiment && (item.recommendation === 'ACT_NOW' || item.recommendation === 'TEST_SOON') && (
            <button
              onClick={() => onExperiment(item)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Create Experiment
            </button>
          )}
          <button
            onClick={() => onAction(item.id, 'dismiss')}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Last signal timestamp */}
      <div className="text-[10px] text-zinc-600 mt-2">
        Last signal {timeAgo(item.last_signal_at)} · First seen {timeAgo(item.first_signal_at)}
      </div>
    </div>
  );
}

// ── Watch Section (collapsible) ─────────────────────────────────────

function WatchSection({
  items,
  onAction,
  actionLoading,
}: {
  items: FeedItem[];
  onAction: (id: string, action: string) => void;
  actionLoading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 mt-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
          Watching ({items.length})
        </button>
        <div className="flex-1 border-t border-white/[0.06]" />
      </div>
      {expanded && (
        <div className="space-y-2 mt-2">
          {items.map(item => (
            <FeedCard
              key={item.id}
              item={item}
              onAction={onAction}
              loading={actionLoading === item.id}
            />
          ))}
        </div>
      )}
    </>
  );
}
