'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, User, Loader2, Sparkles, Mic, Camera as CameraIcon, Check, AlertCircle, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

interface Avatar {
  id: string;
  name: string;
  avatar_display_name?: string;
  niche?: string;
  personality?: string;
  target_audience?: string;
  avatar_visual_reference_url?: string;
  heygen_custom_avatar_id?: string;
  voice_clone_id?: string;
  setup_status?: string;
  test_render_url?: string;
  updated_at: string;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [authErr, setAuthErr] = useState(false);
  // Surface API failures so this page stops silently showing an empty state
  // when something's broken (incident 2026-05-27 — "Avatar — Nothing in this
  // ever seems to work right or load").
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function deleteAvatar(id: string, name: string) {
    if (!confirm(`Delete avatar "${name}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      }
      // Refresh list
      window.location.reload();
    } catch (e) {
      alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function loadAvatars() {
    setFetchError(null);
    setRefreshing(true);
    try {
      const r = await fetch('/api/avatars', { cache: 'no-store' });
      if (r.status === 401) {
        setAuthErr(true);
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = (j as { error?: string }).error || `Server returned ${r.status}`;
        setFetchError(msg);
        return;
      }
      const j = await r.json() as { avatars?: Avatar[]; ok?: boolean; error?: string };
      if (j.error) {
        setFetchError(j.error);
        return;
      }
      setAvatars(j.avatars || []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Network error — check your connection');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAvatars();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-teal-400" /> Your AI Cast
            </h1>
            <p className="text-sm text-zinc-300 mt-1">
              Your AI talent. Same face every video. Drop in, hit record.
            </p>
          </div>
          <Link
            href="/avatars/new"
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New avatar
          </Link>
        </div>

        {authErr && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center">
            <div className="text-sm text-zinc-200 mb-3">Sign in to see your avatars.</div>
            <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold">Sign in</Link>
          </div>
        )}

        {!authErr && loading && (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-teal-400" /></div>
        )}

        {!authErr && !loading && fetchError && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-100 mb-1">
                  Couldn&apos;t load your avatars
                </div>
                <div className="text-xs text-amber-200/80 mb-3 break-words font-mono">
                  {fetchError}
                </div>
                <div className="text-[11px] text-amber-200/70 mb-3">
                  Common causes: render worker offline, brand_profiles table missing,
                  or your session expired. If this keeps happening, copy the message
                  above and ping support.
                </div>
                <button
                  onClick={loadAvatars}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-900 text-xs font-semibold"
                >
                  {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {!authErr && !loading && !fetchError && avatars.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-900/40 p-10 text-center">
            <User className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
            <div className="text-base font-semibold text-white mb-1">No avatars yet</div>
            <div className="text-sm text-zinc-300 mb-5 max-w-md mx-auto">
              Your first avatar is the brand's AI spokesperson. Same face, same voice, same personality across every video.
            </div>
            <Link href="/avatars/new" className="inline-block px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm">
              Create your first avatar
            </Link>
          </div>
        )}

        {avatars.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {avatars.map(a => <AvatarCard key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarCard({ a }: { a: Avatar }) {
  const setupComplete = a.heygen_custom_avatar_id && a.voice_clone_id && a.test_render_url;
  return (
    <Link
      href={`/avatars/${a.id}`}
      className="block rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 transition-colors overflow-hidden"
    >
      <div className="aspect-[3/4] bg-zinc-800 relative">
        {a.avatar_visual_reference_url ? (
          <img src={a.avatar_visual_reference_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500">
            <User className="w-16 h-16" />
          </div>
        )}
        {!setupComplete && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400 text-amber-100 text-[10px] font-semibold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Photo needed
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-white truncate">{a.avatar_display_name || a.name}</div>
        <div className="text-[11px] text-zinc-300 truncate mt-0.5">{a.niche || a.personality || 'No niche set'}</div>
        <div className="flex items-center gap-2 mt-2 text-[10px]">
          <span className={`flex items-center gap-1 ${a.heygen_custom_avatar_id ? 'text-teal-300' : 'text-zinc-400'}`}>
            <CameraIcon className="w-3 h-3" /> {a.heygen_custom_avatar_id ? 'Face' : 'no photo'}
          </span>
          <span className={`flex items-center gap-1 ${a.voice_clone_id ? 'text-teal-300' : 'text-zinc-400'}`}>
            <Mic className="w-3 h-3" /> {a.voice_clone_id ? 'Voice' : 'voice unset'}
          </span>
          <span className={`flex items-center gap-1 ${a.test_render_url ? 'text-emerald-300' : 'text-zinc-400'}`}>
            <Check className="w-3 h-3" /> {a.test_render_url ? 'Tested' : 'not filmed yet'}
          </span>
        </div>
      </div>
    </Link>
  );
}
