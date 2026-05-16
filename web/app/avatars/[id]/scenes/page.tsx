'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, Plus, Check, AlertCircle } from 'lucide-react';

interface Scene { id: string; scene_tag: string; description?: string; image_url: string; motion_video_url?: string; }

const COMMON_TAGS = [
  { key: 'kitchen', label: '🥣 Kitchen' },
  { key: 'desk', label: '💻 Desk' },
  { key: 'outdoors', label: '🌤️ Outdoors' },
  { key: 'cafe', label: '☕ Cafe' },
  { key: 'studio', label: '🎬 Studio' },
  { key: 'gym', label: '💪 Gym' },
  { key: 'car', label: '🚗 Car' },
  { key: 'walking', label: '🚶 Walking' },
  { key: 'product', label: '📦 Holding product' },
  { key: 'selfie', label: '🤳 Selfie close-up' },
];

export default function ScenesPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/avatars/${id}/scenes`).then(async r => {
      const j = await r.json() as { scenes?: Scene[] };
      setScenes(j.scenes || []);
    }).finally(() => setLoading(false));
  }, [id]);

  function toggle(tag: string) {
    setSelected(s => s.includes(tag) ? s.filter(t => t !== tag) : [...s, tag]);
  }

  async function generate() {
    if (selected.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/avatars/${id}/scenes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: selected }),
      });
      const j = await r.json() as { ok: boolean; scenes?: Scene[]; error?: string };
      if (!j.ok) throw new Error(j.error || 'failed');
      setScenes(prev => [...(j.scenes || []), ...prev]);
      setSelected([]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href={`/avatars/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        <h1 className="text-xl font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-teal-400" /> Scene library</h1>
        <p className="text-xs text-zinc-400 mt-1 mb-6">Generate the SAME avatar in different lifestyle settings. Same face, same person — just different places. Used as backgrounds so videos feel like real UGC, not talking-heads.</p>

        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 mb-6">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Generate scenes</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {COMMON_TAGS.map(t => {
              const on = selected.includes(t.key);
              const have = scenes.some(s => s.scene_tag === t.key);
              return (
                <button key={t.key} onClick={() => toggle(t.key)}
                  className={`px-3 py-1.5 rounded-full text-xs ${on ? 'bg-teal-600/30 border border-teal-500 text-teal-200' : 'bg-zinc-800 border border-white/10'}`}>
                  {t.label} {have && <Check className="inline w-3 h-3 text-emerald-400 ml-1" />}
                </button>
              );
            })}
          </div>
          {err && <div className="text-xs text-red-300 flex items-start gap-1 mb-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5" />{err}</div>}
          <button onClick={generate} disabled={busy || selected.length === 0}
            className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 text-sm font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Generate {selected.length} scene{selected.length === 1 ? '' : 's'}</>}
          </button>
          <div className="text-[11px] text-zinc-500 mt-2">Each scene takes ~10-30s. Generates with Nano Banana using your avatar's prior face refs for consistency.</div>
        </div>

        {loading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-400 mx-auto" /></div>}

        {!loading && scenes.length === 0 && (
          <div className="text-center py-12 text-sm text-zinc-500">No scenes yet. Pick tags above and hit generate.</div>
        )}

        {scenes.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {scenes.map(s => (
              <div key={s.id} className="rounded-xl overflow-hidden border border-white/10 bg-zinc-900">
                <div className="aspect-[3/4] bg-zinc-800">
                  <img src={s.image_url} alt={s.scene_tag} className="w-full h-full object-cover" />
                </div>
                <div className="p-2">
                  <div className="text-[10px] uppercase tracking-wider text-teal-300 font-semibold">{s.scene_tag}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
