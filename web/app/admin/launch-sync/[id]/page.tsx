'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import {
  Rocket, Zap, Users, Video, Eye, DollarSign, Plus, Copy, Play, Pause,
  ChevronLeft, Loader2, ExternalLink, RefreshCw, X, Check, Package,
  ArrowRight, Trophy, AlertTriangle, Sparkles, User, Hash, TrendingUp,
} from 'lucide-react';
import type {
  ProductLaunch, LaunchAffiliate, LaunchContent, LaunchStatus,
  LaunchContentStatus, HookSeed, ScriptSeed,
} from '@/lib/launch-sync/types';
import {
  LAUNCH_STATUS_LABELS, LAUNCH_STATUS_COLORS,
  CONTENT_STATUS_LABELS, CONTENT_STATUS_COLORS,
} from '@/lib/launch-sync/types';

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status, colors, labels }: {
  status: string;
  colors: Record<string, { bg: string; text: string; dot: string }>;
  labels: Record<string, string>;
}) {
  const c = colors[status] || colors['draft'] || { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {labels[status] || status}
    </span>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-1 text-zinc-500">{icon}<span className="text-[10px] uppercase font-medium">{label}</span></div>
      <p className="text-lg font-bold text-zinc-100">{value}</p>
    </div>
  );
}

// ─── What To Do Next ─────────────────────────────────────────────────────────

function NextActions({ launch, content, affiliates }: {
  launch: ProductLaunch;
  content: LaunchContent[];
  affiliates: LaunchAffiliate[];
}) {
  const actions: { text: string; priority: 'high' | 'medium' | 'low'; icon: React.ReactNode }[] = [];

  if (launch.status === 'draft' && !launch.hooks?.length) {
    actions.push({ text: 'Generate hooks & scripts with AI', priority: 'high', icon: <Sparkles className="w-3.5 h-3.5" /> });
  }
  if (launch.status === 'ready') {
    actions.push({ text: 'Set status to Active to start posting', priority: 'high', icon: <Play className="w-3.5 h-3.5" /> });
  }
  if (content.filter(c => c.status === 'script_ready').length > 0) {
    actions.push({ text: `${content.filter(c => c.status === 'script_ready').length} scripts ready — start recording`, priority: 'high', icon: <Video className="w-3.5 h-3.5" /> });
  }
  if (launch.mode === 'agency' && affiliates.length === 0) {
    actions.push({ text: 'Add affiliates to distribute content', priority: 'medium', icon: <Users className="w-3.5 h-3.5" /> });
  }
  const posted = content.filter(c => c.status === 'posted' || c.status === 'performing');
  if (posted.length > 0 && posted.length < launch.target_videos) {
    actions.push({ text: `Post ${launch.target_videos - posted.length} more videos to hit target`, priority: 'medium', icon: <ArrowRight className="w-3.5 h-3.5" /> });
  }
  const winners = content.filter(c => c.is_winner);
  if (winners.length > 0) {
    actions.push({ text: `${winners.length} winner(s) found — consider scaling`, priority: 'low', icon: <Trophy className="w-3.5 h-3.5" /> });
  }

  if (actions.length === 0) return null;

  const priorityColors = { high: 'border-teal-500/30 bg-teal-500/5', medium: 'border-zinc-700 bg-zinc-800/50', low: 'border-zinc-700/50 bg-zinc-900' };

  return (
    <AdminCard accent="teal">
      <h3 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-teal-400" /> What To Do Next
      </h3>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${priorityColors[a.priority]}`}>
            <span className="text-teal-400">{a.icon}</span>
            <span className="text-xs text-zinc-300">{a.text}</span>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

// ─── Hooks & Scripts Panel ───────────────────────────────────────────────────

function HooksPanel({ hooks, scripts }: { hooks: HookSeed[]; scripts: ScriptSeed[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<'hooks' | 'scripts'>('hooks');

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <AdminCard>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setTab('hooks')} className={`text-xs font-medium px-2.5 py-1 rounded-lg ${tab === 'hooks' ? 'bg-teal-500/20 text-teal-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Hooks ({hooks.length})
        </button>
        <button onClick={() => setTab('scripts')} className={`text-xs font-medium px-2.5 py-1 rounded-lg ${tab === 'scripts' ? 'bg-violet-500/20 text-violet-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Scripts ({scripts.length})
        </button>
      </div>

      {tab === 'hooks' && (
        <div className="space-y-2">
          {hooks.map((h, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 bg-zinc-800/50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-zinc-200 mb-1">"{h.text}"</p>
                <div className="flex gap-2">
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{h.angle}</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{h.style}</span>
                </div>
              </div>
              <button onClick={() => copyText(h.text, i)} className="p-1 text-zinc-600 hover:text-teal-400">
                {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
          {hooks.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">No hooks generated yet</p>}
        </div>
      )}

      {tab === 'scripts' && (
        <div className="space-y-3">
          {scripts.map((s, i) => (
            <div key={i} className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-zinc-200">{s.title}</h4>
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{s.tone}</span>
              </div>
              <p className="text-xs text-teal-400 mb-1">Hook: {s.hook}</p>
              <p className="text-xs text-zinc-400 mb-1">{s.body}</p>
              <p className="text-xs text-amber-400">CTA: {s.cta}</p>
              <button
                onClick={() => copyText(`${s.hook}\n\n${s.body}\n\n${s.cta}`, 100 + i)}
                className="mt-2 text-[10px] text-zinc-500 hover:text-teal-400 flex items-center gap-1"
              >
                {copiedIdx === 100 + i ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                {copiedIdx === 100 + i ? 'Copied' : 'Copy script'}
              </button>
            </div>
          ))}
          {scripts.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">No scripts generated yet</p>}
        </div>
      )}
    </AdminCard>
  );
}

// ─── Content Board ───────────────────────────────────────────────────────────

type LaunchContentEnriched = LaunchContent & { affiliate_name?: string | null; affiliate_handle?: string | null };

function ContentBoard({ content, onStatusChange }: {
  content: LaunchContentEnriched[];
  onStatusChange: (id: string, status: string) => void;
}) {
  const stages: LaunchContentStatus[] = ['idea', 'script_ready', 'assigned', 'recording', 'recorded', 'editing', 'ready_to_post', 'posted', 'performing', 'winner'];

  return (
    <AdminCard>
      <h3 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
        <Video className="w-4 h-4 text-blue-400" /> Content Tracker
      </h3>

      {content.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-6">Generate scripts to populate the content tracker</p>
      ) : (
        <div className="space-y-1.5">
          {content.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/50 rounded-lg group">
              <StatusBadge status={c.status} colors={CONTENT_STATUS_COLORS} labels={CONTENT_STATUS_LABELS} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{c.title || c.hook_text || 'Untitled'}</p>
                {c.affiliate_name && (
                  <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                    <User className="w-2.5 h-2.5" /> {c.affiliate_name}
                  </p>
                )}
              </div>
              {c.views > 0 && (
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {c.views.toLocaleString()}
                </span>
              )}
              {c.is_winner && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}

              {/* Quick status advance */}
              {c.status !== 'posted' && c.status !== 'winner' && c.status !== 'performing' && (
                <select
                  value={c.status}
                  onChange={e => onStatusChange(c.id, e.target.value)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-zinc-700 border border-zinc-600 text-zinc-300 rounded px-1.5 py-0.5"
                >
                  {stages.map(s => (
                    <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminCard>
  );
}

// ─── Affiliate Panel ─────────────────────────────────────────────────────────

function AffiliatePanel({ affiliates, launchId, onAdded }: {
  affiliates: LaunchAffiliate[];
  launchId: string;
  onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch(`/api/launch-sync/${launchId}/affiliates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tiktok_handle: handle || undefined, email: email || undefined }),
    });
    setSaving(false);
    setAdding(false);
    setName('');
    setHandle('');
    setEmail('');
    onAdded();
  };

  const inputClass = 'w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50';

  return (
    <AdminCard>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-400" /> Affiliates ({affiliates.length})
        </h3>
        <button onClick={() => setAdding(!adding)} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-3 bg-zinc-800/50 rounded-lg space-y-2">
          <input className={inputClass} placeholder="Name *" value={name} onChange={e => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="@tiktok_handle" value={handle} onChange={e => setHandle(e.target.value)} />
            <input className={inputClass} placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <AdminButton variant="primary" size="sm" onClick={handleAdd} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add Affiliate
          </AdminButton>
        </div>
      )}

      {affiliates.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">No affiliates yet</p>
      ) : (
        <div className="space-y-1.5">
          {affiliates.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/50 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
                {a.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{a.name}</p>
                {a.tiktok_handle && <p className="text-[10px] text-zinc-500">@{a.tiktok_handle}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-400">{a.videos_posted} posted</p>
                {a.total_views > 0 && <p className="text-[10px] text-zinc-500">{a.total_views.toLocaleString()} views</p>}
              </div>
              {a.invite_code && (
                <button
                  onClick={() => navigator.clipboard.writeText(a.invite_code!)}
                  className="text-zinc-600 hover:text-teal-400"
                  title={`Invite code: ${a.invite_code}`}
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminCard>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LaunchWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const launchId = params.id as string;

  const [launch, setLaunch] = useState<ProductLaunch | null>(null);
  const [content, setContent] = useState<LaunchContentEnriched[]>([]);
  const [affiliates, setAffiliates] = useState<LaunchAffiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/launch-sync/${launchId}`);
    const json = await res.json();
    if (json.ok) {
      setLaunch(json.data);
      setContent(json.data.content || []);
      setAffiliates(json.data.affiliates || []);
    }
    setLoading(false);
  }, [launchId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    await fetch(`/api/launch-sync/${launchId}/generate`, { method: 'POST' });
    await load();
    setGenerating(false);
  };

  const handleStatusChange = async (status: LaunchStatus) => {
    await fetch(`/api/launch-sync/${launchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  const handleContentStatusChange = async (contentId: string, status: string) => {
    // Update via direct Supabase call through API
    await fetch(`/api/launch-sync/${launchId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _update_id: contentId, status }),
    });
    // Optimistic update
    setContent(prev => prev.map(c => c.id === contentId ? { ...c, status: status as any } : c));
  };

  if (loading) {
    return (
      <AdminPageLayout title="Loading..." subtitle="">
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading launch...
        </div>
      </AdminPageLayout>
    );
  }

  if (!launch) {
    return (
      <AdminPageLayout title="Launch not found" subtitle="">
        <AdminButton variant="secondary" onClick={() => router.push('/admin/launch-sync')}>
          <ChevronLeft className="w-4 h-4" /> Back to launches
        </AdminButton>
      </AdminPageLayout>
    );
  }

  const statusActions: { label: string; value: LaunchStatus; icon: React.ReactNode }[] = [
    { label: 'Draft', value: 'draft', icon: <Package className="w-3 h-3" /> },
    { label: 'Active', value: 'active', icon: <Play className="w-3 h-3" /> },
    { label: 'Scaling', value: 'scaling', icon: <TrendingUp className="w-3 h-3" /> },
    { label: 'Paused', value: 'paused', icon: <Pause className="w-3 h-3" /> },
    { label: 'Completed', value: 'completed', icon: <Check className="w-3 h-3" /> },
  ];

  return (
    <AdminPageLayout
      title={launch.title}
      subtitle={launch.asin ? `ASIN: ${launch.asin}` : launch.source_url ? 'Amazon Product' : 'Product Launch'}
      stage="production"
      breadcrumbs={[
        { label: 'LaunchSync', href: '/admin/launch-sync' },
        { label: launch.title },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          {/* Status quick-change */}
          <select
            value={launch.status}
            onChange={e => handleStatusChange(e.target.value as LaunchStatus)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2.5 py-1.5"
          >
            {statusActions.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Generate button */}
          <AdminButton
            variant="primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating...' : launch.hooks?.length ? 'Regenerate' : 'Generate Content'}
          </AdminButton>
        </div>
      }
    >
      {/* Product header card */}
      <AdminCard>
        <div className="flex items-start gap-4">
          {launch.image_url && (
            <img src={launch.image_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={launch.status} colors={LAUNCH_STATUS_COLORS} labels={LAUNCH_STATUS_LABELS} />
              <span className="text-[10px] text-zinc-500 uppercase font-medium bg-zinc-800 px-1.5 py-0.5 rounded">
                {launch.mode}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
              {launch.source_url && (
                <a href={launch.source_url} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-teal-400">
                  <ExternalLink className="w-3 h-3" /> Amazon
                </a>
              )}
              {launch.tiktok_url && (
                <a href={launch.tiktok_url} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-teal-400">
                  <ExternalLink className="w-3 h-3" /> TikTok Shop
                </a>
              )}
              {launch.cost_per_unit && launch.selling_price && (
                <span className="text-emerald-400">
                  Margin: ${(launch.selling_price - launch.cost_per_unit).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </AdminCard>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <StatBox label="Videos" value={`${launch.total_videos_posted}/${launch.target_videos}`} icon={<Video className="w-3 h-3" />} />
        <StatBox label="Views" value={launch.total_views.toLocaleString()} icon={<Eye className="w-3 h-3" />} />
        <StatBox label="Orders" value={launch.total_orders} icon={<Package className="w-3 h-3" />} />
        <StatBox label="Revenue" value={`$${launch.total_revenue.toFixed(0)}`} icon={<DollarSign className="w-3 h-3" />} />
        <StatBox label="Best Video" value={launch.best_video_views.toLocaleString()} icon={<Trophy className="w-3 h-3" />} />
      </div>

      {/* What to do next */}
      <div className="mb-4">
        <NextActions launch={launch} content={content} affiliates={affiliates} />
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Content tracker (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <ContentBoard content={content} onStatusChange={handleContentStatusChange} />

          {/* Creator Brief */}
          {launch.creator_brief && (
            <AdminCard>
              <h3 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4 text-amber-400" /> Creator Brief
              </h3>
              <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{launch.creator_brief}</p>
              <button
                onClick={() => navigator.clipboard.writeText(launch.creator_brief!)}
                className="mt-2 text-[10px] text-zinc-500 hover:text-teal-400 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy brief
              </button>
            </AdminCard>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <HooksPanel hooks={launch.hooks || []} scripts={launch.scripts || []} />
          {launch.mode === 'agency' && (
            <AffiliatePanel affiliates={affiliates} launchId={launchId} onAdded={load} />
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}
