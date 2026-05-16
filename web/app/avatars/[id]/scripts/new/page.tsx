'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';

const SCRIPT_TYPES = [
  { key: '15s', label: '15-second' },
  { key: '30s', label: '30-second' },
  { key: '60s', label: '60-second' },
  { key: 'educational', label: 'Educational' },
  { key: 'testimonial', label: 'Testimonial' },
  { key: 'founder', label: 'Founder-style' },
  { key: 'objection', label: 'Objection-handler' },
  { key: 'comparison', label: 'Comparison' },
  { key: 'social-proof', label: 'Social proof' },
  { key: 'pain-point', label: 'Pain-point' },
  { key: 'ad-creative', label: 'Ad creative' },
  { key: 'comment-reply', label: 'Comment reply' },
];

interface OutScript {
  id: string; script_type: string; hook?: string; body?: string; cta?: string;
  captions?: string; hashtags?: string;
}

export default function ScriptGenPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [product, setProduct] = useState('');
  const [brief, setBrief] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({ '15s': 3, '30s': 3 });
  const [busy, setBusy] = useState(false);
  const [scripts, setScripts] = useState<OutScript[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  async function generate() {
    setBusy(true); setErr(null); setScripts([]);
    try {
      const types = Object.entries(counts).filter(([_, c]) => c > 0).map(([kind, count]) => ({ kind, count }));
      const r = await fetch(`/api/avatars/${id}/scripts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_name: product, product_brief: brief, types }),
      });
      const j = await r.json() as { ok: boolean; scripts?: OutScript[]; error?: string };
      if (!j.ok || !j.scripts) throw new Error(j.error || 'generation failed');
      setScripts(j.scripts);
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

        <h1 className="text-xl font-bold flex items-center gap-2 mb-1"><Sparkles className="w-5 h-5 text-teal-400" /> Generate scripts</h1>
        <p className="text-xs text-zinc-400 mb-5">All scripts come back in this avatar's locked voice. Compliance phrases are auto-respected.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Product / topic</label>
            <input type="text" value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. CalmEase magnesium gummies"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Brief (optional)</label>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} placeholder="What angle? Key benefit? Target objection?"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">How many of each?</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SCRIPT_TYPES.map(t => (
                <div key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10">
                  <span className="text-xs flex-1">{t.label}</span>
                  <input type="number" min={0} max={20} value={counts[t.key] || 0}
                    onChange={e => setCounts(c => ({ ...c, [t.key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))}
                    className="w-12 px-2 py-1 rounded bg-zinc-800 text-sm text-center" />
                </div>
              ))}
            </div>
            <div className="text-[11px] text-zinc-500 mt-2">Total: {total} scripts · Max 50 per batch.</div>
          </div>

          {err && <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{err}</div>}

          <button onClick={generate} disabled={busy || !product.trim() || total === 0}
            className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Generate {total > 0 ? total : ''} scripts</>}
          </button>
        </div>

        {scripts.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 text-sm"><Check className="w-4 h-4" /> {scripts.length} scripts saved to your library.</div>
            {scripts.map(s => (
              <div key={s.id} className="rounded-xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-teal-300 font-semibold">{s.script_type}</div>
                </div>
                {s.hook && <div className="text-sm font-semibold mb-2">"{s.hook}"</div>}
                {s.body && <div className="text-sm text-zinc-300 whitespace-pre-wrap mb-2">{s.body}</div>}
                {s.cta && <div className="text-xs text-zinc-400 italic">CTA: {s.cta}</div>}
                {s.hashtags && <div className="text-[11px] text-zinc-500 mt-2 truncate">{s.hashtags}</div>}
              </div>
            ))}
            <button onClick={() => router.push(`/avatars/${id}`)} className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back to avatar</button>
          </div>
        )}
      </div>
    </div>
  );
}
