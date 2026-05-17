'use client';

/**
 * BrandPickerModal — inline brand profile picker + creator.
 *
 * Replaces the old "Create one →" link that punted users to /admin/brand-profiles.
 * Opens a modal so users stay in /create flow.
 */

import { useEffect, useState } from 'react';
import { Plus, Loader2, X, Check, AlertCircle } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  tone_descriptor?: string | null;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function BrandPickerModal({ selectedId, onSelect }: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // New brand draft fields
  const [name, setName] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [prohibited, setProhibited] = useState('');

  useEffect(() => {
    fetch('/api/create/brand-profiles', { cache: 'no-store' })
      .then(async r => {
        const j = await r.json() as { ok?: boolean; profiles?: Brand[] };
        setBrands(j.profiles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createBrand() {
    if (!name.trim()) { setErr('Pick a name'); return; }
    setCreating(true); setErr(null);
    try {
      const r = await fetch('/api/create/brand-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tone_descriptor: tone || null,
          style_notes: audience || null,
          prohibited_phrases: prohibited || null,
        }),
      });
      const j = await r.json() as { ok: boolean; id?: string; error?: string };
      if (!j.ok || !j.id) throw new Error(j.error || 'create failed');
      // Re-fetch list and auto-select the new one
      const list = await fetch('/api/create/brand-profiles', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
      setBrands(list?.profiles || []);
      onSelect(j.id);
      // Reset draft
      setName(''); setTone(''); setAudience(''); setProhibited('');
      setOpen(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  const selected = brands.find(b => b.id === selectedId);

  return (
    <>
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
        {loading ? (
          <div className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading brands…</div>
        ) : brands.length === 0 ? (
          <div className="text-xs text-zinc-300">No brands yet — every clip will use your account defaults.</div>
        ) : (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Use brand voice</label>
            <select
              value={selectedId || ''}
              onChange={e => onSelect(e.target.value || null)}
              className="w-full px-2 py-1.5 rounded-md bg-zinc-800 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none"
            >
              <option value="">Default account voice</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {selected?.tone_descriptor && (
              <div className="text-[11px] text-zinc-400 mt-1.5 truncate">Tone: {selected.tone_descriptor}</div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full px-3 py-1.5 rounded-md text-xs font-medium text-teal-300 hover:text-teal-200 hover:bg-teal-500/10 border border-teal-500/30 flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3" /> New brand voice
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold">New brand voice</div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Locks the voice across every clip for this brand. You can edit later from your account.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Brand name</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. CalmEase Supplements"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">How they sound</label>
                <input
                  type="text" value={tone} onChange={e => setTone(e.target.value)}
                  placeholder="Plain talk, friend-to-friend. Soft, never salesy."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Audience</label>
                <input
                  type="text" value={audience} onChange={e => setAudience(e.target.value)}
                  placeholder="Moms 28-42 buying clean-ingredient supplements"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Things they NEVER say</label>
                <textarea
                  value={prohibited} onChange={e => setProhibited(e.target.value)} rows={2}
                  placeholder="cures, treats, prevents, guaranteed"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none resize-none"
                />
              </div>

              {err && <div className="text-xs text-red-300 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5" />{err}</div>}

              <button
                onClick={createBrand}
                disabled={creating || !name.trim()}
                className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold flex items-center justify-center gap-1.5"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save brand voice</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
