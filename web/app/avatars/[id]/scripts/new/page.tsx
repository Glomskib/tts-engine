'use client';

/**
 * /avatars/[id]/scripts/new — Script generation widget
 *
 * Restored 2026-06-01 (Brandon + AI partner).
 * Composes the cohesive single-pane layout from commit 63d517b0 (May 17)
 * with the inline render-to-video flow added in 0794baa0 (May 18), plus:
 *  - Avatar persona card up top (so the user knows whose voice will speak)
 *  - Niche starter hooks from web/lib/avatar-niche-scripts.ts —
 *    tap-to-seed brief when avatar's archetype matches one of the 10 niches
 *  - Per-card star (local) + regenerate-just-this-one
 *
 * API payload UNCHANGED: POST /api/avatars/[id]/scripts
 *   { product_name, product_brief?, types: [{kind, count}] }
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Sparkles, Loader2, AlertCircle, Check, ChevronDown, ChevronUp,
  Copy, Video, Play, Star, RefreshCw, User as UserIcon, Wand2,
} from 'lucide-react';
import { STARTER_SCRIPTS_BY_NICHE, type StarterScript } from '@/lib/avatar-niche-scripts';

// ── Length / format presets ────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────
interface OutScript {
  id: string; script_type: string; hook?: string; body?: string; cta?: string;
  captions?: string; hashtags?: string;
}

interface RenderJob {
  id: string; status: string; step?: string; steps_done?: string[];
  progress?: number; error_message?: string;
  output?: { video_url?: string };
}

interface Avatar {
  id: string;
  name?: string;
  avatar_display_name?: string;
  niche?: string;
  tone_descriptor?: string;
  personality?: string;
  avatar_visual_reference_url?: string;
  knowledge_bank?: { archetype?: string } & Record<string, unknown>;
}

function scriptToPrompt(s: OutScript, avatarHint?: string): string {
  const parts: string[] = [];
  if (avatarHint) parts.push(`Speaker: ${avatarHint}`);
  if (s.script_type) parts.push(`Length / format: ${s.script_type}`);
  if (s.hook) parts.push(`Hook: ${s.hook}`);
  if (s.body) parts.push(`Body: ${s.body}`);
  if (s.cta) parts.push(`CTA: ${s.cta}`);
  parts.push('Render this as a vertical short-form video with karaoke captions in this avatar\'s voice.');
  return parts.join('\n\n');
}

export default function ScriptGenPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // Avatar persona (loaded once)
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);

  // Inputs
  const [product, setProduct] = useState('');
  const [brief, setBrief] = useState('');
  const [length, setLength] = useState<'15s' | '30s' | '60s'>('30s');
  const [count, setCount] = useState(3);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedCounts, setAdvancedCounts] = useState<Record<string, number>>({});

  // Generation state
  const [busy, setBusy] = useState(false);
  const [scripts, setScripts] = useState<OutScript[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Per-card UI state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [regenIds, setRegenIds] = useState<Set<string>>(new Set());
  const [renderState, setRenderState] = useState<
    Record<string, { job?: RenderJob; err?: string; starting?: boolean }>
  >({});

  const advTotal = Object.values(advancedCounts).reduce((a, b) => a + b, 0);
  const useAdvanced = advancedOpen && advTotal > 0;
  const planned = useAdvanced ? advTotal : count;

  // Niche starter hooks (only if avatar's archetype matches one of the 10 niche keys)
  const starterHooks: StarterScript[] = useMemo(() => {
    const arch = avatar?.knowledge_bank?.archetype;
    if (!arch) return [];
    return STARTER_SCRIPTS_BY_NICHE[arch] ?? [];
  }, [avatar]);

  // Load avatar once
  useEffect(() => {
    if (!id) return;
    fetch(`/api/avatars/${id}`)
      .then(async r => {
        const j = await r.json() as { ok: boolean; avatar?: Avatar };
        if (j.ok) setAvatar(j.avatar || null);
      })
      .catch(() => { /* non-fatal — page still works without persona card */ })
      .finally(() => setAvatarLoading(false));
  }, [id]);

  // Poll any running render jobs
  useEffect(() => {
    const running = Object.entries(renderState)
      .filter(([, st]) => st.job && !['completed', 'failed'].includes(st.job.status));
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const [scriptId, st] of running) {
        if (!st.job?.id) continue;
        try {
          const r = await fetch(`/api/studio/oneprompt?job_id=${st.job.id}`, { cache: 'no-store' });
          const j = await r.json() as { ok: boolean; job?: RenderJob };
          if (j.ok && j.job) {
            setRenderState(s => ({ ...s, [scriptId]: { ...s[scriptId], job: j.job } }));
          }
        } catch { /* swallow */ }
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [renderState]);

  // ── Actions ──────────────────────────────────────────────────────────

  async function generate() {
    if (!product.trim()) { setErr('Tell us what the video is about first.'); return; }
    setBusy(true); setErr(null); setScripts([]); setRenderState({}); setStarredIds(new Set());
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

  async function regenerateOne(s: OutScript) {
    setRegenIds(prev => new Set(prev).add(s.id));
    try {
      const r = await fetch(`/api/avatars/${id}/scripts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product_name: product,
          product_brief: brief,
          types: [{ kind: s.script_type || length, count: 1 }],
        }),
      });
      const j = await r.json() as { ok: boolean; scripts?: OutScript[]; error?: string };
      if (!j.ok || !j.scripts || !j.scripts[0]) throw new Error(j.error || 'regen failed');
      const fresh = j.scripts[0];
      setScripts(prev => prev.map(p => p.id === s.id ? fresh : p));
      // Drop any prior render state for the old id
      setRenderState(prev => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
      // Carry star over to the new id
      setStarredIds(prev => {
        if (!prev.has(s.id)) return prev;
        const next = new Set(prev);
        next.delete(s.id);
        next.add(fresh.id);
        return next;
      });
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'regen failed';
      setRenderState(state => ({ ...state, [s.id]: { ...(state[s.id] || {}), err: m } }));
    } finally {
      setRegenIds(prev => { const next = new Set(prev); next.delete(s.id); return next; });
    }
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

  function toggleStar(s: OutScript) {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
  }

  async function renderScript(s: OutScript) {
    setRenderState(state => ({ ...state, [s.id]: { ...(state[s.id] || {}), starting: true, err: undefined } }));
    try {
      const prompt = scriptToPrompt(s, avatar?.avatar_display_name || avatar?.name);
      const r = await fetch('/api/studio/oneprompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, avatar_id: id }),
      });
      const j = await r.json() as { ok: boolean; job_id?: string; error?: string };
      if (!j.ok || !j.job_id) throw new Error(j.error || 'failed to start');
      setRenderState(state => ({
        ...state,
        [s.id]: {
          starting: false,
          job: { id: j.job_id!, status: 'running', step: 'parse_intent_done', progress: 10, steps_done: ['parse_intent'] },
        },
      }));
    } catch (e: unknown) {
      setRenderState(state => ({ ...state, [s.id]: { ...(state[s.id] || {}), starting: false, err: e instanceof Error ? e.message : 'render failed' } }));
    }
  }

  function seedFromHook(h: StarterScript) {
    // Replace [PRODUCT] with the typed product if present, otherwise leave the slot.
    const filled = product.trim()
      ? h.hook.replace(/\[PRODUCT\]/g, product.trim())
      : h.hook;
    setBrief(filled);
    // Scroll the brief into view on mobile
    if (typeof document !== 'undefined') {
      const el = document.getElementById('brief-input');
      el?.focus();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  const personaName = avatar?.avatar_display_name || avatar?.name || 'this avatar';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href={`/avatars/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
          <Sparkles className="w-6 h-6 text-teal-400" /> Write me a script
        </h1>
        <p className="text-sm text-zinc-400 mb-5">
          AI writes in this avatar&apos;s locked voice, niche, and tone. Each script gets a one-click &quot;Make video&quot; button.
        </p>

        {/* Avatar persona context */}
        <PersonaCard avatar={avatar} loading={avatarLoading} />

        {scripts.length === 0 && (
          <div className="space-y-5">
            {/* Topic */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">
                What&apos;s the video about?
              </label>
              <input
                type="text" value={product} onChange={e => setProduct(e.target.value)}
                placeholder="e.g. CalmEase magnesium gummies for sleep"
                className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-base focus:border-teal-500 outline-none"
                autoFocus
              />
            </div>

            {/* Niche starter hooks (only when avatar's archetype matches one of the 10 affiliate niches) */}
            {starterHooks.length > 0 && (
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-teal-300 font-semibold mb-2">
                  <Wand2 className="w-3.5 h-3.5" />
                  Starter hooks for {avatar?.niche || personaName}
                </div>
                <div className="text-[11px] text-zinc-400 mb-2.5">
                  Tap one to seed the angle below. The AI will rewrite it in {personaName}&apos;s voice.
                </div>
                <div className="space-y-1.5">
                  {starterHooks.slice(0, 3).map((h, i) => (
                    <button
                      key={i} type="button" onClick={() => seedFromHook(h)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-zinc-900/60 border border-white/5 hover:border-teal-400/40 hover:bg-zinc-900 text-xs text-zinc-200 leading-snug"
                    >
                      <span className="text-teal-300/80">&quot;</span>
                      {h.hook}
                      <span className="text-teal-300/80">&quot;</span>
                      {h.pattern && <span className="block text-[10px] text-zinc-500 mt-0.5">↳ {h.pattern}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Brief */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">
                Angle or key benefit <span className="text-zinc-600 normal-case">(optional)</span>
              </label>
              <textarea
                id="brief-input"
                value={brief} onChange={e => setBrief(e.target.value)} rows={2}
                placeholder="Plain-language angle. 'It's the only one that doesn't taste chalky.' Or skip — we'll pick."
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
              />
            </div>

            {/* Length */}
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

            {/* Count */}
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

            {/* Advanced */}
            <div className="border border-white/5 rounded-xl">
              <button
                type="button" onClick={() => setAdvancedOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-white"
              >
                <span>Mix script types (advanced)</span>
                {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  <div className="text-[11px] text-zinc-500 mb-2">
                    Set counts for any mix of formats. Overrides the simple length picker above.
                  </div>
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
                    <div className="text-[11px] text-teal-300 mt-2">
                      Advanced mix active — will write {advTotal} scripts.
                    </div>
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
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Writing {planned} script{planned === 1 ? '' : 's'}…</>
                : <><Sparkles className="w-5 h-5" /> Generate {planned} script{planned === 1 ? '' : 's'}</>
              }
            </button>
            <div className="text-center text-[11px] text-zinc-500">
              Free to retry. We&apos;ll save everything to your library.
            </div>
          </div>
        )}

        {/* Results */}
        {scripts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 text-sm">
                <Check className="w-4 h-4" /> {scripts.length} script{scripts.length === 1 ? '' : 's'} written, saved to your library.
              </div>
              <button
                onClick={() => { setScripts([]); setRenderState({}); setStarredIds(new Set()); }}
                className="text-xs text-zinc-400 hover:text-white underline"
              >
                Write more
              </button>
            </div>
            {scripts.map(s => {
              const rs = renderState[s.id];
              const job = rs?.job;
              const videoUrl = job?.output?.video_url;
              const isRendering = !!rs?.starting || (job && !['completed', 'failed'].includes(job.status));
              const renderErr = rs?.err || job?.error_message;
              const isStarred = starredIds.has(s.id);
              const isRegen = regenIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-zinc-900 p-4 transition-colors ${
                    isStarred ? 'border-amber-400/50 ring-1 ring-amber-400/20' : 'border-white/10'
                  }`}
                >
                  {/* Header: type + per-card actions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-teal-300 font-semibold">
                      {s.script_type}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => toggleStar(s)}
                        title={isStarred ? 'Unstar' : 'Star this one'}
                        className="text-[11px] flex items-center gap-1 text-zinc-400 hover:text-amber-300"
                      >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                      <button
                        onClick={() => regenerateOne(s)}
                        disabled={isRegen}
                        title="Regenerate just this one"
                        className="text-[11px] flex items-center gap-1 text-zinc-400 hover:text-white disabled:opacity-50"
                      >
                        {isRegen
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => copyScript(s)}
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                      >
                        {copiedId === s.id
                          ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
                          : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                      </button>
                    </div>
                  </div>

                  {s.hook && <div className="text-base font-semibold mb-2 leading-snug">&quot;{s.hook}&quot;</div>}
                  {s.body && <div className="text-sm text-zinc-300 whitespace-pre-wrap mb-2 leading-relaxed">{s.body}</div>}
                  {s.cta && <div className="text-xs text-zinc-400 italic">CTA: {s.cta}</div>}
                  {s.hashtags && <div className="text-[11px] text-zinc-500 mt-2 truncate">{s.hashtags}</div>}

                  {/* Render-to-video block */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    {!job && !isRendering && (
                      <button
                        onClick={() => renderScript(s)}
                        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-teal-500 hover:opacity-90 font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Video className="w-4 h-4" /> Make this into a video
                      </button>
                    )}
                    {rs?.starting && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Starting render…
                      </div>
                    )}
                    {renderErr && (
                      <div className="p-2.5 rounded-lg bg-red-900/30 border border-red-500/30 text-xs text-red-200 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5" />{renderErr}
                      </div>
                    )}
                    {job && !videoUrl && job.status !== 'failed' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-zinc-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-300" />
                          <span>{job.step?.replace(/_done$/, '').replace(/_/g, ' ') || 'rendering'}…</span>
                          {typeof job.progress === 'number' && <span className="text-zinc-500 text-xs">{job.progress}%</span>}
                        </div>
                        <div className="text-[10px] text-zinc-500">Voice + render takes 1–3 min once the cron picks it up.</div>
                      </div>
                    )}
                    {videoUrl && (
                      <div className="space-y-2">
                        <video src={videoUrl} controls className="w-full max-w-xs mx-auto rounded-lg" />
                        <Link href="/library" className="block text-center py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-xs font-semibold">
                          <Play className="w-3 h-3 inline mr-1" /> Open in Library
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <button onClick={() => router.push(`/avatars/${id}`)} className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">
              Back to avatar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Persona card ─────────────────────────────────────────────────────────
function PersonaCard({ avatar, loading }: { avatar: Avatar | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 mb-5 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
          <div className="h-2.5 w-48 bg-zinc-800/70 rounded animate-pulse" />
        </div>
      </div>
    );
  }
  if (!avatar) return null;
  const name = avatar.avatar_display_name || avatar.name || 'Avatar';
  const tone = avatar.tone_descriptor || avatar.personality;
  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-3 mb-5 flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 ring-1 ring-teal-400/30">
        {avatar.avatar_visual_reference_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar.avatar_visual_reference_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <UserIcon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{name}</div>
        {avatar.niche && <div className="text-[11px] text-zinc-400 truncate">{avatar.niche}</div>}
        {tone && <div className="text-[11px] text-zinc-500 truncate mt-0.5 italic">{tone}</div>}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-teal-300/80 font-semibold flex-shrink-0">
        Voice locked
      </div>
    </div>
  );
}
