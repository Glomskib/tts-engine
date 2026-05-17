'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, AlertCircle, Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';

const QUICK_LENGTHS = [
  { key: '15s', label: '15 sec', hint: 'Hook-driven, tight cuts' },
  { key: '30s', label: '30 sec', hint: 'Most-shared sweet spot' },
  { key: '60s', label: '60 sec', hint: 'Story or full explainer' },
] as const;

const ADVANCED_TYPES = [
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
  const [length, setLength] = useState<'15s' | '30s' | '60s'>('30s');
  const [count, setCount] = useState(3);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedCounts, setAdvancedCounts] = useState<Record<string, number>>({});

  const [busy, setBusy] = useState(false);
  const [scripts, setScripts] = useState<OutScript[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const advTotal = Object.values(advancedCounts).reduce((a, b) => a + b, 0);
  const useAdvanced = advancedOpen && advTotal > 0;
  const planned = useAdvanced ? advTotal : count;

  async function generate() {
    if (!product.trim()) { setErr('Tell us what the video is about first.'); return; }
    setBusy(true); setErr(null); setScripts([]);
    try {
      const types = useAdvanced
        ? Object.entries(advancedCounts).filter(([, c]) => c > 0).map(([kind, count]) => ({ kind, count }))
        : [{ kind: length, count }];
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

  function copyScript(s: OutScript) {
    const parts = [
      s.hook ? `HOOK: ${s.hook}` : '',
      s.body || '',
      s.cta ? `CTA: ${s.cta}` : '',
      s.hashtags ? `\n${s.hashtags}` : '',
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join('\n\n')).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/avatars/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
          <Sparkles className="w-6 h-6 text-teal-400" /> Write me a script
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          AI writes in this avatar&apos;s locked voice, niche, and tone. Compliance phrases auto-respected.
        </p>

        {scripts.length === 0 && (
          <div className="space-y-5">
            {/* Topic */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">What&apos;s the video about?</label>
              <input
                type="text" value={product} onChange={e => setProduct(e.target.value)}
                placeholder="e.g. CalmEase magnesium gummies for sleep"
                className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-base focus:border-teal-500 outline-none"
                autoFocus
              />
            </div>

            {/* Brief (optional) */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Angle or key benefit <span className="text-zinc-600 normal-case">(optional)</span></label>
              <textarea
                value={brief} onChange={e => setBrief(e.target.value)} rows={2}
                placeholder="Plain-language angle. 'It's the only one that doesn't taste chalky.' Or skip — we'll pick."
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
              />
            </div>

            {/* Length picker — visual cards */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Length</label>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_LENGTHS.map(l => {
                  const on = length === l.key;
                  return (
                    <button
                      key={l.key} type="button"
                      onClick={() => setLength(l.key)}
                      className={`p-3 rounded-xl border text-left transition-colors ${on ? 'bg-teal-500/20 border-teal-400' : 'bg-zinc-900 border-white/10 hover:border-zinc-600'}`}
                    >
                      <div className="text-sm font-semibold">{l.label}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{l.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Count slider */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">How many to write?</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={1} max={10} value={count}
                  onChange={e => setCount(Number(e.target.value))}
                  className="flex-1 accent-teal-500"
                />
                <div className="text-2xl font-bold text-teal-300 w-10 text-center">{count}</div>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Try 3 — pick the best, ditch the rest.</div>
            </div>

            {/* Advanced (collapsed by default) */}
            <div className="border border-white/5 rounded-xl">
              <button
                type="button"
                onClick={() => setAdvancedOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-white"
              >
                <span>Mix script types (advanced)</span>
                {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  <div className="text-[11px] text-zinc-500 mb-2">Set counts for any mix of formats. Overrides the simple length picker above.</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ADVANCED_TYPES.map(t => (
                      <div key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10">
                        <span className="text-xs flex-1">{t.label}</span>
                        <input
                          type="number" min={0} max={20} value={advancedCounts[t.key] || 0}
                          onChange={e => setAdvancedCounts(c => ({ ...c, [t.key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))}
                          className="w-12 px-2 py-1 rounded bg-zinc-800 text-sm text-center"
                        />
                      </div>
                    ))}
                  </div>
                  {advTotal > 0 && (
                    <div className="text-[11px] text-teal-300 mt-2">Advanced mix active — will write {advTotal} scripts.</div>
                  )}
                </div>
              )}
            </div>

            {err && (
              <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />{err}
              </div>
            )}

            <button
              onClick={generate} disabled={busy || !product.trim() || planned === 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:opacity-90 disabled:opacity-50 font-bold flex items-center justify-center gap-2 text-base"
            >
              {busy
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Writing {planned} scripts…</>
                : <><Sparkles className="w-5 h-5" /> Write me {planned} script{planned === 1 ? '' : 's'}</>
              }
            </button>
            <div className="text-center text-[11px] text-zinc-500">Free to retry. We&apos;ll save everything to your library.</div>
          </div>
        )}

        {/* Results */}
        {scripts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 text-sm">
                <Check className="w-4 h-4" /> {scripts.length} scripts written, saved to your library.
              </div>
              <button onClick={() => setScripts([])} className="text-xs text-zinc-400 hover:text-white underline">
                Write more
              </button>
            </div>
            {scripts.map(s => (
              <div key={s.id} className="rounded-xl border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-teal-300 font-semibold">{s.script_type}</div>
                  <button
                    onClick={() => copyScript(s)}
                    className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedId === s.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
                {s.hook && <div className="text-base font-semibold mb-2">&quot;{s.hook}&quot;</div>}
                {s.body && <div className="text-sm text-zinc-300 whitespace-pre-wrap mb-2">{s.body}</div>}
                {s.cta && <div className="text-xs text-zinc-400 italic">CTA: {s.cta}</div>}
                {s.hashtags && <div className="text-[11px] text-zinc-500 mt-2 truncate">{s.hashtags}</div>}
              </div>
            ))}
            <button onClick={() => router.push(`/avatars/${id}`)} className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">
              Back to avatar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
