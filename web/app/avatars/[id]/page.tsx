'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, FileText, Calendar, Play, Loader2, User, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';

interface Avatar {
  id: string; name: string; avatar_display_name?: string; niche?: string;
  personality?: string; target_audience?: string;
  avatar_visual_reference_url?: string; heygen_custom_avatar_id?: string;
  voice_clone_id?: string; test_render_url?: string; setup_status?: string;
}
interface Script {
  id: string; script_type: string; hook?: string; status: string;
  render_video_url?: string; created_at: string;
}
interface Campaign {
  id: string; name: string; product_name?: string; goal?: string;
  duration_days?: number; status: string; created_at: string;
}

export default function AvatarDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function regenerateVisual() {
    if (!id) return;
    setRegenerating(true);
    try {
      const r = await fetch(`/api/avatars/${id}/visual/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json() as { ok: boolean; visual_url?: string; error?: string };
      if (!j.ok) throw new Error(j.error || 'regenerate failed');
      // Refresh avatar
      const r2 = await fetch(`/api/avatars/${id}`);
      const j2 = await r2.json() as { ok: boolean; avatar?: Avatar };
      if (j2.ok) setAvatar(j2.avatar || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('Regenerate failed: ' + msg);
    } finally {
      setRegenerating(false);
    }
  }

  async function deleteAvatar() {
    if (!id) return;
    if (!confirm(`Delete avatar "${avatar?.avatar_display_name || avatar?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      }
      router.push('/avatars');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('Delete failed: ' + msg);
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    fetch(`/api/avatars/${id}`).then(async r => {
      const j = await r.json() as { ok: boolean; avatar?: Avatar; scripts?: Script[]; campaigns?: Campaign[] };
      if (j.ok) {
        setAvatar(j.avatar || null);
        setScripts(j.scripts || []);
        setCampaigns(j.campaigns || []);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>;
  if (!avatar) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Avatar not found.</div>;

  const setupComplete = !!avatar.avatar_visual_reference_url; // loosened: photo only for script gen

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> All avatars
        </Link>

        <div className="rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden flex flex-col sm:flex-row">
          <div className="sm:w-48 aspect-[3/4] bg-zinc-800 flex-shrink-0">
            {avatar.avatar_visual_reference_url ? (
              <img src={avatar.avatar_visual_reference_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700"><User className="w-20 h-20" /></div>
            )}
          </div>
          <div className="flex-1 p-5">
            <h1 className="text-2xl font-bold">{avatar.avatar_display_name || avatar.name}</h1>
            <div className="text-sm text-zinc-400 mt-0.5">{avatar.niche}</div>
            {avatar.target_audience && <div className="text-xs text-zinc-500 mt-2">{avatar.target_audience}</div>}
            {!setupComplete && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-semibold">
                <AlertCircle className="w-3.5 h-3.5" /> Drop a face to start filming
              </div>
            )}
            {avatar.test_render_url && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
                <Play className="w-3.5 h-3.5" /> <a href={avatar.test_render_url} target="_blank" rel="noreferrer" className="underline">Watch test clip</a>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <Link href={`/avatars/${id}/scripts/new`} className="px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Write scripts</Link>
              <Link href={`/avatars/${id}/scenes`} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold flex items-center gap-1.5 border border-white/10"><span>🎬</span> Storyboard</Link>
              <Link href={`/avatars/${id}/campaigns/new`} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold flex items-center gap-1.5 border border-white/10"><Calendar className="w-4 h-4" /> Plan a series</Link>
              <Link href={`/studio/oneprompt?avatar=${id}`} className="px-3 py-2 rounded-lg bg-purple-600/30 border border-purple-500 hover:bg-purple-600/40 text-sm font-semibold flex items-center gap-1.5 text-purple-100">⚡ Quick video</Link>
              <button
                onClick={regenerateVisual}
                disabled={regenerating}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-sm font-semibold flex items-center gap-1.5 border border-white/10"
                title="Generate a new AI visual using this avatar's reference photo"
              >
                {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate visual
              </button>
              <button
                onClick={deleteAvatar}
                disabled={deleting}
                className="px-3 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 text-sm font-semibold flex items-center gap-1.5 border border-red-500/30 text-red-300 ml-auto"
                title="Delete this avatar permanently"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <Section title="Recent scripts" icon={FileText} link={`/avatars/${id}/scripts/new`} linkText="+ Write">
            {scripts.length === 0 && <Empty>No scripts yet — write some.</Empty>}
            {scripts.slice(0, 8).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase text-zinc-500">{s.script_type}</div>
                  <div className="text-sm truncate">{s.hook || '(no hook)'}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{s.status}</span>
                  {s.render_video_url && <a href={s.render_video_url} target="_blank" rel="noreferrer" className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">▶</a>}
                </div>
              </div>
            ))}
          </Section>

          <Section title="Campaigns" icon={Calendar} link={`/avatars/${id}/campaigns/new`} linkText="+ Plan">
            {campaigns.length === 0 && <Empty>No series yet. Plan a 7/14/30-day run.</Empty>}
            {campaigns.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10">
                <div className="min-w-0">
                  <div className="text-sm truncate">{c.name}</div>
                  <div className="text-[11px] text-zinc-500">{c.duration_days}d · {c.goal} · {c.status}</div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, link, linkText, children }: { title: string; icon: typeof Sparkles; link: string; linkText: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Icon className="w-4 h-4 text-zinc-400" /> {title}</h3>
        <Link href={link} className="text-[11px] text-teal-400 hover:text-teal-300">{linkText}</Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-zinc-500 text-center py-4">{children}</div>;
}
