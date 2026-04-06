'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard } from '../components/AdminPageLayout';
import { Rocket, Plus, Package, Users, Video, Eye, DollarSign, TrendingUp, ExternalLink, Loader2, X } from 'lucide-react';
import type { ProductLaunchWithCounts, LaunchStatus } from '@/lib/launch-sync/types';
import { LAUNCH_STATUS_LABELS, LAUNCH_STATUS_COLORS } from '@/lib/launch-sync/types';

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LaunchStatus }) {
  const c = LAUNCH_STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'generating' ? 'animate-pulse' : ''}`} />
      {LAUNCH_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Launch Card ─────────────────────────────────────────────────────────────

function LaunchCard({ launch }: { launch: ProductLaunchWithCounts }) {
  return (
    <Link href={`/admin/launch-sync/${launch.id}`}>
      <AdminCard>
        <div className="flex items-start gap-4">
          {/* Image */}
          <div className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden flex-shrink-0">
            {launch.image_url ? (
              <img src={launch.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-6 h-6 text-zinc-600" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-teal-400 transition-colors">
                {launch.title}
              </h3>
              <StatusBadge status={launch.status} />
            </div>

            {launch.product_name && (
              <p className="text-xs text-zinc-500 truncate mb-2">{launch.product_name}</p>
            )}

            <div className="flex items-center gap-4 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Video className="w-3 h-3" />
                {launch.content_count || 0} / {launch.target_videos} videos
              </span>
              {launch.mode === 'agency' && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {launch.affiliate_count || 0} affiliates
                </span>
              )}
              {launch.total_views > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {launch.total_views.toLocaleString()} views
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase text-[10px] font-medium">
                {launch.mode}
              </span>
            </div>
          </div>
        </div>
      </AdminCard>
    </Link>
  );
}

// ─── Create Modal ────────────────────────────────────────────────────────────

function CreateLaunchModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [mode, setMode] = useState<'solo' | 'agency'>('solo');
  const [targetVideos, setTargetVideos] = useState(10);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/launch-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          asin: asin.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          mode,
          target_videos: targetVideos,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        onCreate(json.data);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">Launch Product on TikTok</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Product Title *</label>
          <input className={inputClass} placeholder="e.g. Ice Roller Face Massager" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Amazon ASIN</label>
            <input className={inputClass} placeholder="B09XXXXX" value={asin} onChange={e => setAsin(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Target Videos</label>
            <input className={inputClass} type="number" min={1} max={100} value={targetVideos} onChange={e => setTargetVideos(parseInt(e.target.value) || 10)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Product URL</label>
          <input className={inputClass} placeholder="https://amazon.com/dp/..." value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Launch Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('solo')}
              className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                mode === 'solo'
                  ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              Solo Creator
            </button>
            <button
              type="button"
              onClick={() => setMode('agency')}
              className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                mode === 'agency'
                  ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              Agency / Brand
            </button>
          </div>
        </div>

        <AdminButton variant="primary" onClick={handleCreate} disabled={!title.trim() || creating}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {creating ? 'Creating...' : 'Create Launch'}
        </AdminButton>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Scaling', value: 'scaling' },
  { label: 'Completed', value: 'completed' },
  { label: 'Paused', value: 'paused' },
];

export default function LaunchSyncPage() {
  const router = useRouter();
  const [launches, setLaunches] = useState<ProductLaunchWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/launch-sync?${params}`);
    const json = await res.json();
    if (json.ok) setLaunches(json.data.items);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Aggregate stats
  const totalActive = launches.filter(l => l.status === 'active' || l.status === 'scaling').length;
  const totalVideos = launches.reduce((s, l) => s + l.total_videos_posted, 0);
  const totalViews = launches.reduce((s, l) => s + l.total_views, 0);
  const totalRevenue = launches.reduce((s, l) => s + l.total_revenue, 0);

  return (
    <AdminPageLayout
      title="LaunchSync"
      subtitle="Amazon → TikTok product launches with affiliate + content tracking"
      stage="production"
      headerActions={
        <AdminButton variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> New Launch
        </AdminButton>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Launches" value={totalActive} icon={<Rocket className="w-4 h-4 text-teal-400" />} />
        <StatCard label="Videos Posted" value={totalVideos} icon={<Video className="w-4 h-4 text-blue-400" />} />
        <StatCard label="Total Views" value={totalViews.toLocaleString()} icon={<Eye className="w-4 h-4 text-violet-400" />} />
        <StatCard label="Revenue" value={`$${totalRevenue.toFixed(0)}`} icon={<DollarSign className="w-4 h-4 text-emerald-400" />} />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              statusFilter === f.value
                ? 'bg-teal-500/20 text-teal-400'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Launch list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading launches...
        </div>
      ) : launches.length === 0 ? (
        <EmptyState
          icon={<Rocket className="w-10 h-10 text-zinc-600" />}
          title="No launches yet"
          description="Take a winning Amazon product and launch it on TikTok. Generate hooks, scripts, and track everything."
          action={
            <AdminButton variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Create Your First Launch
            </AdminButton>
          }
        />
      ) : (
        <div className="space-y-2">
          {launches.map(launch => (
            <LaunchCard key={launch.id} launch={launch} />
          ))}
        </div>
      )}

      <CreateLaunchModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(data) => {
          router.push(`/admin/launch-sync/${data.id}`);
        }}
      />
    </AdminPageLayout>
  );
}
