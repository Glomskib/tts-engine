'use client';

/**
 * /admin/clipper — Long-form-to-shorts pipeline for clippers.
 *
 * Paste a podcast or long video URL → AI pulls + analyzes + ranks clips →
 * redirect to /video-engine/[run_id] for review and render.
 *
 * Style preset chips intentionally NOT here — AI detector ranks clips on its
 * own. No decision-friction style picker before the user even pastes a URL.
 *
 * Audit fixes (2026-05-08):
 * - Explicit teal-500 button styling (was relying on theme vars that didn't render)
 * - "How it works" rewritten to be vague (was leaking Whisper/Gemini/Cobalt internals)
 * - YT failure path: shows fallback "Upload directly" button instead of dead end
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link2, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';

export default function ClipperPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [count, setCount] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploadFallback, setShowUploadFallback] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowUploadFallback(false);
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
        const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
        // YT download failures get the upload-directly fallback prompt
        if (data?.error?.code === 'YOUTUBE_DOWNLOAD_FAILED' ||
            data?.error?.code === 'YOUTUBE_VIDEO_TOO_LARGE' ||
            data?.error?.code === 'YOUTUBE_VIDEO_TOO_LONG' ||
            String(msg).toLowerCase().includes('download')) {
          setShowUploadFallback(true);
        }
        throw new Error(msg);
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
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Clipper
        </h1>
        <p className="mt-2 text-base sm:text-lg text-zinc-400">
          Paste a long video. Get back ranked viral clips ready to post on TikTok, Reels, and Shorts.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="clipper-url" className="block text-sm font-semibold mb-2 text-zinc-200">
            <Link2 className="inline w-4 h-4 mr-1 -mt-0.5" />
            Video URL
          </label>
          <input
            id="clipper-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500 focus:outline-none placeholder-zinc-500"
            disabled={submitting}
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            YouTube, podcast feeds, and most public video URLs.
          </p>
        </div>

        <div>
          <label htmlFor="clipper-count" className="block text-sm font-semibold mb-2 text-zinc-200">
            How many clips?
          </label>
          <select
            id="clipper-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-white text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value={5}>5 clips (fastest)</option>
            <option value={10}>10 clips</option>
            <option value={15}>15 clips (recommended)</option>
            <option value={20}>20 clips</option>
            <option value={30}>30 clips (max)</option>
          </select>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            <div className="font-semibold mb-1">Couldn&apos;t process that URL</div>
            <div className="text-red-400/90">{error}</div>
            {showUploadFallback && (
              <div className="mt-3 pt-3 border-t border-red-500/20 flex flex-col sm:flex-row gap-2">
                <Link
                  href="/admin/editor/new"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-500 text-zinc-900 font-semibold hover:bg-teal-400 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload the file directly
                </Link>
                <button
                  type="button"
                  onClick={() => { setError(null); setShowUploadFallback(false); }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
                >
                  Try a different URL
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-lg bg-teal-500 text-zinc-900 font-bold inline-flex items-center justify-center gap-2 hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-500/20"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing — this can take 60–120 seconds...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate clips
            </>
          )}
        </button>
      </form>

      <section className="mt-12 border-t border-zinc-800 pt-8">
        <h2 className="text-lg font-semibold mb-3 text-white">What you get</h2>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-start gap-2">
            <span className="text-teal-400 mt-0.5">→</span>
            <span>5–30 ranked short clips with the best hooks pulled out automatically</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-400 mt-0.5">→</span>
            <span>Vertical 9:16 with captions, ready for TikTok / Reels / Shorts</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-400 mt-0.5">→</span>
            <span>One-click render and download — no manual editing required</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal-400 mt-0.5">→</span>
            <span>Reorder, regenerate, or tweak any clip before posting</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
