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
  Youtube, Loader2, ArrowRight, AlertTriangle, Zap, Flame, BookOpen,
} from 'lucide-react';
import type { ClipperPreset } from './WorkspaceSelector';

const YT_REGEX = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{6,}/;

type PresetKey = 'viral' | 'highlights' | 'educational';

const PRESETS: Array<{
  key: PresetKey;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  clipperPreset: ClipperPreset;
}> = [
  { key: 'viral',        label: 'Viral moments', hint: 'Scroll-stopping hooks',        icon: Flame,    clipperPreset: 'viral' },
  { key: 'highlights',   label: 'Highlights',    hint: 'Short, punchy cuts',           icon: Zap,      clipperPreset: 'highlights' },
  { key: 'educational',  label: 'Educational',   hint: 'Explainers, clean pacing',     icon: BookOpen, clipperPreset: 'educational' },
];

export default function YouTubeClipperForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [preset, setPreset] = useState<PresetKey | null>(null);
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
    setStatusLine('Finding the best moments…');
    try {
      const res = await fetch('/api/video-engine/runs/from-youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          workspace: 'clipper',
          preset: preset ?? null,
        }),
      });

      if (res.status === 404) {
        setError('YouTube-link ingest isn’t wired on this environment yet. For now, download the video and upload it directly from /video-engine.');
        setBusy(false);
        setStatusLine(null);
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || json?.error || `Request failed (HTTP ${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : 'Request failed');
      }
      const runId = json?.data?.run_id;
      if (!runId) throw new Error('The server didn’t return a run id.');
      router.push(`/video-engine/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
      setStatusLine(null);
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

        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
            Style (optional)
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = preset === p.key;
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => !busy && setPreset(active ? null : p.key)}
                  disabled={busy}
                  aria-pressed={active}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 min-h-[40px] text-sm font-medium transition-colors',
                    active
                      ? 'border-zinc-100 bg-zinc-100 text-zinc-900'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-zinc-600',
                    busy ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {p.label}
                </button>
              );
            })}
          </div>
          {preset && (
            <p className="mt-2 text-[11px] text-zinc-500">
              {PRESETS.find((p) => p.key === preset)?.hint}
            </p>
          )}
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
