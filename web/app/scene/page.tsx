'use client';

/**
 * /scene — front door to the Runway/Veo SCENE GENERATOR.
 *
 * The scene-gen ENGINE (lib/runway.ts → createImageToVideo, Gen-4.5 / Veo 3.1)
 * has always existed, but its old UI (the 5,603-line /admin/content-studio
 * god-page) was deleted in the 2026-05-12 refactor and never rebuilt — so the
 * engine ran with no door. This is that door: prompt + reference image →
 * /api/render/runway → poll /api/render/status → the acted-out scene video.
 *
 * Runway needs a reference image (text-only produces garbled labels), so a
 * product/reference image URL is required — exactly what the render route
 * enforces.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Film, Sparkles, AlertTriangle, ArrowLeft, Image as ImageIcon } from 'lucide-react';

type Phase = 'idle' | 'enhancing' | 'queuing' | 'rendering' | 'done' | 'error';

const MODELS = [
  { value: 'gen4.5', label: 'Runway Gen-4.5 (best motion)' },
  { value: 'veo3.1', label: 'Google Veo 3.1 (4K + audio)' },
  { value: 'veo3.1_fast', label: 'Veo 3.1 Fast (cheaper)' },
];

export default function ScenePage() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [model, setModel] = useState('gen4.5');
  const [duration, setDuration] = useState<5 | 10>(10);

  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tap-to-upload a photo → returns a public URL Runway can read. Kills the
  // "paste an image URL" friction (the #1 thing making this NOT a no-brainer).
  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/avatars/upload-temp', { method: 'POST', credentials: 'include', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.public_url) throw new Error(j.error || `Upload failed (${r.status})`);
      setImageUrl(String(j.public_url));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed — try a different image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  const generate = useCallback(async () => {
    setError(null);
    if (!prompt.trim()) { setError('Describe the scene you want generated.'); return; }
    if (!imageUrl.trim()) { setError('A reference image URL is required — Runway needs it to generate a clean scene.'); return; }
    setVideoUrl(null);
    setProgress(null);
    setEnhanced(null);

    // Step 1 — turn the casual idea into a cinematic, photoreal prompt. This is
    // the single biggest lever on how real the result looks. Best-effort: if it
    // fails, fall back to the raw prompt rather than blocking the render.
    let finalPrompt = prompt.trim();
    if (autoEnhance) {
      setPhase('enhancing');
      try {
        const er = await fetch('/api/scene/enhance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ prompt: prompt.trim() }),
        });
        const ej = await er.json().catch(() => ({}));
        if (er.ok && ej.ok && ej.enhanced) { finalPrompt = String(ej.enhanced); setEnhanced(finalPrompt); }
      } catch { /* fall back to raw prompt */ }
    }

    // Step 2 — render the scene.
    setPhase('queuing');
    try {
      const r = await fetch('/api/render/runway', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          promptText: finalPrompt,
          promptImageUrl: imageUrl.trim(),
          model,
          duration,
          ratio: '720:1280',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || !j.taskId) {
        throw new Error(j.message || j.error || `Render request failed (${r.status})`);
      }
      setTaskId(String(j.taskId));
      setPhase('rendering');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Could not start the scene render.');
    }
  }, [prompt, imageUrl, model, duration, autoEnhance]);

  // Poll for the finished scene.
  useEffect(() => {
    if (phase !== 'rendering' || !taskId) return;
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/render/status/${taskId}?provider=runway`, { cache: 'no-store', credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) return;
        if (typeof j.progress === 'number') setProgress(Math.round(j.progress * 100));
        // Key off the video URL — it's only set when Runway SUCCEEDED, so this
        // is robust regardless of the exact normalized status string.
        if (j.url) {
          setVideoUrl(j.url); setPhase('done'); stopPoll();
        } else if (typeof j.status === 'string' && /fail|error/i.test(j.status)) {
          setError(j.error || 'The scene render failed.'); setPhase('error'); stopPoll();
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => stopPoll();
  }, [phase, taskId, stopPoll]);

  const busy = phase === 'enhancing' || phase === 'queuing' || phase === 'rendering';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> FlashFlow
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Film className="w-6 h-6 text-teal-400" />
          <h1 className="text-2xl font-bold">Scene Generator</h1>
        </div>
        <p className="text-sm text-zinc-400 mb-5">
          Describe a moment and it gets <span className="text-teal-300">acted out</span> as real video —
          powered by Runway / Veo. Not a talking head: an actual scene with motion.
        </p>

        <label className="block text-xs font-semibold text-zinc-300 mb-1">What happens in the scene?</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
          placeholder="e.g. A guy at his kitchen counter grabs the bottle, takes a scoop, mixes it into his shaker and chugs it, hyped — energetic, handheld, morning light."
          rows={4}
          disabled={busy}
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none disabled:opacity-50"
        />

        <label className="block text-xs font-semibold text-zinc-300 mb-1 mt-3">Add a photo <span className="text-zinc-500">(the product or person in the scene)</span></label>
        {imageUrl ? (
          <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900 border border-white/10">
            <img src={imageUrl} alt="" className="w-14 h-14 rounded object-cover bg-zinc-800" />
            <div className="flex-1 text-xs text-emerald-300 truncate">Photo added ✓</div>
            <button onClick={() => setImageUrl('')} disabled={busy} className="text-xs text-zinc-400 hover:text-white px-2 py-1">Change</button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || uploading}
              className="w-full py-4 rounded-lg border-2 border-dashed border-white/15 bg-zinc-900/50 hover:border-teal-500/50 text-sm text-zinc-300 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><ImageIcon className="w-4 h-4 text-teal-300" /> Tap to upload a photo</>}
            </button>
            <button type="button" onClick={() => setShowUrl((s) => !s)} className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300 underline">
              or paste an image URL
            </button>
            {showUrl && (
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                disabled={busy}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none disabled:opacity-50"
              />
            )}
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm outline-none disabled:opacity-50">
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Length</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value) as 5 | 10)} disabled={busy}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm outline-none disabled:opacity-50">
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-zinc-300 cursor-pointer select-none">
          <input type="checkbox" checked={autoEnhance} onChange={(e) => setAutoEnhance(e.target.checked)} className="accent-teal-400 w-4 h-4" />
          <span><span className="font-semibold text-teal-300">Cinematic mode</span> — auto-upgrade my prompt for photoreal results <span className="text-zinc-500">(strongly recommended)</span></span>
        </label>

        {error && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" /> {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy}
          className="mt-4 w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-60 font-semibold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {phase === 'enhancing' ? 'Making it cinematic…'
            : phase === 'queuing' ? 'Sending to Runway…'
            : phase === 'rendering' ? `Rendering the scene${progress != null ? ` ${progress}%` : '…'}`
            : 'Generate the scene'}
        </button>

        {enhanced && (
          <div className="mt-3 rounded-lg border border-teal-400/30 bg-teal-500/5 p-3">
            <div className="text-[11px] font-semibold text-teal-300 mb-1">Cinematic prompt sent to the model:</div>
            <div className="text-xs text-zinc-300 leading-relaxed">{enhanced}</div>
          </div>
        )}

        {phase === 'rendering' && (
          <p className="text-[11px] text-zinc-500 mt-2 text-center">Scene generation takes ~1–3 minutes. Keep this tab open.</p>
        )}

        {phase === 'done' && videoUrl && (
          <div className="mt-5">
            <div className="text-sm font-semibold mb-2 text-teal-300">Your scene:</div>
            <video src={videoUrl} controls playsInline className="w-full rounded-xl border border-white/10 bg-black" />
            <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-teal-300 underline">Open / download</a>
          </div>
        )}
      </div>
    </div>
  );
}
