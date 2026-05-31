'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminPageLayout, { AdminCard, AdminButton } from '@/app/admin/components/AdminPageLayout';
import { SkeletonAuthCheck } from '@/components/ui/Skeleton';

type PostStatus = 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';

interface MarketingPost {
  id: string;
  content: string;
  status: PostStatus;
  source: string;
  platforms: Array<{ platform: string }>;
  claim_risk_score: number;
  claim_risk_flags: string[];
  late_post_id: string | null;
  error: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type Tab = 'queue' | 'repurpose';

const STATUS_COLORS: Record<PostStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  scheduled: 'bg-blue-500/20 text-blue-300',
  published: 'bg-green-500/20 text-green-300',
  failed: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-zinc-500/20 text-zinc-400',
};

const STATUS_OPTIONS: PostStatus[] = ['pending', 'scheduled', 'published', 'failed', 'cancelled'];

export default function MarketingPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return <div className="p-8 text-red-400">Admin access required</div>;

  return (
    <AdminPageLayout title="Marketing Engine" subtitle="Queue, schedule, and repurpose social content">
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('queue')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'queue' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          Queue
        </button>
        <button
          onClick={() => setTab('repurpose')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'repurpose' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          Repurpose
        </button>
      </div>

      {tab === 'queue' && <QueueTab />}
      {tab === 'repurpose' && <RepurposeTab />}
    </AdminPageLayout>
  );
}

// ── Queue Tab ────────────────────────────────────────────────────
interface BrandOption {
  key: string;
  brand: string;
  platform: string;
  account_id: string;
  page_id: string | null;
  parent_brand: string | null;
  label: string;
}

function QueueTab() {
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [acting, setActing] = useState<string | null>(null);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [movingPostId, setMovingPostId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/marketing/brand-options')
      .then((r) => r.json())
      .then((d) => setBrandOptions(d.options || []))
      .catch(() => setBrandOptions([]));
  }, []);

  const moveTo = async (postId: string, targetBrand: string) => {
    setActing(postId);
    await fetch(`/api/marketing/posts/${postId}/retarget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_brand: targetBrand, target_platforms: ['facebook'] }),
    });
    setActing(null);
    setMovingPostId(null);
    fetchPosts();
  };

  // Group options by umbrella for nicer dropdown rendering
  const groupedOptions: Record<string, BrandOption[]> = {};
  for (const o of brandOptions) {
    const k = o.parent_brand || o.brand;
    groupedOptions[k] = groupedOptions[k] || [];
    groupedOptions[k].push(o);
  }

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (brandFilter) params.set('brand', brandFilter);
    params.set('limit', '50');

    const res = await fetch(`/api/marketing/queue?${params}`);
    const data = await res.json();
    setPosts(data.posts || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [statusFilter, brandFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const postAction = async (id: string, action: 'retry' | 'cancel' | 'approve') => {
    setActing(id);
    if (action === 'approve') {
      // New approval gate endpoint — sets meta.approved=true
      await fetch(`/api/marketing/posts/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'brandon' }),
      });
    } else if (action === 'cancel') {
      await fetch(`/api/marketing/posts/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'brandon', reason: 'rejected from admin queue' }),
      });
    } else {
      // retry — old endpoint
      await fetch('/api/marketing/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
    }
    setActing(null);
    fetchPosts();
  };

  // MMM posts are managed in Mission Control by Josh — exclude by default
  const [showMmm, setShowMmm] = useState(false);
  const filteredPosts = posts.filter((p) => {
    if (showMmm) return true;
    const brand = (p.meta?.brand as string) || '';
    const parent = (p.meta?.parent_brand as string) || '';
    return !brand.toLowerCase().includes('making miles matter') &&
           !parent.toLowerCase().includes('making miles matter');
  });

  return (
    <>
      {/* MMM-separated banner */}
      <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs sm:text-sm">
        <strong>MMM / HHH / NWO posts live in MMM OS</strong> —
        Josh approves those at <a href="https://makingmilesmatter.org/team/marketing" target="_blank" rel="noopener" className="underline">makingmilesmatter.org/team/marketing</a>.
        This queue shows everything else (Zebby&apos;s, FlashFlow, TCG, niche farms).
        <label className="ml-2 inline-flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showMmm} onChange={(e) => setShowMmm(e.target.checked)} className="rounded" />
          <span>show MMM here too</span>
        </label>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-3 py-2 text-sm min-h-[44px] sm:min-h-0"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-3 py-2 text-sm min-h-[44px] sm:min-h-0"
        >
          <option value="">All brands</option>
          <option value="Zebby's World">Zebby&apos;s World</option>
          <option value="FlashFlow">FlashFlow</option>
          <option value="TCG Buying Group">TCG Buying Group</option>
          {showMmm && <option value="Making Miles Matter">Making Miles Matter</option>}
        </select>
        <AdminButton variant="secondary" size="sm" onClick={fetchPosts}>
          Refresh
        </AdminButton>
        <span className="text-zinc-500 text-sm self-center">
          {filteredPosts.length} shown / {total} total
        </span>
      </div>

      {/* Posts — mobile-first cards (table on lg+) */}
      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading posts...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No posts to review</div>
        ) : (
          <>
            {/* MOBILE / TABLET: stacked cards */}
            <div className="flex flex-col divide-y divide-white/5 lg:hidden">
              {filteredPosts.map((post) => {
                const pageName =
                  (post.meta?.target_page_name as string | undefined) ||
                  (post.meta?.brand as string | undefined) ||
                  '—';
                const umbrella = post.meta?.parent_brand as string | undefined;
                const pageId =
                  (post.meta?.target_page_id as string | undefined) ||
                  (post.platforms?.[0] as { platformSpecificData?: { pageId?: string } } | undefined)
                    ?.platformSpecificData?.pageId;
                return (
                  <div key={post.id} className="p-4 space-y-3">
                    {/* Target page banner */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="text-base font-semibold text-zinc-100">→ {pageName}</div>
                        {umbrella && umbrella !== pageName && (
                          <div className="text-xs text-zinc-500">under {umbrella}</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <span className={`px-2 py-1 rounded text-[11px] font-medium ${STATUS_COLORS[post.status]}`}>
                          {post.status}
                        </span>
                        {post.meta?.approved === true && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">approved ✓</span>
                        )}
                      </div>
                    </div>

                    {/* Content body */}
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {post.content.length > 280
                        ? `${post.content.slice(0, 280)}…`
                        : post.content}
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        post.claim_risk_score >= 70 ? 'bg-red-500/20 text-red-300' :
                        post.claim_risk_score >= 30 ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        risk {post.claim_risk_score >= 70 ? 'HIGH' : post.claim_risk_score >= 30 ? 'MED' : 'LOW'}
                      </span>
                      <span>{post.source}</span>
                      <span>•</span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      {pageId && <span className="font-mono">id:{String(pageId).slice(0, 8)}…</span>}
                    </div>

                    {/* Action buttons — large touch targets */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {post.status === 'pending' && post.meta?.approved !== true && (
                        <button
                          onClick={() => postAction(post.id, 'approve')}
                          disabled={acting === post.id}
                          className="min-h-[44px] rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 active:bg-emerald-500/40 disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                      )}
                      {(post.status === 'pending' || post.status === 'failed') && (
                        <button
                          onClick={() => postAction(post.id, 'cancel')}
                          disabled={acting === post.id}
                          className="min-h-[44px] rounded-lg text-sm font-medium bg-red-500/20 text-red-200 hover:bg-red-500/30 active:bg-red-500/40 disabled:opacity-50"
                        >
                          ✕ {post.meta?.approved === true ? 'Unapprove' : 'Reject'}
                        </button>
                      )}
                      {post.status === 'pending' && (
                        <button
                          onClick={() => setMovingPostId(movingPostId === post.id ? null : post.id)}
                          disabled={acting === post.id}
                          className="min-h-[44px] rounded-lg text-sm font-medium bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 active:bg-purple-500/40 disabled:opacity-50"
                        >
                          ↔ Move
                        </button>
                      )}
                      {post.status === 'failed' && (
                        <button
                          onClick={() => postAction(post.id, 'retry')}
                          disabled={acting === post.id}
                          className="min-h-[44px] rounded-lg text-sm font-medium bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50"
                        >
                          ↻ Retry
                        </button>
                      )}
                    </div>

                    {/* Move-to dropdown */}
                    {movingPostId === post.id && (
                      <div className="p-3 rounded-lg bg-zinc-900 border border-purple-500/30 space-y-2">
                        <div className="text-[11px] text-zinc-400 uppercase tracking-wide">
                          Pivot this post to:
                        </div>
                        <select
                          disabled={acting === post.id}
                          onChange={(e) => { if (e.target.value) moveTo(post.id, e.target.value); }}
                          className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded px-3 py-2 text-sm min-h-[44px]"
                          defaultValue=""
                        >
                          <option value="">— pick a page —</option>
                          {Object.entries(groupedOptions).sort().map(([umb, opts]) => (
                            <optgroup key={umb} label={umb}>
                              {opts.filter((o) => o.platform === 'facebook').map((o) => (
                                <option key={o.key} value={o.brand}>
                                  {o.brand}{o.parent_brand ? ` — (${o.parent_brand})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          onClick={() => setMovingPostId(null)}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300"
                        >
                          cancel move
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* DESKTOP (lg+): table */}
            <div className="overflow-x-auto hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 text-left">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Content</th>
                  <th className="px-4 py-3 font-medium">Target Page</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr key={post.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[post.status]}`}>
                        {post.status}
                      </span>
                      {Boolean(post.meta?.needs_review) && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-300">review</span>
                      )}
                      {post.meta?.approved === true && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">approved</span>
                      )}
                      {post.meta?.parent_brand && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300">
                          farm: {String(post.meta.parent_brand)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-zinc-200" title={post.content}>
                      {post.content.slice(0, 80)}
                    </td>
                    <td className="px-4 py-3 text-zinc-200">
                      {(() => {
                        const pageName =
                          (post.meta?.target_page_name as string | undefined) ||
                          (post.meta?.brand as string | undefined) ||
                          '—';
                        const umbrella = post.meta?.parent_brand as string | undefined;
                        const pageId =
                          (post.meta?.target_page_id as string | undefined) ||
                          (post.platforms?.[0] as { platformSpecificData?: { pageId?: string } } | undefined)
                            ?.platformSpecificData?.pageId;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">→ {pageName}</span>
                            {umbrella && umbrella !== pageName && (
                              <span className="text-[10px] text-zinc-500">under {umbrella}</span>
                            )}
                            {pageId && (
                              <span className="text-[10px] text-zinc-600 font-mono">page_id: {pageId}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{post.source}</td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        post.claim_risk_score >= 70 ? 'bg-red-500/20 text-red-300' :
                        post.claim_risk_score >= 30 ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {post.claim_risk_score >= 70 ? 'HIGH' : post.claim_risk_score >= 30 ? 'MED' : 'LOW'} ({post.claim_risk_score})
                      </span>
                      {post.claim_risk_flags.length > 0 && (
                        <span className="block text-[10px] text-zinc-500 mt-0.5 max-w-[120px] truncate" title={post.claim_risk_flags.join(', ')}>
                          {post.claim_risk_flags.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {new Date(post.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {post.status === 'failed' && (
                          <button
                            onClick={() => postAction(post.id, 'retry')}
                            disabled={acting === post.id}
                            className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
                          >
                            Retry
                          </button>
                        )}
                        {post.status === 'pending' && post.meta?.approved !== true && (
                          <button
                            onClick={() => postAction(post.id, 'approve')}
                            disabled={acting === post.id}
                            className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {(post.status === 'pending' || post.status === 'failed') && (
                          <button
                            onClick={() => postAction(post.id, 'cancel')}
                            disabled={acting === post.id}
                            className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                          >
                            {post.meta?.approved === true ? 'Unapprove (cancel)' : 'Cancel'}
                          </button>
                        )}
                        {post.status === 'pending' && (
                          <button
                            onClick={() => setMovingPostId(movingPostId === post.id ? null : post.id)}
                            disabled={acting === post.id}
                            className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"
                          >
                            Move to ▾
                          </button>
                        )}
                      </div>
                      {movingPostId === post.id && (
                        <div className="mt-2 p-2 rounded bg-zinc-900 border border-purple-500/30 max-w-[260px]">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                            Pivot this post to:
                          </div>
                          <select
                            disabled={acting === post.id}
                            onChange={(e) => {
                              if (e.target.value) moveTo(post.id, e.target.value);
                            }}
                            className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded px-2 py-1 text-xs"
                            defaultValue=""
                          >
                            <option value="">— pick a page —</option>
                            {Object.entries(groupedOptions).sort().map(([umbrella, opts]) => (
                              <optgroup key={umbrella} label={umbrella}>
                                {opts
                                  .filter((o) => o.platform === 'facebook')
                                  .map((o) => (
                                    <option key={o.key} value={o.brand}>
                                      {o.brand}
                                      {o.parent_brand ? ` — (${o.parent_brand})` : ' — (umbrella)'}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            onClick={() => setMovingPostId(null)}
                            className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                          >
                            cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </AdminCard>
    </>
  );
}

// ── Result Card ──────────────────────────────────────────────────
function ResultCard({ result }: { result: Record<string, unknown> }) {
  const risk = result.claim_risk as Record<string, unknown> | undefined;
  const pack = result.caption_pack as Record<string, unknown> | undefined;
  const riskLevel = String(risk?.level ?? 'LOW');
  const riskBadge = riskLevel === 'HIGH' ? 'bg-red-500/20 text-red-300' : riskLevel === 'MED' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300';

  return (
    <AdminCard title="Result">
      <div className="space-y-3 text-sm">
        {/* HIGH risk warning banner */}
        {riskLevel === 'HIGH' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs">
            <strong>HIGH RISK — BLOCKED.</strong> This content contains disallowed health/supplement claims and cannot be auto-published. Edit the content to remove flagged phrases before approving.
            {Array.isArray(risk?.flags) && (risk.flags as string[]).length > 0 && (
              <div className="mt-1 text-red-400/70">Flags: {(risk.flags as string[]).join(', ')}</div>
            )}
          </div>
        )}
        {riskLevel === 'MED' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs">
            <strong>MED RISK — NEEDS REVIEW.</strong> This content may contain claims that require a disclaimer or human approval before publishing.
            {Array.isArray(risk?.flags) && (risk.flags as string[]).length > 0 && (
              <div className="mt-1 text-yellow-400/70">Flags: {(risk.flags as string[]).join(', ')}</div>
            )}
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-zinc-400">Status</span>
          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[(String(result.status) as PostStatus) || 'pending']}`}>
            {String(result.status)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Risk</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${riskBadge}`}>
            {riskLevel} ({String(risk?.score ?? '?')})
          </span>
        </div>
        {Boolean(result.needs_transcript) && (
          <div className="text-orange-400 text-xs">Transcript unavailable — captions generated from metadata only</div>
        )}
        {Boolean(pack?.facebook_caption_short) && (
          <div>
            <div className="text-zinc-400 text-xs mb-1">FB Short</div>
            <div className="bg-zinc-800/50 rounded p-2 text-zinc-200 text-xs">{String(pack!.facebook_caption_short)}</div>
          </div>
        )}
        {Boolean(pack?.facebook_post_long) && (
          <div>
            <div className="text-zinc-400 text-xs mb-1">FB Long</div>
            <div className="bg-zinc-800/50 rounded p-2 text-zinc-200 text-xs whitespace-pre-wrap">{String(pack!.facebook_post_long)}</div>
          </div>
        )}
        {Array.isArray(pack?.hashtags) && (pack.hashtags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(pack.hashtags as string[]).map((h: string) => (
              <span key={h} className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">#{h}</span>
            ))}
          </div>
        )}
        <div className="text-zinc-500 text-[10px] mt-2">
          Post ID: {String(result.post_id ?? '')} | Run: {String(result.run_id ?? '')}
        </div>
      </div>
    </AdminCard>
  );
}

// ── Repurpose Tab ────────────────────────────────────────────────
function RepurposeTab() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [brand, setBrand] = useState('Making Miles Matter');
  const [platforms, setPlatforms] = useState(['facebook']);
  const [autoPublish, setAutoPublish] = useState(false);
  const [contentType, setContentType] = useState<'reel' | 'feed'>('reel');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const submit = async () => {
    if (!sourceUrl) { setError('Source URL required'); return; }
    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/marketing/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_url: sourceUrl,
          target_platforms: platforms,
          caption_override: caption || undefined,
          auto_publish: autoPublish,
          brand,
          content_type: contentType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminCard title="Repurpose Video">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Source URL</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/..."
              className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Brand</label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="Making Miles Matter">Making Miles Matter</option>
              <option value="Zebby's World">Zebby&apos;s World</option>
              <option value="FlashFlow">FlashFlow</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Target Platforms</label>
            <div className="flex gap-2 flex-wrap">
              {['facebook', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest'].map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    platforms.includes(p)
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Content Type</label>
            <div className="flex gap-2">
              {(['reel', 'feed'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setContentType(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${
                    contentType === t ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Caption Override (optional)</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Leave empty to auto-generate from transcript"
              className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-publish"
              checked={autoPublish}
              onChange={(e) => setAutoPublish(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="auto-publish" className="text-sm text-zinc-300">
              Auto-publish (if risk is safe)
            </label>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <AdminButton variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Processing...' : 'Create Repurpose Pack'}
          </AdminButton>
        </div>
      </AdminCard>

      {result && <ResultCard result={result} />}
    </div>
  );
}
