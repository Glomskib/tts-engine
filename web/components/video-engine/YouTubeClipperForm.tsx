'use client';

/**
 * YouTube → Clips entry point for the clipper workflow.
 *
 * Paste a YouTube URL, (optionally) pick a preset, click "Find the best clips".
 * The form posts to /api/video-engine/runs/from-youtube — a thin server bridge
 * that downloads the video, parks it in the renders bucket, and creates a
 * ve_runs row with workspace='clipper'. Once we have a run id, we redirect the
 * user straight into /video-engine/[id] so they see the same progress track as
 * the direct-upload flow.
 *
 * Deliberately minimal: no summary, no transcript preview, no analysis blocks.
 * Paste → click → clips.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Youtube, Loader2, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { events } from '@/lib/tracking';

const YT_REGEX = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{6,}/;

// Preset chips removed 2026-05-07 — Brandon's call. Style picker added decision
// friction and the AI moment detector picks the best clips regardless. Server
// route still accepts `preset` for back-compat; we just don't expose it.

export default function YouTubeClipperForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlOk = YT_REGEX.test(url.trim());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!urlOk) {
      setError('That doesn’t look like a YouTube link. Try pasting the full URL.');
      return;
    }
    setBusy(true);
    setStatusLine('Downloading from YouTube…');

    // Progress hint timer — Cobalt download for a 10-min video typically takes
    // 30-60 sec; without a status update the page feels frozen.
    const statusTimers: ReturnType<typeof setTimeout>[] = [];
    statusTimers.push(setTimeout(() => setStatusLine('Parking video for processing…'), 25_000));
    statusTimers.push(setTimeout(() => setStatusLine('Almost there — finalizing run…'), 50_000));

    try {
      const res = await fetch('/api/video-engine/runs/from-youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          workspace: 'clipper',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || json?.error || `Request failed (HTTP ${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : 'Request failed');
      }
      const runId = json?.data?.run_id;
      if (!runId) throw new Error('The server didn’t return a run id.');
      // First-clip funnel event — guarded by localStorage to fire once per browser.
      try {
        if (typeof window !== 'undefined' && localStorage.getItem('ff_first_clip_fired') !== '1') {
          localStorage.setItem('ff_first_clip_fired', '1');
          events.firstClipCreated({ runId, source: 'youtube' });
        }
      } catch { /* localStorage may be unavailable in private mode */ }
      router.push(`/video-engine/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
      setStatusLine(null);
    } finally {
      statusTimers.forEach(clearTimeout);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0 py-6 sm:py-10 space-y-8">
      <header className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-900/40 bg-red-950/30 px-3 py-1 text-[11px] font-medium text-red-300 mb-3">
          <Youtube className="w-3.5 h-3.5" />
          YouTube → Clips
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Turn YouTube videos into clips
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-400 leading-relaxed">
          Paste a YouTube link. We’ll find the best moments and turn them into short clips you can post.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-5 sm:p-6 space-y-5"
      >
        <div>
          <label htmlFor="yt-url" className="block text-sm font-medium text-zinc-200 mb-2">
            YouTube link
          </label>
          <input
            id="yt-url"
            type="url"
            autoFocus
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            placeholder="https://www.youtube.com/watch?v=…"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            disabled={busy}
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 focus:border-zinc-500 focus:ring-0 outline-none text-zinc-100 placeholder-zinc-600 text-sm sm:text-base px-4 min-h-[52px] disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-100 hover:bg-white active:bg-zinc-200 text-zinc-900 text-base font-semibold min-h-[52px] px-4 disabled:opacity-60 transition-colors"
        >
          {busy ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {statusLine ?? 'Working…'}</>
          ) : (
            <>Find the best clips <ArrowRight className="w-5 h-5" /></>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>

      <p className="text-xs text-zinc-500 text-center sm:text-left">
        Works with long-form videos, Shorts, and livestream VODs. Paste → click → clips.
      </p>
    </div>
  );
}
