'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ────────────────────────────────────────────────────────

interface Observation {
  id: string;
  product_name: string;
  product_url: string | null;
  brand_name: string | null;
  confidence: string;
  creator_has_posted: boolean;
  first_seen_at: string;
  observation_notes: string | null;
}

interface Creator {
  id: string;
  handle: string;
  display_name: string | null;
  platform: string;
  niche: string | null;
  priority: string;
  is_active: boolean;
  notes: string | null;
  tags: string[];
  observation_count: number;
  created_at: string;
}

interface LimitsInfo {
  planName: string;
  maxCreators: number;
  currentCreators: number;
  scansPerDay: number;
  usagePercent: number;
  atLimit: boolean;
  upgradeMessage: string | null;
}

// ── Badge helpers ────────────────────────────────────────────────

const PRIORITY_BADGES: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-400/10', text: 'text-red-400' },
  high: { bg: 'bg-amber-400/10', text: 'text-amber-400' },
  medium: { bg: 'bg-blue-400/10', text: 'text-blue-400' },
  low: { bg: 'bg-zinc-400/10', text: 'text-zinc-400' },
};

const PLATFORM_BADGES: Record<string, { bg: string; text: string }> = {
  tiktok: { bg: 'bg-pink-400/10', text: 'text-pink-400' },
  instagram: { bg: 'bg-purple-400/10', text: 'text-purple-400' },
  youtube: { bg: 'bg-red-400/10', text: 'text-red-400' },
  other: { bg: 'bg-zinc-400/10', text: 'text-zinc-400' },
};

// ── Component ────────────────────────────────────────────────────

export default function WatchlistPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [limits, setLimits] = useState<LimitsInfo | null>(null);

  // Filters
  const [nicheFilter, setNicheFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  // Add Creator drawer
  const [showAddCreator, setShowAddCreator] = useState(false);
  const [addCreatorForm, setAddCreatorForm] = useState<{
    handle: string;
    platform: string;
    niche: string;
    priority: string;
    display_name: string;
    notes: string;
  }>({
    handle: '', platform: 'tiktok', niche: '', priority: 'medium', display_name: '', notes: '',
  });
  const [addingCreator, setAddingCreator] = useState(false);

  // Expanded row observations
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedObs, setExpandedObs] = useState<Observation[]>([]);
  const [loadingObs, setLoadingObs] = useState(false);

  // Add Observation drawer
  const [showAddObs, setShowAddObs] = useState<string | null>(null); // creator id
  const [addObsForm, setAddObsForm] = useState({
    product_name: '', product_url: '', brand_name: '', confidence: 'medium', observation_notes: '',
  });
  const [addingObs, setAddingObs] = useState(false);

  // ── Auth ─────────────────────────────────────────────────────

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/opportunity-radar/watchlist'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/opportunity-radar/watchlist');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // ── Data fetching ───────────────────────────────────────────

  const fetchCreators = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (nicheFilter) params.set('niche', nicheFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (platformFilter) params.set('platform', platformFilter);

      const res = await fetch(`/api/admin/opportunity-radar/watchlist?${params}`);
      const data = await res.json();
      if (data.ok) {
        setCreators(data.data || []);
        if (data.limits) setLimits(data.limits);
      }
    } catch {
      showError('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, [nicheFilter, priorityFilter, platformFilter, showError]);

  useEffect(() => {
    if (isAdmin) fetchCreators();
  }, [isAdmin, fetchCreators]);

  // ── Expand row to show observations ─────────────────────────

  const toggleExpand = async (creatorId: string) => {
    if (expandedId === creatorId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(creatorId);
    setLoadingObs(true);
    try {
      const res = await fetch(`/api/admin/opportunity-radar/watchlist/${creatorId}`);
      const data = await res.json();
      if (data.ok) setExpandedObs(data.data.observations || []);
    } catch {
      showError('Failed to load observations');
    } finally {
      setLoadingObs(false);
    }
  };

  // ── Add Creator ─────────────────────────────────────────────

  const handleAddCreator = async () => {
    if (!addCreatorForm.handle.trim()) { showError('Handle is required'); return; }
    setAddingCreator(true);
    try {
      const res = await fetch('/api/admin/opportunity-radar/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addCreatorForm),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`@${addCreatorForm.handle} added to watchlist`);
        setShowAddCreator(false);
        setAddCreatorForm({ handle: '', platform: 'tiktok', niche: '', priority: 'medium', display_name: '', notes: '' });
        fetchCreators();
      } else {
        showError(data.message || 'Failed to add creator');
      }
    } catch {
      showError('Failed to add creator');
    } finally {
      setAddingCreator(false);
    }
  };

  // ── Toggle active ───────────────────────────────────────────

  const toggleActive = async (creator: Creator) => {
    try {
      const res = await fetch(`/api/admin/opportunity-radar/watchlist/${creator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !creator.is_active }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`@${creator.handle} ${creator.is_active ? 'paused' : 'activated'}`);
        fetchCreators();
      }
    } catch {
      showError('Failed to update creator');
    }
  };

  // ── Delete creator ──────────────────────────────────────────

  const deleteCreator = async (creator: Creator) => {
    if (!confirm(`Remove @${creator.handle} and all their observations?`)) return;
    try {
      const res = await fetch(`/api/admin/opportunity-radar/watchlist/${creator.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`@${creator.handle} removed`);
        fetchCreators();
      }
    } catch {
      showError('Failed to delete creator');
    }
  };

  // ── Add Observation ─────────────────────────────────────────

  const handleAddObservation = async () => {
    if (!addObsForm.product_name.trim() || !showAddObs) { showError('Product name is required'); return; }
    setAddingObs(true);
    try {
      const res = await fetch('/api/admin/opportunity-radar/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: showAddObs, ...addObsForm }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess('Observation added and scored');
        setShowAddObs(null);
        setAddObsForm({ product_name: '', product_url: '', brand_name: '', confidence: 'medium', observation_notes: '' });
        if (expandedId === showAddObs) toggleExpand(showAddObs);
        fetchCreators();
      } else {
        showError(data.message || 'Failed to add observation');
      }
    } catch {
      showError('Failed to add observation');
    } finally {
      setAddingObs(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Creator Watchlist"
      subtitle="Manage creators you're monitoring for product opportunities"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar', href: '/admin/opportunity-radar' },
        { label: 'Watchlist' },
      ]}
      headerActions={
        <AdminButton
          variant="primary"
          size="sm"
          onClick={() => setShowAddCreator(true)}
          disabled={limits?.atLimit}
        >
          + Add Creator
        </AdminButton>
      }
    >
      {/* Plan usage bar */}
      {limits && (
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-zinc-400">
            <span className="text-zinc-200 font-semibold">{limits.currentCreators}</span> / {limits.maxCreators} creators
          </span>
          <div className="flex-1 min-w-[120px] max-w-[200px]">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${limits.usagePercent >= 90 ? 'bg-red-500' : limits.usagePercent >= 70 ? 'bg-amber-500' : 'bg-violet-500'}`}
                style={{ width: `${Math.min(limits.usagePercent, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-zinc-500 text-xs">{limits.planName} plan — {limits.scansPerDay}x/day scans</span>
          {limits.atLimit && limits.upgradeMessage && (
            <span className="text-amber-400 text-xs ml-auto">{limits.upgradeMessage}</span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by niche..."
          value={nicheFilter}
          onChange={(e) => setNicheFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-48"
        />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <option value="">All Platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Creator Table */}
      <AdminCard noPadding>
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : creators.length === 0 ? (
          <EmptyState
            title="No creators tracked"
            description="Add creators to your watchlist to start monitoring their product activity."
            action={<AdminButton variant="primary" size="sm" onClick={() => setShowAddCreator(true)}>+ Add Creator</AdminButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Creator</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Niche</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Priority</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Observations</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c) => {
                  const priStyle = PRIORITY_BADGES[c.priority] || PRIORITY_BADGES.medium;
                  const platStyle = PLATFORM_BADGES[c.platform] || PLATFORM_BADGES.other;
                  const isExpanded = expandedId === c.id;

                  return (
                    <Fragment key={c.id}>
                      <tr
                        className={`border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors cursor-pointer ${!c.is_active ? 'opacity-50' : ''}`}
                        onClick={() => toggleExpand(c.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-zinc-200 font-medium">@{c.handle}</div>
                          {c.display_name && <div className="text-xs text-zinc-500">{c.display_name}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${platStyle.bg} ${platStyle.text}`}>
                            {c.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{c.niche || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priStyle.bg} ${priStyle.text}`}>
                            {c.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.observation_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => { setShowAddObs(c.id); setAddObsForm({ product_name: '', product_url: '', brand_name: '', confidence: 'medium', observation_notes: '' }); }}
                              className="text-xs text-violet-400 hover:text-violet-300"
                            >
                              + Obs
                            </button>
                            <button onClick={() => toggleActive(c)} className="text-xs text-zinc-500 hover:text-zinc-300">
                              {c.is_active ? 'Pause' : 'Activate'}
                            </button>
                            <button onClick={() => deleteCreator(c)} className="text-xs text-red-400/60 hover:text-red-400">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded observations */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-zinc-900/80 px-6 py-4">
                            {loadingObs ? (
                              <div className="text-xs text-zinc-500">Loading observations...</div>
                            ) : expandedObs.length === 0 ? (
                              <div className="text-xs text-zinc-500">No observations yet. Click &quot;+ Obs&quot; to add one.</div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Product Observations</div>
                                {expandedObs.map((obs) => (
                                  <div key={obs.id} className="flex items-center gap-3 text-xs bg-zinc-800/50 rounded-lg px-3 py-2">
                                    <span className="text-zinc-200 font-medium min-w-[140px]">{obs.product_name}</span>
                                    {obs.brand_name && <span className="text-zinc-500">{obs.brand_name}</span>}
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                      obs.confidence === 'confirmed' ? 'bg-emerald-400/10 text-emerald-400' :
                                      obs.confidence === 'high' ? 'bg-blue-400/10 text-blue-400' :
                                      obs.confidence === 'medium' ? 'bg-amber-400/10 text-amber-400' :
                                      'bg-zinc-400/10 text-zinc-400'
                                    }`}>
                                      {obs.confidence}
                                    </span>
                                    <span className={`text-[10px] ${obs.creator_has_posted ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                      {obs.creator_has_posted ? 'Posted' : 'Not posted'}
                                    </span>
                                    <span className="text-zinc-600 ml-auto">{new Date(obs.first_seen_at).toLocaleDateString()}</span>
                                    {obs.product_url && (
                                      <a href={obs.product_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300" onClick={(e) => e.stopPropagation()}>Link</a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* ── Add Creator Drawer ─────────────────────────────────── */}
      {showAddCreator && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddCreator(false)} />
          <div className="relative w-full max-w-md bg-zinc-900 border-l border-white/[0.08] p-6 overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-100 mb-6">Add Creator to Watchlist</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Handle *</label>
                <input
                  type="text"
                  value={addCreatorForm.handle}
                  onChange={(e) => setAddCreatorForm({ ...addCreatorForm, handle: e.target.value })}
                  placeholder="@username"
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={addCreatorForm.display_name}
                  onChange={(e) => setAddCreatorForm({ ...addCreatorForm, display_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Platform</label>
                  <select
                    value={addCreatorForm.platform}
                    onChange={(e) => setAddCreatorForm({ ...addCreatorForm, platform: e.target.value })}
                    className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Priority</label>
                  <select
                    value={addCreatorForm.priority}
                    onChange={(e) => setAddCreatorForm({ ...addCreatorForm, priority: e.target.value })}
                    className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Niche</label>
                <input
                  type="text"
                  value={addCreatorForm.niche}
                  onChange={(e) => setAddCreatorForm({ ...addCreatorForm, niche: e.target.value })}
                  placeholder="e.g. supplements, beauty, fitness"
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes</label>
                <textarea
                  value={addCreatorForm.notes}
                  onChange={(e) => setAddCreatorForm({ ...addCreatorForm, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <AdminButton variant="primary" onClick={handleAddCreator} disabled={addingCreator}>
                {addingCreator ? 'Adding...' : 'Add Creator'}
              </AdminButton>
              <AdminButton variant="secondary" onClick={() => setShowAddCreator(false)}>Cancel</AdminButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Observation Drawer ─────────────────────────────── */}
      {showAddObs && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddObs(null)} />
          <div className="relative w-full max-w-md bg-zinc-900 border-l border-white/[0.08] p-6 overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-100 mb-6">Add Product Observation</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Product Name *</label>
                <input
                  type="text"
                  value={addObsForm.product_name}
                  onChange={(e) => setAddObsForm({ ...addObsForm, product_name: e.target.value })}
                  placeholder="e.g. AG1 Athletic Greens"
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Product URL</label>
                <input
                  type="text"
                  value={addObsForm.product_url}
                  onChange={(e) => setAddObsForm({ ...addObsForm, product_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Brand Name</label>
                <input
                  type="text"
                  value={addObsForm.brand_name}
                  onChange={(e) => setAddObsForm({ ...addObsForm, brand_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confidence</label>
                <select
                  value={addObsForm.confidence}
                  onChange={(e) => setAddObsForm({ ...addObsForm, confidence: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes</label>
                <textarea
                  value={addObsForm.observation_notes}
                  onChange={(e) => setAddObsForm({ ...addObsForm, observation_notes: e.target.value })}
                  rows={3}
                  className="w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <AdminButton variant="primary" onClick={handleAddObservation} disabled={addingObs}>
                {addingObs ? 'Adding...' : 'Add Observation'}
              </AdminButton>
              <AdminButton variant="secondary" onClick={() => setShowAddObs(null)}>Cancel</AdminButton>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
