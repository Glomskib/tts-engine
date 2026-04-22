'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, RefreshCw, GitCompareArrows, Copy, Check, Sparkles,
  AlertTriangle, Wand2, Scissors, Crown, Flame, Layers, X, Upload,
} from 'lucide-react';
import StatusPill from './StatusPill';
import { modeToWorkspaceLabel } from './WorkspaceSelector';
import type { Mode, RunStatus } from '@/lib/video-engine/types';
import { assignClipperLabels, clipperLabelText, type ClipperLabel } from '@/lib/video-engine/insights';

interface RenderedClip {
  id: string;
  candidate_id: string;
  template_key: string;
  cta_key: string | null;
  mode: Mode;
  status: 'queued' | 'rendering' | 'complete' | 'failed';
  output_url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  error_message: string | null;
  caption_text: string | null;
  hashtags: string[] | null;
  suggested_title: string | null;
  cta_suggestion: string | null;
  hook_line: string | null;
  alt_captions: string[] | null;
  copies_made: number | null;
  watermark: boolean;
  package_status: 'pending' | 'done' | 'failed' | 'skipped';
  regen_count: number;
  variant_of_id: string | null;
}

interface Candidate {
  id: string;
  start_sec: number;
  end_sec: number;
  text: string;
  hook_text: string | null;
  clip_type: string | null;
  score: number;
  rank: number | null;
  hook_strength: 'low' | 'med' | 'high' | null;
  suggested_use: string | null;
  selection_reason: string | null;
  best_for: string[] | null;
  score_breakdown_json: Record<string, number> | null;
}

interface RunDetailData {
  run: {
    id: string;
    mode: Mode;
    status: RunStatus;
    target_clip_count: number;
    preset_keys: string[];
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
    detected_intent: 'affiliate' | 'nonprofit' | 'unknown' | null;
    plan_id_at_run: string | null;
    watermark: boolean;
    product_name: string | null;
    product_url: string | null;
    product_platform: string | null;
    coupon_code: string | null;
  };
  asset: { storage_url: string; original_filename: string | null; duration_sec: number | null } | null;
  transcript: { language: string; full_text: string; duration_sec: number | null } | null;
  candidates: Candidate[];
  rendered: RenderedClip[];
}

export default function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState<Mode | null>(null);
  const [runAgainBusy, setRunAgainBusy] = useState(false);
  // Ordered list of clip ids the user has picked for "Combine into one video".
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [combineBusy, setCombineBusy] = useState(false);
  // User-selected "in-hero" clip; null means the top-ranked best clip is shown.
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  // Ephemeral coming-soon banner fired by QuickActionBar.
  const [iterateToast, setIterateToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleIterate(type: string) {
    console.log('[RunDetail] handleIterate', { type, run_id: runId });
    const clipId = activeClipId ?? data?.rendered?.find((r) => r.status === 'complete')?.id;
    if (!clipId) return;

    // "shorter", "aggressive", and "talking_head" map to the real per-clip
    // regenerate endpoint. Other actions don't have a server path yet — keep
    // the placeholder banner so we acknowledge the click without lying.
    const regenBody: { action: 'shorter' | 'aggressive' | 'restyle'; template_key?: string } | null =
      type === 'shorter'      ? { action: 'shorter' }
      : type === 'aggressive' ? { action: 'aggressive' }
      : type === 'talking_head' ? { action: 'restyle', template_key: 'clip_clean_talking_head' }
      : null;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    if (regenBody) {
      const toast =
        regenBody.action === 'shorter'  ? 'Cutting a tighter version…'
        : regenBody.action === 'restyle' ? 'Restyling as a clean talking-head…'
        : 'Making a punchier cut…';
      setIterateToast(toast);
      toastTimerRef.current = setTimeout(() => setIterateToast(null), 3200);
      try {
        const res = await fetch(`/api/video-engine/clips/${clipId}/regenerate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(regenBody),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          const msg = json?.error?.message || json?.error || 'Regenerate failed';
          setIterateToast(msg);
          toastTimerRef.current = setTimeout(() => setIterateToast(null), 3200);
        }
        // The polling loop picks up the new variant automatically.
      } catch (e) {
        console.warn('[RunDetail] regenerate POST failed', e);
        setIterateToast('Network error. Try again.');
        toastTimerRef.current = setTimeout(() => setIterateToast(null), 3200);
      }
      return;
    }

    setIterateToast('Coming soon — iteration launching this week');
    toastTimerRef.current = setTimeout(() => setIterateToast(null), 2600);
    try {
      await fetch('/api/video-engine/iterate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_id: runId, clip_id: clipId, type }),
      });
    } catch (e) {
      console.warn('[RunDetail] iterate POST failed', e);
    }
  }

  function toggleSelected(clipId: string) {
    setSelectedClipIds((prev) =>
      prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId],
    );
  }
  function clearSelected() { setSelectedClipIds([]); }

  async function combineSelected() {
    if (selectedClipIds.length < 2) return;
    setCombineBusy(true);
    try {
      const res = await fetch(`/api/video-engine/runs/${runId}/combine`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clip_ids: selectedClipIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Combine failed');
      clearSelected();
    } catch (e) {
      setIterateToast(e instanceof Error ? e.message : String(e));
    } finally {
      setCombineBusy(false);
    }
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    async function poll() {
      try {
        const res = await fetch(`/api/video-engine/runs/${runId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load run');
        if (!cancelled) {
          setData(json.data);
          setLoading(false);
          setErr(null);
          // Stop polling once run reaches a terminal state
          const status = json.data?.run?.status;
          if ((status === 'complete' || status === 'failed') && interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }
    void poll();
    interval = setInterval(() => { void poll(); }, 4000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [runId]);

  // One-click "Generate more clips from this" — reuses the same source asset
  // and creates a new run in the same mode, so the user doesn't have to
  // re-upload or re-configure anything. Navigates to the new run's page.
  async function runAgainFromSameSource() {
    if (runAgainBusy) return;
    setRunAgainBusy(true);
    try {
      const res = await fetch(`/api/video-engine/runs/${runId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Couldn’t start a new run.');
      const newId = json?.data?.run_id;
      if (!newId) throw new Error('Server didn’t return a run id.');
      router.push(`/video-engine/${newId}`);
    } catch (e) {
      setIterateToast(e instanceof Error ? e.message : 'Couldn’t start a new run.');
      setRunAgainBusy(false);
    }
  }

  async function regenerateInOtherMode() {
    if (!data) return;
    const otherMode: Mode = data.run.mode === 'affiliate' ? 'nonprofit' : 'affiliate';
    setRegenBusy(otherMode);
    try {
      const res = await fetch(`/api/video-engine/runs/${runId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: otherMode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Regenerate failed');
      router.push(`/video-engine/${runId}/compare`);
    } catch (e) {
      setIterateToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenBusy(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading run…</div>;
  }
  if (err || !data) {
    return <div className="text-red-400 text-sm">{err ?? 'No data'}</div>;
  }

  const { run, asset, candidates, rendered } = data;
  const isTerminal = run.status === 'complete' || run.status === 'failed';
  const isClipper = run.mode === 'clipper';
  const otherMode: Mode | null = isClipper
    ? null
    : run.mode === 'affiliate' ? 'nonprofit' : 'affiliate';
  // Clipper mode doesn't have a paired "opposite" — suppress the detect/mismatch nudge.
  const intentMismatch =
    !isClipper
    && run.detected_intent
    && run.detected_intent !== 'unknown'
    && run.detected_intent !== run.mode;
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const combinedClips = rendered.filter((r) => r.template_key === 'combined');
  const sourceClips = rendered.filter((r) => r.template_key !== 'combined');
  const ranked = rankRendered(sourceClips, candidateById);
  const best = ranked[0] ?? null;
  const alternates = ranked.slice(1);
  const completeBest = best && best.status === 'complete' ? best : null;
  // Every finished clip — drives the visible "Other versions" carousel.
  const completeClips = ranked.filter((r) => r.status === 'complete');
  // User's chosen hero clip falls back to the top-ranked best when unset.
  const activeClip =
    (activeClipId ? completeClips.find((r) => r.id === activeClipId) ?? null : null) ??
    completeBest;

  // Clipper distinct labels — "Best hook" / "Most engaging" / "Fast highlight" —
  // assigned across the top 3 clipper clips so the user never sees three identical
  // badges in the grid. Keyed by rendered-clip id (not candidate id) since the
  // UI binds to rendered clips; we translate through candidate_id → breakdown.
  const clipperLabels = new Map<string, ClipperLabel>();
  if (isClipper && completeClips.length > 0) {
    const topForLabels = completeClips.slice(0, 3);
    const labelInputs = topForLabels
      .map((rc) => {
        const cand = rc.candidate_id ? candidateById.get(rc.candidate_id) : null;
        if (!cand || !cand.score_breakdown_json) return null;
        return {
          id: rc.id,
          scoreBreakdown: cand.score_breakdown_json,
          durationSec: rc.duration_sec ?? (cand.end_sec - cand.start_sec),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    assignClipperLabels(labelInputs).forEach((v, k) => clipperLabels.set(k, v));
  }

  // In-progress / failed / edge states keep a minimal status view.
  if (!isTerminal || !completeBest) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            {asset?.original_filename ?? 'Your video'}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-500 flex-wrap">
            <StatusPill status={run.status} />
            <span>·</span>
            <span>{modeToWorkspaceLabel(run.mode)}</span>
          </div>
        </div>

        {intentMismatch && !isClipper && (
          <IntentMismatchBanner currentMode={run.mode} detected={run.detected_intent as Mode} />
        )}

        {run.error_message && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-sm text-red-300 space-y-1">
            <div className="font-medium">{humanizeRunError(run.error_message)}</div>
            <div className="text-xs text-red-400/70">Try uploading a different video or a shorter clip.</div>
          </div>
        )}

        {!isTerminal && <ProgressTrack status={run.status} rendered={rendered} />}

        {isTerminal && !completeBest && ranked.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-400">
            We couldn’t finish rendering a clip from this video. Try again from the home screen.
          </div>
        )}
      </div>
    );
  }

  // Clipper → grid-first, volume-first. Other modes → single hero.
  const hero = activeClip!;
  return (
    <div className="space-y-4 sm:space-y-6">
      {intentMismatch && !isClipper && (
        <IntentMismatchBanner currentMode={run.mode} detected={run.detected_intent as Mode} />
      )}

      {isClipper ? (
        <ClipperGrid
          clips={completeClips}
          labels={clipperLabels}
          candidateById={candidateById}
          selectedClipIds={selectedClipIds}
          onToggleSelect={toggleSelected}
          onClearSelected={clearSelected}
          onCombine={combineSelected}
          combineBusy={combineBusy}
        />
      ) : (
        <>
          <HeroClip
            clip={hero}
            candidate={hero.candidate_id ? candidateById.get(hero.candidate_id) ?? null : null}
            onIterate={handleIterate}
            mode={run.mode}
            completeCount={completeClips.length}
            allClipUrls={completeClips.map((c) => c.output_url).filter((u): u is string => !!u)}
            onUploadAnother={() => router.push('/video-engine')}
            onGenerateMore={runAgainFromSameSource}
            generateBusy={runAgainBusy}
            productName={run.product_name}
            productUrl={run.product_url}
            runId={run.id}
          />

          {completeClips.length > 1 && (
            <>
              <OtherVersions
                clips={completeClips}
                activeId={hero.id}
                candidateById={candidateById}
                onSelect={setActiveClipId}
                mode={run.mode}
              />
              <div className="mx-auto w-full max-w-md px-4 sm:px-0 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={runAgainFromSameSource}
                    disabled={runAgainBusy}
                    className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-100 text-sm sm:text-base font-medium min-h-[48px] px-4 disabled:opacity-60 transition-colors"
                  >
                    {runAgainBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Wand2 className="w-4 h-4 shrink-0" />}
                    <span>{runAgainBusy ? 'Starting a new run…' : 'Generate more clips from this one'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/video-engine')}
                    className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 text-sm sm:text-base font-medium min-h-[48px] px-4 transition-colors"
                  >
                    <Upload className="w-4 h-4 shrink-0" />
                    <span>Upload another video</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAllUrls(completeClips.map((c) => c.output_url).filter((u): u is string => !!u))}
                  className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-100 text-sm sm:text-base font-medium min-h-[48px] px-4 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Download all clips ({completeClips.length})</span>
                </button>
                <p className="text-center text-[11px] sm:text-xs text-zinc-500">
                  {completeClips.length} clips ready. Post one today — speed beats perfection.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* Power-user editor — kept for non-clipper modes (clipper already gets a grid-first view above). */}
      {!isClipper && alternates.length > 0 && (
        <details className="group rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-900 flex items-center justify-between">
            <span>Edit variations & combine</span>
            <span className="text-zinc-500 text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {alternates.map((rc) => (
                <RenderedClipCard
                  key={rc.id}
                  clip={rc}
                  candidate={rc.candidate_id ? candidateById.get(rc.candidate_id) ?? null : null}
                  selected={selectedClipIds.includes(rc.id)}
                  selectionIndex={selectedClipIds.indexOf(rc.id)}
                  onToggleSelect={toggleSelected}
                />
              ))}
            </div>
          </div>
        </details>
      )}

      {combinedClips.length > 0 && (
        <details className="group rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-900 flex items-center justify-between">
            <span>Your combined videos ({combinedClips.length})</span>
            <span className="text-zinc-500 text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 grid gap-4 grid-cols-1 sm:grid-cols-2">
            {combinedClips.map((rc) => (
              <CombinedClipCard key={rc.id} clip={rc} />
            ))}
          </div>
        </details>
      )}

      {asset?.storage_url && (
        <details className="group rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-900 flex items-center justify-between">
            <span>Show source video</span>
            <span className="text-zinc-500 text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2">
            <video src={asset.storage_url} controls preload="metadata" className="w-full max-h-72 rounded-lg bg-black" />
          </div>
        </details>
      )}

      <UpgradeNudges planId={run.plan_id_at_run} watermark={run.watermark} isClipper={isClipper} />

      {isClipper ? (
        <ClipperNextSourceBar runId={runId} watermark={run.watermark} />
      ) : (
        <div className="flex items-center justify-center gap-4 sm:gap-5 pt-1 sm:pt-2 text-xs text-zinc-500">
          <button
            type="button"
            onClick={regenerateInOtherMode}
            disabled={!!regenBusy || !otherMode}
            className="inline-flex items-center gap-1 hover:text-zinc-200 disabled:opacity-50"
          >
            {regenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Try as {otherMode ? modeToWorkspaceLabel(otherMode) : ''}
          </button>
          <Link
            href={`/video-engine/${runId}/compare`}
            className="inline-flex items-center gap-1 hover:text-zinc-200"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Compare versions
          </Link>
          {run.watermark && (
            <span className="inline-flex items-center gap-1 text-amber-300/70">
              <Crown className="w-3.5 h-3.5" /> Watermark on
            </span>
          )}
        </div>
      )}

      {!isClipper && selectedClipIds.length >= 1 && (
        <CombineActionBar
          count={selectedClipIds.length}
          busy={combineBusy}
          onCombine={combineSelected}
          onClear={clearSelected}
        />
      )}

      {iterateToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-3 text-sm text-zinc-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
          <span>{iterateToast}</span>
        </div>
      )}
    </div>
  );
}

function HeroClip({
  clip,
  candidate,
  onIterate,
  mode,
  completeCount,
  allClipUrls,
  onUploadAnother,
  onGenerateMore,
  generateBusy,
  productName,
  productUrl,
  runId,
}: {
  clip: RenderedClip;
  candidate: Candidate | null;
  onIterate: (action: string) => void;
  mode: Mode;
  completeCount: number;
  allClipUrls: string[];
  onUploadAnother: () => void;
  onGenerateMore: () => void;
  generateBusy: boolean;
  productName: string | null;
  productUrl: string | null;
  runId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [hookCopied, setHookCopied] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const isClipper = mode === 'clipper';

  // "Copy description + link" = what the creator pastes into TikTok / Reels.
  // When a product URL is attached, append it so it goes out together with
  // the caption in a single paste.
  const caption = clip.caption_text ?? '';
  const hashtagLine = clip.hashtags?.length ? clip.hashtags.map((h) => `#${h}`).join(' ') : '';
  const postText = [caption, hashtagLine, productUrl ?? ''].filter(Boolean).join('\n\n').trim();
  const hookText = (clip.hook_line ?? candidate?.hook_text ?? '').trim();
  const captionPreview = caption
    ? caption.replace(/\s+/g, ' ').trim().slice(0, 140)
    : '';
  const captionTruncated = caption.length > 140;

  // One-shot "Your clip is ready" fade-in the first time the user lands on the
  // terminal state for this run. Keyed by clip id so regenerated variants don't
  // re-trigger it, and persisted in sessionStorage so revisits stay quiet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `ve-ready-seen:${clip.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setShowReady(true);
    const t = setTimeout(() => setShowReady(false), 2200);
    return () => clearTimeout(t);
  }, [clip.id]);

  async function copyCaption() {
    if (!postText) return;
    try {
      await navigator.clipboard.writeText(postText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      trackClipCopy(clip.id);
    } catch { /* noop */ }
  }

  async function copyHook() {
    if (!hookText) return;
    try {
      await navigator.clipboard.writeText(hookText);
      setHookCopied(true);
      setTimeout(() => setHookCopied(false), 1600);
      trackClipCopy(clip.id);
    } catch { /* noop */ }
  }

  const downloadAll = () => downloadAllUrls(allClipUrls);

  const signals = confidenceSignals(candidate, isClipper);
  const hasProductUrl = !!productUrl;
  const hasHook = hookText.length > 0;

  return (
    <section className="space-y-4 sm:space-y-6">
      {showReady && (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-md flex items-center justify-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-500"
        >
          <Check className="w-4 h-4" />
          <span className="font-medium">
            We turned your video into {completeCount} {completeCount === 1 ? 'clip' : 'clips'}
          </span>
        </div>
      )}

      <header className="text-center space-y-2 sm:space-y-2.5">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          We turned your video into {completeCount} {completeCount === 1 ? 'clip' : 'clips'}
        </h1>
        <p className="mx-auto max-w-md text-sm sm:text-base text-zinc-400 leading-relaxed">
          {completeCount} {completeCount === 1 ? 'clip' : 'clips'} ready for TikTok, Reels, and Shorts. Pick one and post — upload more tomorrow.
        </p>
      </header>

      <div className="mx-auto w-full sm:max-w-sm">
        <div className="mb-2 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
            <Crown className="w-3 h-3" />
            Best performing version
          </span>
        </div>
        <p className="mb-2 text-center text-[11px] sm:text-xs text-zinc-500">
          Clips created: <span className="text-zinc-300 font-medium tabular-nums">{completeCount}</span>
          <span className="mx-1.5 text-zinc-700">·</span>
          Best version selected automatically
        </p>
        <div className="aspect-[9/16] max-h-[70vh] bg-black sm:rounded-2xl overflow-hidden sm:border sm:border-zinc-800 sm:shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          {clip.output_url ? (
            <video
              key={clip.id}
              src={clip.output_url}
              controls
              playsInline
              autoPlay
              muted
              loop
              preload="metadata"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
              No output
            </div>
          )}
        </div>
        {signals.length > 0 && (
          <div className="mt-3 sm:mt-4 space-y-1 text-center">
            {signals.map((line, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? 'text-sm sm:text-base font-medium text-zinc-100'
                    : 'text-xs sm:text-sm text-zinc-400'
                }
              >
                {line}
              </p>
            ))}
          </div>
        )}
        <p className="mt-3 text-center text-[12px] sm:text-[13px] font-medium text-amber-300/90">
          {completeCount} {completeCount === 1 ? 'chance' : 'chances'} to go viral — post one today. Speed beats perfection.
        </p>
      </div>

      <div className="mx-auto w-full max-w-md space-y-2.5 px-4 sm:px-0">
        <a
          href={clip.output_url ?? '#'}
          download
          className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 hover:bg-white active:bg-zinc-200 text-zinc-900 text-base font-semibold min-h-[52px] px-4 transition-colors"
        >
          <Download className="w-5 h-5 shrink-0" />
          <span>Download clip</span>
        </a>
        {allClipUrls.length > 1 && (
          <button
            type="button"
            onClick={downloadAll}
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-100 text-base font-medium min-h-[52px] px-4 transition-colors"
          >
            <Download className="w-5 h-5 shrink-0" />
            <span>Download all clips ({allClipUrls.length})</span>
          </button>
        )}

        <div>
          <button
            type="button"
            onClick={copyCaption}
            disabled={!postText}
            aria-live="polite"
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-100 text-base font-medium min-h-[52px] px-4 disabled:opacity-50 transition-colors"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-400 shrink-0" /> : <Copy className="w-5 h-5 shrink-0" />}
            <span>{copied ? 'Copied to clipboard' : hasProductUrl ? 'Copy description + product link' : 'Copy Caption + Hashtags'}</span>
          </button>
          {(hasHook || hasProductUrl) && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hasHook && (
                <button
                  type="button"
                  onClick={copyHook}
                  aria-live="polite"
                  className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 text-sm font-medium min-h-[48px] px-4 transition-colors"
                >
                  {hookCopied ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                  <span>{hookCopied ? 'Hook copied' : 'Copy hook'}</span>
                </button>
              )}
              {hasProductUrl && (
                <a
                  href={productUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClipCopy(clip.id)}
                  className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 text-sm font-medium min-h-[48px] px-4 transition-colors"
                >
                  <span>Open product link</span>
                </a>
              )}
            </div>
          )}
          {captionPreview ? (
            <p className="mt-2 px-1 text-[12px] sm:text-[13px] text-zinc-500 leading-snug line-clamp-2">
              “{captionPreview}{captionTruncated ? '…' : ''}”
            </p>
          ) : !postText && clip.package_status === 'pending' && clip.status !== 'failed' ? (
            <p className="mt-2 px-1 text-[12px] text-zinc-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Writing your caption…
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowTips((v) => !v)}
          aria-expanded={showTips}
          className="mx-auto flex items-center justify-center gap-1.5 text-xs sm:text-sm text-zinc-400 hover:text-zinc-200 min-h-[44px] px-3"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{showTips ? 'Hide posting tips' : 'Show posting tips'}</span>
        </button>
      </div>

      <QuickActionBar onIterate={onIterate} mode={mode} />

      <div className="mx-auto w-full max-w-md px-4 sm:px-0 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={generateBusy}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 text-zinc-100 text-sm sm:text-base font-medium min-h-[48px] px-4 disabled:opacity-60 transition-colors"
          >
            {generateBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Wand2 className="w-4 h-4 shrink-0" />}
            <span>{generateBusy ? 'Starting a new run…' : 'Generate more clips from this'}</span>
          </button>
          <button
            type="button"
            onClick={onUploadAnother}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-200 text-sm sm:text-base font-medium min-h-[48px] px-4 transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Upload another video</span>
          </button>
        </div>
        <ChangeProductLink runId={runId} currentName={productName} />
        <p className="text-center text-[11px] sm:text-xs text-zinc-500">
          {completeCount} {completeCount === 1 ? 'clip' : 'clips'} ready. Post → upload another → repeat.
        </p>
      </div>

      {showTips && (
        <div className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300 space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Posting tips</div>
          <ul className="space-y-2 leading-relaxed">
            <li>Post during your audience&rsquo;s peak window &mdash; the first 1&ndash;2 hours drive most of the reach.</li>
            <li>Paste the full caption including hashtags. They&rsquo;re part of the hook.</li>
            {isClipper ? (
              <li>Pin a comment linking the full source (podcast / stream / channel) so viewers can go deeper.</li>
            ) : (
              <li>Pin a comment with your link so it sits above the fold.</li>
            )}
            <li>Cross-post to Reels and Shorts the same day for free extra reach.</li>
          </ul>
          {(clip.suggested_title || clip.cta_suggestion || candidate?.hook_text) && (
            <div className="pt-3 border-t border-zinc-800 space-y-3">
              {candidate?.hook_text && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-0.5">Lead the caption with</div>
                  <div className="text-zinc-200 leading-relaxed">{candidate.hook_text}</div>
                </div>
              )}
              {clip.suggested_title && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-0.5">Suggested title</div>
                  <div className="text-zinc-200">{clip.suggested_title}</div>
                </div>
              )}
              {clip.cta_suggestion && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-0.5">On-screen CTA</div>
                  <div className="text-zinc-200">{clip.cta_suggestion}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function QuickActionBar({
  onIterate,
  mode,
}: {
  onIterate: (type: string) => void;
  mode: Mode;
}) {
  const isClipper = mode === 'clipper';
  const actions: Array<{ key: string; label: string }> = isClipper
    ? [
        { key: 'shorter',           label: 'Tighter cut' },
        { key: 'stronger_hook',     label: 'Stronger hook' },
        { key: 'cleaner_captions',  label: 'Cleaner captions' },
        { key: 'talking_head',      label: 'Clean talking-head' },
        { key: 'generate_3_more',   label: 'Find 3 more moments' },
      ]
    : [
        { key: 'shorter',          label: 'Make shorter' },
        { key: 'stronger_hook',    label: 'Stronger hook' },
        { key: 'aggressive',       label: 'More aggressive cuts' },
        { key: 'generate_3_more',  label: 'Generate 3 more versions' },
      ];
  return (
    <div className="mx-auto max-w-md">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 px-1 mb-1.5">
        {isClipper ? 'Quick iterate' : 'Quick changes'}
      </div>
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-2 overflow-x-auto flex-nowrap scrollbar-hide py-0.5">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onIterate(a.key)}
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3.5 py-1.5 transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Clipper-mode grid view. Volume-first: every complete clip rendered into a
 * scannable grid so a clipper can triage 5–8 cuts in seconds. No hero, no
 * storytelling, no "best first then everything else" — just the whole batch
 * with per-clip hook strength + engagement + timestamp origin + select-to-
 * combine, plus a batch bar at the top for Download All / Copy All Captions
 * / Combine Selected.
 */
function ClipperGrid({
  clips,
  labels,
  candidateById,
  selectedClipIds,
  onToggleSelect,
  onClearSelected,
  onCombine,
  combineBusy,
}: {
  clips: RenderedClip[];
  labels: Map<string, ClipperLabel>;
  candidateById: Map<string, Candidate>;
  selectedClipIds: string[];
  onToggleSelect: (clipId: string) => void;
  onClearSelected: () => void;
  onCombine: () => void;
  combineBusy: boolean;
}) {
  const [bulkCopied, setBulkCopied] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  if (clips.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-400">
        No clips finished rendering from this source. Try another upload.
      </div>
    );
  }

  async function copyAllCaptions() {
    const blocks = clips.map((c, i) => {
      const cand = c.candidate_id ? candidateById.get(c.candidate_id) : null;
      const ts = cand ? formatTimestamp(cand.start_sec) : null;
      const header = `Clip ${i + 1}${ts ? ` · ${ts}` : ''}`;
      const hashtagLine = c.hashtags?.length ? c.hashtags.map((h) => `#${h}`).join(' ') : '';
      return [header, c.caption_text ?? '', hashtagLine].filter(Boolean).join('\n');
    });
    const text = blocks.join('\n\n—\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 1800);
    } catch { /* noop */ }
  }

  async function downloadAll() {
    setDownloadingAll(true);
    try {
      for (let i = 0; i < clips.length; i++) {
        const url = clips[i].output_url;
        if (!url) continue;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 450)); // browsers throttle rapid sequential downloads
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  const selectedCount = selectedClipIds.length;

  return (
    <section className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-50 tracking-tight">
            {clips.length} clips ready
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-zinc-400">
            Ranked by hook strength + retention. Grab the ones you want, combine the rest, keep clipping.
          </p>
        </div>
        <span className="text-[11px] text-zinc-500">Different hook · different cut · different pacing</span>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadAll}
          disabled={downloadingAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold px-3 py-2 disabled:opacity-60"
        >
          {downloadingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {downloadingAll ? 'Downloading…' : `Download all (${clips.length})`}
        </button>
        <button
          type="button"
          onClick={copyAllCaptions}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-medium px-3 py-2"
        >
          {bulkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {bulkCopied ? 'Copied all captions' : 'Copy all captions'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-[11px] text-zinc-400">{selectedCount} selected</span>
              <button
                type="button"
                onClick={onClearSelected}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 text-[11px] px-2 py-1.5"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
              <button
                type="button"
                onClick={onCombine}
                disabled={combineBusy || selectedCount < 2}
                title={selectedCount < 2 ? 'Pick at least two clips to combine' : 'Stitch selected clips into one reel'}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/40 text-white text-xs font-semibold px-3 py-1.5"
              >
                {combineBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                Combine {selectedCount}
              </button>
            </>
          )}
          {selectedCount === 0 && (
            <span className="text-[11px] text-zinc-500">Tap <Layers className="inline w-3 h-3 -mt-0.5" /> on a clip to combine</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip, i) => {
          const cand = clip.candidate_id ? candidateById.get(clip.candidate_id) ?? null : null;
          return (
            <ClipperGridTile
              key={clip.id}
              clip={clip}
              candidate={cand}
              rank={i + 1}
              label={labels.get(clip.id) ?? null}
              selected={selectedClipIds.includes(clip.id)}
              selectionIndex={selectedClipIds.indexOf(clip.id)}
              onToggleSelect={() => onToggleSelect(clip.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ClipperGridTile({
  clip,
  candidate,
  rank,
  label,
  selected,
  selectionIndex,
  onToggleSelect,
}: {
  clip: RenderedClip;
  candidate: Candidate | null;
  rank: number;
  label: ClipperLabel | null;
  selected: boolean;
  selectionIndex: number;
  onToggleSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const labelText = clipperLabelText(label);
  const hookLabel = hookStrengthLabel(candidate?.hook_strength ?? null);
  const engagementLabel = engagementLabelFor(candidate?.best_for ?? null);
  const originTs = candidate ? formatTimestamp(candidate.start_sec) : null;

  const postText = [
    clip.caption_text,
    '',
    clip.hashtags?.length ? clip.hashtags.map((h) => `#${h}`).join(' ') : '',
  ].filter((line) => line !== undefined).join('\n').trim();

  async function copyCaption() {
    if (!postText) return;
    try {
      await navigator.clipboard.writeText(postText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* noop */ }
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col transition-shadow ${
        selected
          ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.45)] bg-zinc-950'
          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
      }`}
    >
      <div className="relative aspect-[9/16] bg-black">
        {clip.output_url ? (
          <video
            src={clip.output_url}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
            No output
          </div>
        )}
        <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center justify-center rounded-full bg-zinc-900/85 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">
          #{rank}
        </span>
        {labelText && (
          <span className="pointer-events-none absolute top-1.5 right-10 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200 uppercase tracking-wide">
            {labelText}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? `Remove clip ${rank} from combine selection` : `Select clip ${rank} to combine`}
          title={selected ? 'Selected for combine' : 'Select for combine'}
          className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center rounded-full w-7 h-7 text-[10px] font-semibold border transition-colors ${
            selected
              ? 'bg-blue-500 border-blue-400 text-white'
              : 'bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          {selected ? selectionIndex + 1 : <Layers className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="p-2.5 space-y-2 text-[11px] flex-1 flex flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          {hookLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/40 bg-emerald-500/10 text-emerald-200 px-1.5 py-0.5 text-[10px] font-medium">
              {hookLabel}
            </span>
          )}
          {engagementLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-700/40 bg-violet-500/10 text-violet-200 px-1.5 py-0.5 text-[10px] font-medium">
              {engagementLabel}
            </span>
          )}
          {originTs && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 px-1.5 py-0.5 text-[10px] font-mono">
              @ {originTs}
            </span>
          )}
          <span className="ml-auto text-zinc-500">
            {clip.duration_sec ? `${clip.duration_sec.toFixed(0)}s` : ''}
          </span>
        </div>

        {clip.caption_text && (
          <p className="text-zinc-300 leading-snug line-clamp-3">{clip.caption_text}</p>
        )}

        <div className="grid grid-cols-2 gap-1.5 mt-auto pt-1">
          <a
            href={clip.output_url ?? '#'}
            download
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-[11px] font-semibold px-2 py-1.5"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            MP4
          </a>
          <button
            type="button"
            onClick={copyCaption}
            disabled={!postText}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-[11px] font-medium px-2 py-1.5 disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function hookStrengthLabel(s: 'low' | 'med' | 'high' | null): string | null {
  if (!s) return null;
  return s === 'high' ? 'High hook' : s === 'med' ? 'Medium hook' : 'Soft hook';
}

function engagementLabelFor(bestFor: string[] | null): string | null {
  const intent = primaryIntent(bestFor);
  if (!intent) return null;
  return intent === 'engagement' ? 'High engagement'
    : intent === 'awareness'    ? 'Awareness'
    : intent === 'conversion'   ? 'Conversion'
    : null;
}

function OtherVersions({
  clips,
  activeId,
  candidateById,
  onSelect,
  mode,
  rankOffset,
  title: titleOverride,
  subhead: subheadOverride,
}: {
  clips: RenderedClip[];
  activeId: string;
  candidateById: Map<string, Candidate>;
  onSelect: (id: string) => void;
  mode: Mode;
  /** Starting rank number for the first thumb. Defaults to 2 (hero is #1). */
  rankOffset?: number;
  title?: string;
  subhead?: string;
}) {
  const isClipper = mode === 'clipper';
  const otherCount = clips.filter((c) => c.id !== activeId).length;

  // For clipper mode split by candidate_id: different candidate_id = different
  // *moment*, same candidate_id = a variant of a moment the user already saw.
  const heroClip = clips.find((c) => c.id === activeId);
  const heroCandidateId = heroClip?.candidate_id ?? null;
  const moments = isClipper
    ? clips.filter((c) => c.candidate_id && c.candidate_id !== heroCandidateId)
    : clips.filter((c) => c.id !== activeId);

  const displayCount = isClipper ? moments.length : otherCount;
  const title = titleOverride ?? (isClipper ? 'Other moments from this video' : `More clips you can post (${displayCount})`);
  const subhead = subheadOverride ?? (isClipper
    ? 'Each one is a different clip opportunity — ranked by score'
    : 'Each one is another chance to hit — post consistently');
  const startRank = rankOffset ?? 2;

  if (moments.length === 0) return null;
  return (
    <section className="space-y-2 sm:space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
          {subhead && <p className="text-[11px] text-zinc-500 mt-0.5">{subhead}</p>}
        </div>
        <span className="text-[11px] text-zinc-500">{isClipper ? moments.length : otherCount}</span>
      </div>
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-3 overflow-x-auto flex-nowrap snap-x snap-mandatory pb-2 scrollbar-hide">
          {moments.map((c, i) => {
            const isActive = c.id === activeId;
            const cand = c.candidate_id ? candidateById.get(c.candidate_id) ?? null : null;
            const rankNum = isClipper ? i + startRank : null; // hero is #1; offset lets "extra moments" start at #4
            const subtitle = isClipper
              ? [cand?.suggested_use, c.duration_sec ? `${c.duration_sec.toFixed(0)}s` : null]
                  .filter(Boolean).join(' · ')
              : [friendlyTemplateLabel(c.template_key), c.duration_sec ? `${c.duration_sec.toFixed(0)}s` : null]
                  .filter(Boolean).join(' · ');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                aria-pressed={isActive}
                aria-label={isClipper ? `Show moment ${rankNum}` : `Show ${c.template_key} version`}
                className={`group shrink-0 snap-start text-left w-32 sm:w-36 transition-transform ${
                  isActive ? '' : 'hover:-translate-y-0.5'
                }`}
              >
                <div
                  className={`relative aspect-[9/16] rounded-lg overflow-hidden bg-black border transition-colors ${
                    isActive ? 'border-emerald-500/70 ring-2 ring-emerald-500/40' : 'border-zinc-800 group-hover:border-zinc-600'
                  }`}
                >
                  {c.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : c.output_url ? (
                    <video
                      src={c.output_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
                      preview
                    </div>
                  )}
                  {rankNum !== null && !isActive && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-200">
                      #{rankNum}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-950">
                      <Check className="w-2.5 h-2.5" /> Viewing
                    </span>
                  )}
                  {c.output_url && (
                    <a
                      href={c.output_url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Download this clip"
                      className="absolute bottom-1.5 right-1.5 inline-flex items-center justify-center rounded-full bg-zinc-900/90 border border-zinc-700 w-7 h-7 text-zinc-100 hover:bg-zinc-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <div className="mt-1.5 text-[11px] text-zinc-300 truncate">
                  {subtitle || 'Clip'}
                </div>
                {cand?.hook_strength === 'high' && (
                  <div className="text-[10px] text-emerald-400/90">Strong hook</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Rank rendered clips into a "best first" order. The strongest is shown as the
 * Recommended hero; the rest fall under Alternates. Ranking rule:
 *   1. Status: complete > rendering > queued > failed
 *   2. Candidate score (higher wins)
 *   3. Hook strength: high(2) > med(1) > low/null(0)
 *   4. Shorter duration breaks ties (more post-ready)
 */
/**
 * Short, confident lines shown under the hero clip. Derived from the selected
 * candidate's score breakdown when available so the wording reflects *why* this
 * moment beat the others. Falls back to generic-but-positive copy when the
 * breakdown is missing (older runs, analyze-stage failures, etc.). Returns at
 * most two lines; the first is stronger and rendered as the lead.
 */
function confidenceSignals(candidate: Candidate | null, isClipper: boolean): string[] {
  const lines: string[] = [];
  const hook = candidate?.hook_strength;
  const breakdown = candidate?.score_breakdown_json ?? null;
  const hookScore = breakdown?.hookStrength ?? 0;
  const emo = breakdown?.emotionalIntensity ?? 0;
  const ret = breakdown?.retentionPotential ?? 0;
  const spec = breakdown?.specificity ?? 0;

  if (hook === 'high' || hookScore >= 0.8) {
    lines.push('This moment had the strongest hook');
  } else if (hook === 'med' || hookScore >= 0.4) {
    lines.push('Strong opening from your video');
  }

  if (emo + ret >= 0.9) {
    lines.push('Highest engagement potential from your video');
  } else if (spec >= 0.5) {
    lines.push('Lands with specific, memorable language');
  }

  if (lines.length === 0) {
    lines.push(isClipper ? 'Top-ranked moment from your video' : 'Your best moment, cut and ready');
    lines.push('Optimized for hook and retention');
  }
  return lines.slice(0, 2);
}

/** Convert raw pipeline error strings into user-friendly messages. */
function humanizeRunError(raw: string): string {
  if (raw.includes('No speech detected')) return raw; // already friendly
  if (raw.includes('too long for transcription')) return raw; // already friendly
  if (raw.includes('OPENAI_API_KEY')) return 'Our transcription service is temporarily unavailable. Please try again later.';
  if (raw.includes('Failed to download asset')) return 'We couldn\u2019t access your uploaded video. Try uploading again.';
  if (raw.includes('ffmpeg') || raw.includes('Audio extraction')) return 'We had trouble processing your video\u2019s audio. Try a different file format (MP4 works best).';
  if (raw.includes('Scoring produced zero candidates')) return 'We couldn\u2019t find any usable clips in this video. Try a longer video with more spoken content.';
  if (raw.includes('No selected candidates')) return 'No strong moments found. Try a video with clearer hooks or talking points.';
  if (raw.includes('Shotstack') || raw.includes('render failed')) return 'Clip rendering failed. Our team has been notified. Please try again.';
  if (raw.includes('duplicate key')) return 'This video was already processed. Check your previous results.';
  if (raw.length > 120) return 'Something went wrong processing your video. Please try again with a different file.';
  return raw;
}

function rankRendered(
  rendered: RenderedClip[],
  candidateById: Map<string, Candidate>,
): RenderedClip[] {
  const statusRank = (s: RenderedClip['status']) =>
    s === 'complete' ? 3 : s === 'rendering' ? 2 : s === 'queued' ? 1 : 0;
  const hookRank = (h: Candidate['hook_strength']) =>
    h === 'high' ? 2 : h === 'med' ? 1 : 0;

  return [...rendered].sort((a, b) => {
    const sa = statusRank(a.status);
    const sb = statusRank(b.status);
    if (sa !== sb) return sb - sa;
    const ca = a.candidate_id ? candidateById.get(a.candidate_id) : null;
    const cb = b.candidate_id ? candidateById.get(b.candidate_id) : null;
    const scoreA = ca?.score ?? 0;
    const scoreB = cb?.score ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const ha = hookRank(ca?.hook_strength ?? null);
    const hb = hookRank(cb?.hook_strength ?? null);
    if (ha !== hb) return hb - ha;
    const da = a.duration_sec ?? 999;
    const db = b.duration_sec ?? 999;
    return da - db;
  });
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ProgressTrack({ status, rendered }: { status: RunStatus; rendered: RenderedClip[] }) {
  const stages: Array<{ key: RunStatus; label: string; live: string }> = [
    { key: 'created',      label: 'Queued',       live: 'Queued — starting up…' },
    { key: 'transcribing', label: 'Analyzing',    live: 'Analyzing your video…' },
    { key: 'analyzing',    label: 'Best moments', live: 'Finding best moments…' },
    { key: 'assembling',   label: 'Building',     live: 'Building clips…' },
    { key: 'rendering',    label: 'Rendering',    live: 'Rendering final versions…' },
  ];
  const idx = stages.findIndex((s) => s.key === status);
  const packagingPending = rendered.filter((r) => r.package_status === 'pending').length;
  const rendersDone = rendered.filter((r) => r.status === 'complete').length;
  const activeStage = idx >= 0 ? stages[idx] : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      {activeStage && (
        <div className="mb-2.5 flex items-center gap-2 text-sm text-zinc-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>{activeStage.live}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {stages.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={s.key} className="flex-1">
              <div className={`h-1.5 rounded-full ${done ? 'bg-emerald-500' : active ? 'bg-blue-500 animate-pulse' : 'bg-zinc-800'}`} />
              <div className={`mt-1.5 text-[10px] uppercase tracking-wide ${done ? 'text-emerald-500' : active ? 'text-blue-400' : 'text-zinc-600'}`}>{s.label}</div>
            </div>
          );
        })}
      </div>
      {status === 'rendering' && (
        <div className="mt-3 text-xs text-zinc-400 flex items-center gap-3">
          <span>Renders: {rendersDone}/{rendered.length || '?'}</span>
          {packagingPending > 0 && <span>· Writing captions for {packagingPending} more…</span>}
        </div>
      )}
    </div>
  );
}

// Pick the dominant intent from best_for[]. Priority: conversion > engagement >
// awareness, so the most action-oriented signal wins when multiple apply.
function primaryIntent(bestFor: string[] | null | undefined): 'conversion' | 'engagement' | 'awareness' | null {
  if (!bestFor || bestFor.length === 0) return null;
  if (bestFor.includes('conversion')) return 'conversion';
  if (bestFor.includes('engagement')) return 'engagement';
  if (bestFor.includes('awareness')) return 'awareness';
  return null;
}

function IntentBadge({ bestFor }: { bestFor: string[] | null }) {
  const intent = primaryIntent(bestFor);
  if (!intent) return null;
  const map = {
    conversion: 'bg-blue-500/15 text-blue-200 border-blue-700/40',
    engagement: 'bg-violet-500/15 text-violet-200 border-violet-700/40',
    awareness:  'bg-sky-500/15 text-sky-200 border-sky-700/40',
  } as const;
  const label = { conversion: 'Conversion', engagement: 'Engagement', awareness: 'Awareness' }[intent];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[intent]}`}>
      Intent: {label}
    </span>
  );
}

function IntentMismatchBanner({ currentMode, detected }: { currentMode: Mode; detected: Mode }) {
  const currentLabel = modeToWorkspaceLabel(currentMode);
  const detectedLabel = modeToWorkspaceLabel(detected);
  return (
    <div className="rounded-lg border border-blue-900/50 bg-blue-950/30 px-3 py-2.5 text-sm text-blue-200 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-blue-300" />
      <div className="flex-1">
        <div className="font-medium">Heads up: this looks more like a {detectedLabel} video.</div>
        <div className="text-xs text-blue-300/80 mt-0.5">
          You picked {currentLabel}. The transcript leans the other way — try
          re-running as {detectedLabel} for clips that match the content&rsquo;s intent.
        </div>
      </div>
    </div>
  );
}

function UpgradeNudge({ text, cta }: { text: string; cta: string }) {
  return (
    <Link
      href="/upgrade"
      className="block rounded-lg border border-amber-900/50 bg-gradient-to-r from-amber-950/40 to-amber-900/20 px-3 py-2.5 text-sm hover:from-amber-950/60 hover:to-amber-900/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-200">
          <Sparkles className="w-4 h-4" />
          {text}
        </div>
        <span className="text-amber-100 font-medium text-xs">{cta} →</span>
      </div>
    </Link>
  );
}

/**
 * Stacks the three monetization nudges based on the run's snapshotted plan.
 * Anything Creator-tier or higher is already past these limits, so we render
 * nothing for them.
 */
function UpgradeNudges({
  planId,
  watermark,
  isClipper = false,
}: {
  planId: string | null;
  watermark: boolean;
  isClipper?: boolean;
}) {
  const isFreeOrStarter = !planId || planId === 'payg' || planId === 've_starter';
  const showWatermark = watermark;
  if (!isFreeOrStarter && !showWatermark) return null;

  const clipCountText = isClipper
    ? 'Unlock 6 moments per source (you\u2019re capped at 3).'
    : 'Unlock 6 clips per upload (you\u2019re capped at 3).';
  const volumeText = isClipper
    ? 'Clipping daily? Get more sources per month.'
    : 'Need more uploads this month?';

  return (
    <div className="space-y-2">
      {showWatermark && (
        <UpgradeNudge text="Remove the “Made with FlashFlow” watermark." cta="Upgrade to Creator ($49/mo)" />
      )}
      {isFreeOrStarter && (
        <UpgradeNudge text={clipCountText} cta="Get Creator →" />
      )}
      {isFreeOrStarter && (
        <UpgradeNudge text={volumeText} cta="See plans →" />
      )}
    </div>
  );
}

/**
 * Clipper-mode bottom bar. Replaces the product-lane "Try as X / Compare" row.
 * Goal: make "upload another source" the obvious next step so the lane feels
 * built for repeat use.
 */
function ClipperNextSourceBar({
  runId,
  watermark,
}: {
  runId: string;
  watermark: boolean;
}) {
  return (
    <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-zinc-400">
        <div className="text-zinc-200 font-medium text-sm">Done with this source?</div>
        <div className="mt-0.5">Clip another podcast, stream, or long-form video — same lane, same settings.</div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/video-engine?lane=clipper"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold px-3 py-2"
        >
          <Upload className="w-3.5 h-3.5" />
          Clip another video
        </Link>
      </div>
      {watermark && (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/70">
          <Crown className="w-3 h-3" /> Watermark on
        </span>
      )}
    </div>
  );
}

function ConfidenceBadge({ strength }: { strength: 'low' | 'med' | 'high' | null }) {
  if (!strength) return null;
  const map = {
    high: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/40',
    med:  'bg-amber-500/15 text-amber-300 border-amber-700/40',
    low:  'bg-zinc-700/30 text-zinc-400 border-zinc-700/50',
  } as const;
  const label = { high: 'High confidence', med: 'Medium confidence', low: 'Lower confidence' }[strength];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[strength]}`}>
      {label}
    </span>
  );
}

function RenderedClipCard({
  clip,
  candidate,
  featured = false,
  selected = false,
  selectionIndex = -1,
  onToggleSelect,
}: {
  clip: RenderedClip;
  candidate: Candidate | null;
  featured?: boolean;
  selected?: boolean;
  selectionIndex?: number;
  onToggleSelect?: (clipId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch { /* noop */ }
  }

  async function regen(action: 'redo' | 'shorter' | 'restyle' | 'aggressive', template_key?: string) {
    setRegenBusy(action);
    try {
      const res = await fetch(`/api/video-engine/clips/${clip.id}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, template_key }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Regenerate failed');
      // The polling loop in RunDetail will pick up the new variant automatically.
    } catch (e) {
      console.error('[RunDetail] clip regen failed:', e);
    } finally {
      setRegenBusy(null);
    }
  }

  const fullCaption = [clip.caption_text, clip.hashtags?.length ? clip.hashtags.map((h) => `#${h}`).join(' ') : '']
    .filter(Boolean).join('\n\n');

  const canSelect = clip.status === 'complete' && !!onToggleSelect;
  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col transition-shadow ${
      selected
        ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.45)] bg-zinc-950'
        : featured
          ? 'border-emerald-700/40 bg-emerald-950/20 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
          : 'border-zinc-800 bg-zinc-950'
    }`}>
      <div className={`bg-black flex items-center justify-center relative ${featured ? 'aspect-video sm:aspect-[9/16] sm:max-h-[520px] sm:mx-auto' : 'aspect-[9/16]'}`}>
        {canSelect && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect!(clip.id); }}
            aria-pressed={selected}
            aria-label={selected ? `Remove from combined video (position ${selectionIndex + 1})` : 'Add to combined video'}
            className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center rounded-full w-8 h-8 text-xs font-semibold border transition-colors ${
              selected
                ? 'bg-blue-500 border-blue-400 text-white'
                : 'bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {selected ? selectionIndex + 1 : <Layers className="w-3.5 h-3.5" />}
          </button>
        )}
        {clip.status === 'complete' && clip.output_url ? (
          <video src={clip.output_url} controls preload="metadata" className="w-full h-full object-contain" />
        ) : clip.status === 'failed' ? (
          <div className="text-red-400 text-xs px-3 text-center">Render failed</div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
            {clip.status}…
          </div>
        )}
        {clip.variant_of_id && (
          <span className="absolute top-2 left-2 rounded-full bg-zinc-900/80 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300">
            variant
          </span>
        )}
      </div>

      <div className="p-3 space-y-3 text-xs flex-1 flex flex-col">
        <div className="flex items-center justify-between text-zinc-300">
          <span className="font-medium">{friendlyTemplateLabel(clip.template_key)}</span>
          <span className="text-zinc-500">{clip.duration_sec ? `${clip.duration_sec.toFixed(1)}s` : ''}</span>
        </div>

        {(candidate?.hook_strength || (candidate?.best_for && candidate.best_for.length > 0)) && (
          <div className="flex items-center gap-2 flex-wrap">
            <ConfidenceBadge strength={candidate?.hook_strength ?? null} />
            <IntentBadge bestFor={candidate?.best_for ?? null} />
            {candidate?.suggested_use && (
              <span className="text-zinc-400">{candidate.suggested_use}</span>
            )}
          </div>
        )}

        {candidate?.selection_reason && (
          <div className="text-zinc-500 italic leading-relaxed">{candidate.selection_reason}</div>
        )}

        {clip.package_status === 'pending' && clip.status !== 'failed' && (
          <div className="text-zinc-600 text-[11px] flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating caption + hashtags…
          </div>
        )}

        {clip.caption_text && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Caption</span>
              <button
                onClick={() => copy(fullCaption, 'cap')}
                className="text-zinc-400 hover:text-zinc-100"
                title="Copy caption + hashtags"
              >
                {copied === 'cap' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-zinc-200 leading-relaxed whitespace-pre-line">{clip.caption_text}</div>
            {clip.hashtags && clip.hashtags.length > 0 && (
              <div className="text-blue-300/80 text-[11px]">
                {clip.hashtags.map((h) => `#${h}`).join(' ')}
              </div>
            )}
          </div>
        )}

        {clip.suggested_title && (
          <div className="flex items-start justify-between gap-2 text-zinc-300">
            <div>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">Title</span>
              {clip.suggested_title}
            </div>
            <button
              onClick={() => copy(clip.suggested_title!, 'title')}
              className="text-zinc-400 hover:text-zinc-100 mt-3.5"
            >
              {copied === 'title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {clip.cta_suggestion && (
          <div className="flex items-start justify-between gap-2 text-zinc-300">
            <div>
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">On-screen CTA</span>
              {clip.cta_suggestion}
            </div>
            <button
              onClick={() => copy(clip.cta_suggestion!, 'cta')}
              className="text-zinc-400 hover:text-zinc-100 mt-3.5"
            >
              {copied === 'cta' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {clip.error_message && <div className="text-red-400 text-[11px]">{clip.error_message}</div>}

        {clip.status === 'complete' && (
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/70 -mx-3 px-3 mt-auto">
            <a
              href={clip.output_url ?? '#'}
              download
              className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100 text-[11px]"
            >
              <Download className="w-3.5 h-3.5" /> MP4
            </a>
            <div className="flex gap-1.5">
              <button
                onClick={() => regen('shorter')}
                disabled={!!regenBusy}
                title="Trim 25% off the end and re-render"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                {regenBusy === 'shorter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
                Make shorter
              </button>
              <button
                onClick={() => regen('aggressive')}
                disabled={!!regenBusy}
                title="Snap to the strongest hook and tighten to ~12s"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                {regenBusy === 'aggressive' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flame className="w-3 h-3" />}
                Punchier
              </button>
              <button
                onClick={() => regen('redo')}
                disabled={!!regenBusy}
                title="Re-render the same clip"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                {regenBusy === 'redo' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Regenerate
              </button>
              <button
                onClick={() => regen('restyle', otherStyleKey(clip.template_key, clip.mode))}
                disabled={!!regenBusy}
                title="Apply a different style template"
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              >
                {regenBusy === 'restyle' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Try different style
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CombinedClipCard({ clip }: { clip: RenderedClip }) {
  const isRendering = clip.status === 'queued' || clip.status === 'rendering';
  return (
    <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 overflow-hidden flex flex-col">
      <div className="aspect-[9/16] bg-black flex items-center justify-center relative">
        {clip.status === 'complete' && clip.output_url ? (
          <video src={clip.output_url} controls preload="metadata" className="w-full h-full object-contain" />
        ) : clip.status === 'failed' ? (
          <div className="text-red-400 text-xs px-3 text-center">Combine failed</div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
            {isRendering ? 'Stitching your clips…' : `${clip.status}…`}
          </div>
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-blue-500/20 border border-blue-400/40 px-2 py-0.5 text-[10px] font-medium text-blue-200">
          <Layers className="w-3 h-3" /> Combined
        </span>
      </div>
      <div className="p-3 flex items-center justify-between text-xs">
        <span className="text-zinc-400">
          {clip.duration_sec ? `${clip.duration_sec.toFixed(1)}s` : ''}
        </span>
        {clip.status === 'complete' && clip.output_url && (
          <a
            href={clip.output_url}
            download
            className="inline-flex items-center gap-1 text-zinc-200 hover:text-white"
          >
            <Download className="w-3.5 h-3.5" /> MP4
          </a>
        )}
        {clip.error_message && <span className="text-red-400 text-[11px]">{clip.error_message}</span>}
      </div>
    </div>
  );
}

function CombineActionBar({
  count,
  busy,
  onCombine,
  onClear,
}: {
  count: number;
  busy: boolean;
  onCombine: () => void;
  onClear: () => void;
}) {
  const canCombine = count >= 2 && count <= 8 && !busy;
  const hint = count < 2 ? 'Pick one more clip to combine' : count > 8 ? 'Max 8 clips' : `Stitch ${count} clips in order`;
  return (
    <div className="sticky bottom-3 z-20 mt-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-blue-700/50 bg-zinc-950/95 backdrop-blur px-3 py-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-2">
        <div className="inline-flex items-center justify-center rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-200 text-xs w-7 h-7 font-semibold">
          {count}
        </div>
        <div className="flex-1 text-xs text-zinc-300">
          <div className="font-medium text-zinc-100">{count} selected</div>
          <div className="text-zinc-500 text-[11px]">{hint}</div>
        </div>
        <button
          onClick={onClear}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-800 hover:bg-zinc-900 w-8 h-8 text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={onCombine}
          disabled={!canCombine}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-3 py-1.5"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
          Combine
        </button>
      </div>
    </div>
  );
}

const STYLE_CYCLE: Record<string, string[]> = {
  affiliate: ['aff_tiktok_shop', 'aff_ugc_review', 'aff_talking_head'],
  nonprofit: ['np_event_recap', 'np_join_us', 'np_why_this_matters', 'np_sponsor_highlight', 'np_testimonial'],
  clipper: ['clip_viral_moment', 'clip_fast_highlight', 'clip_educational_cut', 'clip_clean_talking_head'],
};

// Template keys are machine identifiers. We surface human labels in the UI so
// a clipper never sees "clip_viral_moment" in a card header.
const FRIENDLY_TEMPLATE_LABELS: Record<string, string> = {
  clip_viral_moment:       'Viral moment',
  clip_fast_highlight:     'Fast highlight',
  clip_educational_cut:    'Educational cut',
  clip_clean_talking_head: 'Clean talking-head',
  aff_tiktok_shop:   'TikTok Shop',
  aff_ugc_review:    'UGC review',
  aff_talking_head:  'Talking head',
  np_event_recap:        'Event recap',
  np_join_us:            'Join us',
  np_why_this_matters:   'Why this matters',
  np_sponsor_highlight:  'Sponsor highlight',
  np_testimonial:        'Testimonial',
  combined:              'Combined reel',
};
function friendlyTemplateLabel(key: string): string {
  return FRIENDLY_TEMPLATE_LABELS[key] ?? key.replace(/_/g, ' ');
}
function otherStyleKey(current: string, mode: Mode): string {
  const list = STYLE_CYCLE[mode];
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}

/**
 * Fire-and-forget copy tracker. Swallows failures so a flaky beacon
 * never breaks the clipboard UX.
 */
// Sequentially trigger a browser download for each URL. Spaced at 350ms so
// Chrome/Safari don't collapse them into a single prompt. Placeholder for a
// real server-side zip when the volume justifies it.
function downloadAllUrls(urls: string[]): void {
  urls.forEach((url, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 350);
  });
}

function trackClipCopy(clipId: string): void {
  try {
    void fetch(`/api/video-engine/clips/${clipId}/copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* noop */ });
  } catch {
    /* noop */
  }
}

/**
 * Inline "Change product" control — prompts for a new product name + URL
 * and PATCHes the run. Kept dead-simple on purpose; the structured editor
 * lives upstream in UploadCard.
 */
function ChangeProductLink({ runId, currentName }: { runId: string; currentName: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onChange() {
    if (typeof window === 'undefined' || busy) return;
    const name = window.prompt('Product name (leave blank to clear):', currentName ?? '');
    if (name === null) return;
    let url: string | null = null;
    if (name.trim().length > 0) {
      const maybeUrl = window.prompt('Product URL (https://…):', '');
      if (maybeUrl === null) return;
      const trimmed = maybeUrl.trim();
      if (trimmed.length > 0) {
        try {
          const u = new URL(trimmed);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
          url = trimmed;
        } catch {
          window.alert('Product URL must be an http(s) URL.');
          return;
        }
      }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/video-engine/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product_name: name.trim() || null,
          product_url:  url,
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => window.location.reload(), 800);
      } else {
        const body = await res.text();
        window.alert(`Could not update product: ${body.slice(0, 200)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onChange}
      disabled={busy}
      className="w-full text-center text-xs sm:text-sm text-zinc-400 hover:text-zinc-200 min-h-[40px] px-3 disabled:opacity-60"
    >
      {busy ? 'Saving…' : done ? 'Product updated' : currentName ? `Change product (${currentName})` : 'Add a product link'}
    </button>
  );
}
