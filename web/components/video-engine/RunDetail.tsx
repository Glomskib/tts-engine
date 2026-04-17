'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, RefreshCw, GitCompareArrows, Copy, Check, Sparkles,
  AlertTriangle, Wand2, Scissors, Crown, Flame, Layers, X,
} from 'lucide-react';
import StatusPill from './StatusPill';
import { modeToWorkspaceLabel } from './WorkspaceSelector';
import type { Mode, RunStatus } from '@/lib/video-engine/types';

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
  // Ordered list of clip ids the user has picked for "Combine into one video".
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [combineBusy, setCombineBusy] = useState(false);

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
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCombineBusy(false);
    }
  }

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
      alert(e instanceof Error ? e.message : String(e));
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
  const otherMode: Mode = run.mode === 'affiliate' ? 'nonprofit' : 'affiliate';
  const intentMismatch = run.detected_intent && run.detected_intent !== 'unknown' && run.detected_intent !== run.mode;
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">
            {asset?.original_filename ?? 'Generation run'}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-500 flex-wrap">
            <StatusPill status={run.status} />
            <span>·</span>
            <span>{modeToWorkspaceLabel(run.mode)}</span>
            {run.watermark && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-amber-300/90"><Crown className="w-3.5 h-3.5" /> Watermark on</span>
              </>
            )}
          </div>
        </div>

        {isTerminal && (
          <div className="flex gap-2">
            <button
              onClick={regenerateInOtherMode}
              disabled={!!regenBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-sm px-3 py-1.5 disabled:opacity-50"
            >
              {regenBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Try as {modeToWorkspaceLabel(otherMode)}
            </button>
            <Link
              href={`/video-engine/${runId}/compare`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-sm px-3 py-1.5"
            >
              <GitCompareArrows className="w-4 h-4" />
              Compare
            </Link>
          </div>
        )}
      </div>

      {run.status === 'complete' && rendered.length > 0 && (
        <ReadyBanner count={rendered.filter((r) => r.status === 'complete').length} />
      )}

      {intentMismatch && (
        <IntentMismatchBanner currentMode={run.mode} detected={run.detected_intent as Mode} />
      )}

      {isTerminal && <UpgradeNudges planId={run.plan_id_at_run} watermark={run.watermark} />}

      {run.error_message && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {run.error_message}
        </div>
      )}

      {!isTerminal && <ProgressTrack status={run.status} rendered={rendered} />}

      {asset?.storage_url && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-xs text-zinc-500 mb-2">Source</div>
          <video src={asset.storage_url} controls preload="metadata" className="w-full max-h-72 rounded-lg bg-black" />
        </div>
      )}

      {rendered.length > 0 && (() => {
        // Split combined renders out into their own section so they don't
        // pollute the Recommended/Alternates ranking of the source clips.
        const combinedClips = rendered.filter((r) => r.template_key === 'combined');
        const sourceClips = rendered.filter((r) => r.template_key !== 'combined');
        const ranked = rankRendered(sourceClips, candidateById);
        const best = ranked[0] ?? null;
        const alternates = ranked.slice(1);
        const completeBest = best && best.status === 'complete' ? best : null;
        return (
          <>
            {combinedClips.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-medium text-zinc-100">Your combined videos</h2>
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {combinedClips.map((rc) => (
                    <CombinedClipCard key={rc.id} clip={rc} />
                  ))}
                </div>
              </section>
            )}
            {completeBest && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-sm font-medium text-zinc-100">Recommended</h2>
                  <span className="text-[10px] uppercase tracking-wide text-emerald-400">Ready to post</span>
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-[minmax(0,1fr)]">
                  <RenderedClipCard
                    clip={completeBest}
                    candidate={completeBest.candidate_id ? candidateById.get(completeBest.candidate_id) ?? null : null}
                    featured
                    selected={selectedClipIds.includes(completeBest.id)}
                    selectionIndex={selectedClipIds.indexOf(completeBest.id)}
                    onToggleSelect={toggleSelected}
                  />
                </div>
              </section>
            )}
            {alternates.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-zinc-300 mb-3">
                  {completeBest ? `Alternates (${alternates.length})` : `Your clips (${ranked.length})`}
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {(completeBest ? alternates : ranked).map((rc) => (
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
              </section>
            )}
            {selectedClipIds.length >= 1 && (
              <CombineActionBar
                count={selectedClipIds.length}
                busy={combineBusy}
                onCombine={combineSelected}
                onClear={clearSelected}
              />
            )}
          </>
        );
      })()}
    </div>
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

function ReadyBanner({ count }: { count: number }) {
  return (
    <div className="rounded-xl border border-emerald-800/50 bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 px-4 py-3 flex items-center gap-3">
      <Check className="w-5 h-5 text-emerald-300" />
      <div>
        <div className="text-emerald-100 font-medium text-sm">Your clips are ready.</div>
        <div className="text-emerald-300/80 text-xs mt-0.5">
          {count} post-ready {count === 1 ? 'clip' : 'clips'} below — copy the caption, download the MP4, and post.
        </div>
      </div>
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
          re-running as {detectedLabel} for clips that match the content's intent.
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
function UpgradeNudges({ planId, watermark }: { planId: string | null; watermark: boolean }) {
  const isFreeOrStarter = !planId || planId === 'payg' || planId === 've_starter';
  const showWatermark = watermark;
  if (!isFreeOrStarter && !showWatermark) return null;

  return (
    <div className="space-y-2">
      {showWatermark && (
        <UpgradeNudge text="Remove the “Made with FlashFlow” watermark." cta="Upgrade to Creator ($49/mo)" />
      )}
      {isFreeOrStarter && (
        <UpgradeNudge text="Unlock 6 clips per upload (you’re capped at 3)." cta="Get Creator →" />
      )}
      {isFreeOrStarter && (
        <UpgradeNudge text="Need more uploads this month?" cta="See plans →" />
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
      alert(e instanceof Error ? e.message : String(e));
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
          <span className="font-medium">{clip.template_key}</span>
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

const STYLE_CYCLE: Record<Mode, string[]> = {
  affiliate: ['aff_tiktok_shop', 'aff_ugc_review', 'aff_talking_head'],
  nonprofit: ['np_event_recap', 'np_join_us', 'np_why_this_matters', 'np_sponsor_highlight', 'np_testimonial'],
};
function otherStyleKey(current: string, mode: Mode): string {
  const list = STYLE_CYCLE[mode];
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}
