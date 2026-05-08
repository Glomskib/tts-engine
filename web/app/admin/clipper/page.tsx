'use client';

/**
 * /admin/clipper — Long-form-to-shorts pipeline for clippers.
 *
 * MVP: paste YouTube URL → server pulls via Cobalt (existing
 * /api/video-engine/runs/from-youtube with workspace='clipper') → redirect
 * to /video-engine/[run_id] to see the AI moment detection + render.
 *
 * Built minimum-viable so Brandon can trial-run the clipper journey AM.
 * Phase 1 brief was supposed to ship this; the fleet's claude exited 0
 * without committing. Co (vp) wrote it directly.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link2, Sparkles } from 'lucide-react';

// Preset chips removed 2026-05-07 — Brandon's call. AI moment detector ranks
// clips on its own; surfacing a style picker just added decision friction
// before the user even pasted a URL.

export default function ClipperPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [count, setCount] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/video-engine/runs/from-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          workspace: 'clipper',
          target_clip_count: count,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
      }
      const runId = data?.data?.run_id;
      if (!runId) throw new Error('No run_id returned');
      router.push(`/video-engine/${runId}`);
    } catch (err: any) {
      console.error('clipper submit error', err);
      setError(err?.message || 'Something went wrong. Try again or paste a different URL.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Clipper OS
        </h1>
        <p className="mt-2 text-base sm:text-lg text-muted-foreground">
          Paste a podcast or long video. Get back ranked viral clips ready to post on TikTok, Reels, and Shorts.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="clipper-url" className="block text-sm font-semibold mb-2">
            <Link2 className="inline w-4 h-4 mr-1 -mt-0.5" />
            YouTube / podcast URL
          </label>
          <input
            id="clipper-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 rounded-lg border bg-background text-base focus:ring-2 focus:ring-primary focus:outline-none"
            disabled={submitting}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Works with YouTube, podcast RSS, Twitch VODs, and most public video URLs (via Cobalt).
          </p>
        </div>

        <div>
          <label htmlFor="clipper-count" className="block text-sm font-semibold mb-2">
            How many clips?
          </label>
          <select
            id="clipper-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border bg-background text-base"
          >
            <option value={5}>5 clips (fastest)</option>
            <option value={10}>10 clips</option>
            <option value={15}>15 clips (recommended)</option>
            <option value={20}>20 clips</option>
            <option value={30}>30 clips (max)</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing — this can take 60-120 seconds...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate clips
            </>
          )}
        </button>
      </form>

      <section className="mt-12 border-t pt-8">
        <h2 className="text-lg font-semibold mb-3">How it works</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Paste your podcast or long video URL above.</li>
          <li>We pull the video and transcribe it with Whisper.</li>
          <li>Gemini analyzes the transcript and video frames for viral moments.</li>
          <li>You get back ranked clip suggestions with hooks, ready to render and post.</li>
          <li>One-click render to vertical 9:16 with captions for TikTok / Reels / Shorts.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Replaces Opus Clip + Submagic + Late.dev — for less than the price of Opus alone.
        </p>
      </section>
    </div>
  );
}
