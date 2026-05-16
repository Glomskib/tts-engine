'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Loader2, AlertCircle, Check } from 'lucide-react';

export default function CampaignBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [brief, setBrief] = useState('');
  const [goal, setGoal] = useState<'awareness'|'sales'|'launch'>('awareness');
  const [duration, setDuration] = useState<7|14|30>(30);
  const [busy, setBusy] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [structure, setStructure] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/avatars/${id}/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, product_name: product, product_brief: brief, goal, duration_days: duration }),
      });
      const j = await r.json() as { ok: boolean; campaign_id?: string; structure?: unknown; error?: string };
      if (!j.ok) throw new Error(j.error || 'gen failed');
      setCampaignId(j.campaign_id || null);
      setStructure(j.structure || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'gen failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/avatars/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        <h1 className="text-xl font-bold flex items-center gap-2 mb-1"><Calendar className="w-5 h-5 text-teal-400" /> Build a campaign</h1>
        <p className="text-xs text-zinc-400 mb-5">7, 14, or 30 days of structured content. Awareness → education → objection → conversion. Platform-agnostic.</p>

        <div className="space-y-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name (optional)" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none" />
          <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product / topic" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none" />
          <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2} placeholder="Brief — key benefit, audience, angles to hit" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Goal</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['awareness','sales','launch'] as const).map(g => (
                  <button key={g} onClick={() => setGoal(g)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${goal === g ? 'bg-teal-600/30 border border-teal-500 text-teal-200' : 'bg-zinc-900 border border-white/10'}`}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Duration</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([7,14,30] as const).map(d => (
                  <button key={d} onClick={() => setDuration(d)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${duration === d ? 'bg-teal-600/30 border border-teal-500 text-teal-200' : 'bg-zinc-900 border border-white/10'}`}>{d}d</button>
                ))}
              </div>
            </div>
          </div>

          {err && <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{err}</div>}

          <button onClick={generate} disabled={busy || !product.trim()} className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4" /> Build {duration}-day plan</>}
          </button>
        </div>

        {structure ? (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-emerald-300 text-sm mb-3"><Check className="w-4 h-4" /> Campaign saved.</div>
            <pre className="rounded-xl bg-zinc-900 border border-white/10 p-4 text-[11px] text-zinc-300 overflow-auto max-h-[60vh]">{JSON.stringify(structure, null, 2)}</pre>
            <button onClick={() => router.push(`/avatars/${id}`)} className="w-full mt-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back to avatar</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
