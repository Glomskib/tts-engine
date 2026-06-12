'use client';

import { QueueStatusBanner } from '@/components/queue/QueueStatusBanner';
/**
 * /clips — "My Clips" library.
 *
 * For each job:
 *   - Pending/in-progress jobs show a status pill + "View progress →"
 *     button that opens /create?job=<id> to watch the Cooking screen.
 *   - Completed jobs render the actual clip(s) inline with a player +
 *     download button so the user doesn't have to bounce back to /create.
 *   - Failed jobs show the error_message so the user knows why.
 *
 * Source data: /api/create/jobs (now returns `clips[]` per job).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, Plus, Download, ExternalLink, AlertTriangle, Copy, Share2, Check } from 'lucide-react';

/**
 * Compose a TikTok / Reels / Shorts–ready caption from the run's context.
 * No new AI call — just stitches together describe + vibe + auto-hashtags.
 * Stays under TikTok's 2200-char cap. Real best-in-class would add the
 * AI-generated hook line; that requires a backend pass we'll add later.
 */
function composeCaption(describe: string, vibe: string | undefined): string {
  const desc = (describe || '').trim();
  const v = (vibe || 'real').toLowerCase();
  const VIBE_TAGS: Record<string, string[]> = {
    hype:  ['#hype', '#energy', '#viral', '#fyp', '#trending'],
    calm:  ['#calm', '#aesthetic', '#peaceful', '#vibes'],
    real:  ['#real', '#authentic', '#fyp', '#storytime'],
    funny: ['#funny', '#comedy', '#fyp', '#lol'],
    sad:   ['#sad', '#emotional', '#realtalk', '#feels'],
  };
  const tags = VIBE_TAGS[v] || VIBE_TAGS.real;
  const baseTags = ['#tiktok', '#reels', '#shorts'];
  const hashtags = [...new Set([...tags, ...baseTags])].join(' ');
  const body = desc || 'New clip is up 🔥';
  return `${body}\n\n${hashtags}`.slice(0, 2150);
}

interface Clip {
  id: string;
  output_url: string | null;
  duration_sec: number | null;
  status: string;
  /** Why this clip's render failed (from ve_rendered_clips). null when fine. */
  error_message?: string | null;
  /** AI-packaged caption (Anthropic via packaging.ts). null when missing. */
  caption_text?: string | null;
  /** AI-packaged hashtags (lowercase, no #). Empty array when missing. */
  hashtags?: string[];
  /** AI-packaged title suggestion (used as headline). */
  suggested_title?: string | null;
  /** AI-packaged CTA hint. */
  cta_suggestion?: string | null;
}

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  target_clip_count: number;
  context_json: {
    describe?: string;
    vibe?: string;
    /** Post Maker multi-take uploads beyond the primary. v1 renders take 1
     *  only — these are saved for the upcoming take picker, so the UI must
     *  say so instead of implying every upload becomes a video. */
    additional_sources?: Array<{ filename?: string }>;
  };
  error_message: string | null;
  clips: Clip[];
}

export default function ClipsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Signed-out (or expired-session) users get a 401 from the API. Without
  // tracking it, the page lied with "Your video library is empty" — track it
  // so we can show a sign-in path instead of a fake empty library.
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/create/jobs', { cache: 'no-store' });
        if (r.status === 401) {
          if (!cancelled) setNeedsAuth(true);
          return;
        }
        const j = await r.json();
        if (!cancelled && j?.ok) {
          setNeedsAuth(false);
          setJobs(j.jobs || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Keep the page fresh while jobs are in progress.
    const interval = setInterval(load, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <QueueStatusBanner />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Videos</h1>
          <Link
            href="/create"
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : needsAuth ? (
          // Signed out — say so. Previously this fell through to the empty
          // state, which told logged-out users their library was empty.
          <div className="text-center py-16 px-6 bg-gradient-to-b from-zinc-900 to-zinc-900/40 border border-zinc-800 rounded-2xl">
            <h2 className="text-2xl font-bold text-white mb-2">Sign in to see your videos</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Your library is saved to your account. Sign in and it&apos;ll all be here.
            </p>
            <Link
              href="/login?redirect=/clips"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/20 transition-all"
            >
              Sign in
            </Link>
          </div>
        ) : jobs.length === 0 ? (
          // Empty state — give new users an obvious primary path AND a
          // low-commitment secondary path. Helps tire-kickers who aren't
          // ready to upload yet still see value.
          <div className="text-center py-16 px-6 bg-gradient-to-b from-zinc-900 to-zinc-900/40 border border-zinc-800 rounded-2xl">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 bg-teal-500/20 rounded-2xl blur-xl" />
              <div className="relative w-16 h-16 mx-auto rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-teal-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Your video library is empty</h2>
            <p className="text-zinc-400 mb-2 max-w-md mx-auto">
              Upload a video — we pick the best moments, add karaoke captions, and ship vertical videos ready for TikTok, Reels, and Shorts.
            </p>
            <p className="text-xs text-zinc-500 mb-8">Usually under a minute. No watermarks. Yours to keep.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/create"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/20 transition-all"
              >
                <Plus className="w-4 h-4" /> Make your first video
              </Link>
              <Link
                href="/script-generator"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 border border-white/10 hover:bg-white/5 hover:border-white/20 rounded-xl font-medium text-zinc-300 transition-all"
              >
                Or try the free script generator
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const done = job.status === 'complete';
  const failed = job.status === 'failed';
  const inProgress = !done && !failed;
  // Playable = has a real output_url. The URL is the source of truth — we've
  // been bitten repeatedly by status-string drift between workers and UIs
  // ('done'/'completed' vs 'complete'), so status only excludes known
  // failures instead of requiring an exact match.
  const ready = (job.clips || []).filter((c) => c.output_url && c.status !== 'failed');
  // Multi-take uploads (Post Maker): only take 1 renders in v1 — the rest are
  // saved for the take picker. Surface that honestly so "I uploaded 3 videos,
  // where are the other 2?" has an answer on the page.
  const extraTakes = job.context_json?.additional_sources?.length ?? 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <div className="font-medium truncate">{job.context_json?.describe || 'Untitled video job'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {job.target_clip_count} video{job.target_clip_count === 1 ? '' : 's'}
            {job.context_json?.vibe ? ` · ${job.context_json.vibe}` : ''}
            {' · '}
            {new Date(job.created_at).toLocaleDateString()}
          </div>
        </div>
        <StatusPill status={job.status} />
      </div>

      {failed && (
        <div className="mx-4 mb-4 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-200">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="leading-snug">{job.error_message || 'Job failed.'}</div>
          </div>
          <RetryJobButton jobId={job.id} />
        </div>
      )}

      {inProgress && (
        <div className="px-4 pb-4 flex items-center gap-4">
          <Link
            href={`/create?job=${job.id}`}
            className="inline-flex items-center gap-1 text-sm text-teal-400 hover:text-teal-300"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> View progress
          </Link>
          {/* If a job has been "in progress" for over 10 minutes, surface a
              retry path — usually means a worker stalled. */}
          <StuckRetryHint job={job} />
        </div>
      )}

      {/* Root-cause fix (2026-06-11 "can't click my videos"): the API returns
          clips for runs in 'rendering' AND 'complete' — a run whose clips all
          finished but whose run row never flipped to 'complete' (stalled tick;
          the queue is browser-driven) used to show only a tiny "View progress"
          link while its finished videos sat unrendered and unclickable. Gate
          the players on clip readiness, not run status. */}
      {ready.length > 0 && (
        <>
          {ready.length > 1 && (
            <div className="px-4 pb-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {ready.length} clip{ready.length === 1 ? '' : 's'} ready
              </span>
              <SaveAllButton clips={ready} />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4">
            {ready.map((c) => (
              <ClipCard key={c.id} clip={c} job={job} />
            ))}
          </div>
        </>
      )}

      {/* Multi-take honesty: N uploads → ONE rendered video in v1. Without
          this line a 3-take upload looks like 2 videos silently vanished. */}
      {extraTakes > 0 && (
        <div className="px-4 pb-4 text-xs text-zinc-500">
          Take 1 is the one we render — your other {extraTakes} take{extraTakes === 1 ? '' : 's'} {extraTakes === 1 ? 'is' : 'are'} saved for the take picker (coming soon).
        </div>
      )}

      {done && ready.length === 0 && <NoVideosExplainer job={job} />}
    </div>
  );
}

/**
 * Run says 'complete' but there's nothing to play. The old copy here was
 * "no clip URLs returned — this is rare. Try re-creating." — a dead end that
 * hid the real reason and made the user re-spend credits. Now we distinguish
 * the two real states and give a retry that actually re-queues the renders:
 *   - clips exist but no output_url yet → renders still uploading (the run
 *     row flipped early); the page polls every 6s so it self-resolves.
 *   - clips failed (or none exist) → show the render's error_message and a
 *     Retry button (POST /api/create/jobs/[id] re-queues failed renders).
 */
function NoVideosExplainer({ job }: { job: JobRow }) {
  const clips = job.clips || [];
  const stillBaking = clips.filter((c) => !c.output_url && c.status !== 'failed');
  if (stillBaking.length > 0) {
    return (
      <div className="px-4 pb-4 text-sm text-gray-400 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
        Almost done — {stillBaking.length} video{stillBaking.length === 1 ? ' is' : 's are'} still finishing. This page refreshes automatically.
      </div>
    );
  }
  // No pending clips → every render failed (or none were created). Be honest
  // about why, using the clip's real error first, then the run's.
  const reason =
    clips.find((c) => c.error_message)?.error_message
    || job.error_message
    || 'The renders didn’t finish — likely a worker hiccup.';
  return (
    <div className="mx-4 mb-4 bg-amber-950/30 border border-amber-800/60 rounded-lg px-3 py-2 text-sm text-amber-100">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="leading-snug">
          The videos for this job didn&apos;t come out. {reason}
        </div>
      </div>
      <RetryJobButton jobId={job.id} />
    </div>
  );
}

/**
 * Surface a "Retry" link when a job has been in flight for over 10 minutes.
 * Inside that window we trust the worker tick to advance it; past that, it's
 * almost certainly stuck on a transient error and a retry will unstick it.
 */
function StuckRetryHint({ job }: { job: JobRow }) {
  const minutesOld = (Date.now() - new Date(job.created_at).getTime()) / 60000;
  if (minutesOld < 10) return null;
  return (
    <span className="text-xs text-zinc-500">
      Stuck for a while? <RetryJobButton jobId={job.id} variant="link" /> kicks it off again.
    </span>
  );
}

/**
 * Retry button — POST /api/create/jobs/[id] resets the run so the worker tick
 * picks it up again. Used on failed jobs, and on stuck-in-progress jobs.
 */
function RetryJobButton({
  jobId,
  variant = 'button',
}: {
  jobId: string;
  variant?: 'button' | 'link';
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/create/jobs/${jobId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErr(j.error || `HTTP ${r.status}`);
        return;
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'retry failed');
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={go}
        disabled={busy || done}
        className="underline text-teal-400 hover:text-teal-300 disabled:opacity-50"
      >
        {/* Idle label said 'Retrying' — read like it was already in flight,
            so it didn't look clickable. */}
        {done ? 'Re-queued' : busy ? 'Retrying…' : 'Retry'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={go}
        disabled={busy || done}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 text-xs font-medium disabled:opacity-60"
      >
        {done ? 'Re-queued ✓' : busy ? 'Retrying…' : 'Try again'}
      </button>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
}

/**
 * Per-clip render — video player + copy-caption + share + download.
 *
 * Why this exists vs inlining: each clip has its own copied/shared state
 * for button feedback. Hoisting into a component keeps the parent simple.
 *
 * Best-in-class polish: Copy Caption pre-fills with the job's describe +
 * vibe-aware hashtags so the user can paste straight into TikTok/Reels.
 * Share uses Web Share API on mobile (native share sheet → IG, TikTok,
 * Messages) and falls back to copy URL on desktop.
 */
function ClipCard({ clip, job }: { clip: Clip; job: JobRow }) {
  const [copiedField, setCopiedField] = useState<'url' | 'caption' | null>(null);
  // Prefer the AI-packaged caption (Anthropic via packaging.ts) when
  // present. Falls back to a heuristic composition for older clips that
  // were rendered before packaging was wired.
  const aiCaption = (clip.caption_text || '').trim();
  const aiHashtags = (clip.hashtags || []).map((h) => `#${h.replace(/^#+/, '')}`).join(' ');
  const caption = aiCaption
    ? (aiHashtags ? `${aiCaption}\n\n${aiHashtags}` : aiCaption)
    : composeCaption(job.context_json?.describe ?? '', job.context_json?.vibe);

  async function copy(text: string, field: 'url' | 'caption') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // older browsers — fall through silently; user can still right-click copy
    }
  }

  async function share() {
    if (!clip.output_url) return;
    const shareData = {
      title: job.context_json?.describe || 'My FlashFlow clip',
      text: caption,
      url: clip.output_url,
    };
    // navigator.share is mobile-first; desktop typically lacks it
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as { share: (d: ShareData) => Promise<void> }).share(shareData);
        return;
      } catch {
        // user dismissed — fall through to copy
      }
    }
    void copy(clip.output_url, 'url');
  }

  return (
    <div className="bg-black rounded-lg overflow-hidden border border-gray-800">
      {clip.suggested_title && (
        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-200 truncate" title={clip.suggested_title}>
          {clip.suggested_title}
        </div>
      )}
      <video
        src={clip.output_url || ''}
        controls
        playsInline
        preload="metadata"
        className="w-full aspect-[9/16] bg-black"
      />
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="text-gray-400">
          {clip.duration_sec ? `${clip.duration_sec.toFixed(1)}s` : ''}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void copy(caption, 'caption')}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200 inline-flex items-center gap-1"
            title="Copy TikTok-ready caption (describe + hashtags)"
          >
            {copiedField === 'caption' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            Caption
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200 inline-flex items-center gap-1"
            title="Share (uses native share sheet on mobile)"
          >
            {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            Share
          </button>
          <a
            href={clip.output_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200 inline-flex items-center gap-1"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={clip.output_url || '#'}
            // Suggesting a filename helps the browser save the mp4 with a
            // useful name instead of a long Supabase storage hash. Falls back
            // to clip.id when no title.
            download={`${(clip.suggested_title || clip.id).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48)}.mp4`}
            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white inline-flex items-center gap-1 font-medium"
            title="Download as MP4 (right-click to choose a folder)"
          >
            <Download className="w-3.5 h-3.5" /> Save MP4
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Trigger a download for each ready clip in this job. Browsers throttle
 * simultaneous downloads, so we stagger them ~150ms apart and rely on the
 * <a download> filename suggestion to keep the names readable.
 */
function SaveAllButton({ clips }: { clips: Clip[] }) {
  const [busy, setBusy] = useState(false);

  function go() {
    if (!clips.length) return;
    setBusy(true);
    clips.forEach((c, idx) => {
      if (!c.output_url) return;
      const name = `${(c.suggested_title || c.id).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48)}.mp4`;
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = c.output_url!;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (idx === clips.length - 1) {
          // Reset the button state ~1s after the last download fires.
          setTimeout(() => setBusy(false), 1000);
        }
      }, idx * 150);
    });
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="px-3 py-1 rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5"
    >
      <Download className="w-3.5 h-3.5" /> {busy ? 'Starting downloads…' : `Save all (${clips.length})`}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    created:      { color: 'bg-gray-700 text-gray-200',      label: 'Queued' },
    transcribing: { color: 'bg-blue-900/40 text-blue-200',   label: 'Transcribing' },
    analyzing:    { color: 'bg-blue-900/40 text-blue-200',   label: 'Analyzing' },
    assembling:   { color: 'bg-blue-900/40 text-blue-200',   label: 'Assembling' },
    rendering:    { color: 'bg-amber-900/40 text-amber-200', label: 'Rendering' },
    complete:     { color: 'bg-green-900/40 text-green-200', label: '✓ Done' },
    failed:       { color: 'bg-red-900/40 text-red-200',     label: 'Failed' },
  };
  const m = map[status] || map.created;
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.color}`}>{m.label}</span>;
}
