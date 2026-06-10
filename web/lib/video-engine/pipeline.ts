/**
 * Video Engine pipeline state machine.
 *
 * One function — `tickRun(runId)` — advances a single run by exactly one stage:
 *   created     → transcribing → analyzing → assembling → rendering → complete
 *
 * Errors at any stage move the run to `failed` with `error_message` set.
 * The cron at /api/cron/video-engine-tick calls tickRun() in a loop.
 *
 * Render dispatch goes through `ff_render_jobs` (the M4 worker queue);
 * we never call Shotstack directly from this file.
 *
 * V2 additions:
 *   - Hook-first refinement applied in scoring
 *   - Insight derivation (hook_strength, suggested_use, selection_reason, best_for)
 *   - Auto intent detection on transcript → ve_runs.detected_intent
 *   - Watermark layer added to timeline when ve_runs.watermark = true
 *   - Per-clip packaging (caption/hashtags/title/CTA) runs in parallel with rendering
 *   - Completion notifications fired on transition to complete/failed
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Mode, RunStatus, TranscriptSegment } from './types';
import { isMode, getMode } from './modes';
import { transcribeStorageAsset } from './transcribe';
import { transcribeWithFallback } from './transcribe-groq';
import { rankClips, type RankedClip } from './hook-ranker';
import { generateCandidates } from './scoring';
import { dedupeTranscriptTakes } from '@/lib/editing/dedupe-takes';
import { resolveRenderTemplateKeys, getTemplateOrDefault } from './templates';
import { getCTAOrDefault } from './ctas';
import { renderVideo as shotstackRenderVideo, getRenderStatus as shotstackGetStatus } from '@/lib/shotstack';
import { renderClipLocal } from './render-local';
import { pickMusicForVibe, pickBrollForTranscript } from './music-broll';
import { deriveInsights } from './insights';
import { detectIntent } from './intent';
import { resolveVEPlan, WATERMARK_TEXT } from './limits';
import { watermarkClip } from './templates/shared';
import { packageClip } from './packaging';
import { notifyTerminalRun } from './notify';
import { markRecommendedClip, autoCreateExportJobs } from './distribution';
import { incrementClipUsage } from '@/lib/whop/plan-limits';

interface RunRow {
  id: string;
  user_id: string;
  mode: Mode;
  preset_keys: string[];
  status: RunStatus;
  target_clip_count: number;
  context_json: Record<string, unknown>;
  attempts: number;
  error_message: string | null;
  watermark: boolean;
  plan_id_at_run: string | null;
  // Product / coupon fields are not real columns on ve_runs — they live in
  // context_json and are merged on read where needed. Kept optional here
  // so we don't churn the downstream reader code.
  product_name?: string | null;
  product_url?: string | null;
  product_platform?: string | null;
  product_price_cents?: number | null;
  coupon_code?: string | null;
}

interface AssetRow {
  id: string;
  run_id: string;
  user_id: string;
  storage_bucket: string;
  storage_path: string;
  storage_url: string;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
}

export interface TickResult {
  runId: string;
  fromStatus: RunStatus;
  toStatus: RunStatus;
  message?: string;
}

const PACKAGING_PER_TICK = 2;   // throttle Claude calls per cron tick

async function loadRun(runId: string): Promise<RunRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ve_runs')
    // NOTE: product_* + coupon_code are planned columns that never landed in
    // the ve_runs schema — they live in context_json instead. Selecting them
    // hard-fails the tick. We pull only real columns; downstream code reads
    // product info from context_json (mergedContext) which already carries it.
    .select('id,user_id,mode,preset_keys,status,target_clip_count,context_json,attempts,error_message,watermark,plan_id_at_run')
    .eq('id', runId)
    .single();
  if (error) throw new Error(`Failed to load run ${runId}: ${error.message}`);
  return (data as RunRow) ?? null;
}

async function loadAsset(runId: string): Promise<AssetRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ve_assets')
    .select('id,run_id,user_id,storage_bucket,storage_path,storage_url,duration_sec,width,height')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to load asset for run ${runId}: ${error.message}`);
  return (data as AssetRow) ?? null;
}

async function setStatus(
  runId: string,
  status: RunStatus,
  patch: Partial<{ error_message: string | null; completed_at: string | null }> = {},
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    last_tick_at: new Date().toISOString(),
    ...patch,
  };
  if (status === 'complete' || status === 'failed') {
    update.completed_at = new Date().toISOString();
  }
  await supabaseAdmin.from('ve_runs').update(update).eq('id', runId);

  // Fire-and-forget notification on terminal-state transition. Idempotent.
  if (status === 'complete' || status === 'failed') {
    notifyTerminalRun(runId).catch((e) =>
      console.error('[ve-pipeline] notify failed:', e instanceof Error ? e.message : e),
    );
  }
}

async function fail(runId: string, err: unknown, fromStatus: RunStatus = 'created'): Promise<TickResult> {
  const message = err instanceof Error ? err.message : String(err);

  // Sentry breadcrumb — at $50K MRR every failed run needs a structured
  // capture so we can debug at 2am via the dashboard, not via log diving.
  // Lazy-import so we don't add Sentry overhead to a healthy run.
  try {
    const SentryMod = await import('@sentry/nextjs');
    SentryMod.captureException(err instanceof Error ? err : new Error(message), {
      tags: {
        pipeline_stage: fromStatus,
        run_id: runId,
        ff_subsystem: 'video-engine',
      },
      extra: {
        runId,
        fromStatus,
        message: message.slice(0, 1000),
      },
    });
  } catch {
    // Sentry not configured — fall through silently
  }

  await supabaseAdmin
    .from('ve_runs')
    .update({
      status: 'failed',
      error_message: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
      last_tick_at: new Date().toISOString(),
    })
    .eq('id', runId);

  // Credit refund — credits were deducted at job-create time. When the
  // pipeline can't deliver any clips at all, the user shouldn't lose
  // those credits to a failure they didn't cause (Groq outage, ffmpeg
  // crash, NSFW false-positive, Vercel timeout). Best-in-class SaaS
  // refunds on engine failures.
  //
  // Only refund if NO clips successfully rendered for this run — partial
  // success means the user got value and shouldn't be made whole.
  try {
    const { data: anyComplete } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('id')
      .eq('run_id', runId)
      .eq('status', 'complete')
      .not('output_url', 'is', null)
      .limit(1);
    if (!anyComplete || anyComplete.length === 0) {
      const { data: runRow } = await supabaseAdmin
        .from('ve_runs')
        .select('user_id, target_clip_count')
        .eq('id', runId)
        .single();
      if (runRow?.user_id) {
        const refundAmt = Math.max(1, Number(runRow.target_clip_count) || 1);
        try {
          // grant_credits may not exist on older envs — try/catch swallows
          // missing-function errors so we don't fail the failure handler.
          await supabaseAdmin.rpc('grant_credits', {
            p_user_id: runRow.user_id,
            p_amount: refundAmt,
            p_description: `Refund — pipeline failure on run ${runId.slice(0, 8)}: ${message.slice(0, 80)}`,
          });
          console.log(`[ve-pipeline] refunded ${refundAmt} credits to ${runRow.user_id} for failed run ${runId}`);
        } catch (rpcErr) {
          console.warn('[ve-pipeline] grant_credits RPC not available — manual reconciliation needed:', rpcErr instanceof Error ? rpcErr.message : rpcErr);
        }
      }
    }
  } catch (refundErr) {
    console.warn('[ve-pipeline] refund attempt failed (non-fatal):', refundErr instanceof Error ? refundErr.message : refundErr);
  }

  notifyTerminalRun(runId).catch(() => {});
  return { runId, fromStatus, toStatus: 'failed', message };
}

// ---------------------------------------------------------------------------
// Stage handlers
// ---------------------------------------------------------------------------

async function stageTranscribe(run: RunRow): Promise<RunStatus> {
  const asset = await loadAsset(run.id);
  if (!asset) throw new Error('No asset found for run');

  // transcribeWithFallback prefers Groq (60x cheaper, 30x faster) and falls back
  // to OpenAI Whisper if Groq is unconfigured or errors. Reads GROQ_API_KEY at runtime.
  // storage_url is passed so R2-backed assets can be fetched via signed URL.
  const result = await transcribeWithFallback({
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
    storage_url: asset.storage_url,
  });

  // Persist transcript + chunks atomically (best-effort — Supabase REST has no real tx).
  const { data: tInsert, error: tErr } = await supabaseAdmin
    .from('ve_transcripts')
    .insert({
      asset_id: asset.id,
      run_id: run.id,
      user_id: run.user_id,
      language: result.language,
      full_text: result.transcript,
      source: 'whisper',
      duration_sec: result.duration_sec,
      raw_json: { segments: result.segments },
    })
    .select('id')
    .single();
  if (tErr || !tInsert) throw new Error(`Failed to insert transcript: ${tErr?.message}`);

  const chunkRows = result.segments.map((s, idx) => ({
    transcript_id: tInsert.id,
    run_id: run.id,
    idx,
    start_sec: s.start,
    end_sec: s.end,
    text: s.text,
    features_json: {},
  }));
  if (chunkRows.length > 0) {
    const { error: cErr } = await supabaseAdmin.from('ve_transcript_chunks').insert(chunkRows);
    if (cErr) throw new Error(`Failed to insert chunks: ${cErr.message}`);
  }

  // Backfill asset duration if Whisper gave us a number and we didn't have one
  if (!asset.duration_sec && result.duration_sec) {
    await supabaseAdmin
      .from('ve_assets')
      .update({ duration_sec: result.duration_sec })
      .eq('id', asset.id);
  }

  // Heuristic intent detection — surfaced to UI; never overrides user's mode choice.
  try {
    const intent = detectIntent(result.transcript);
    if (intent.intent !== 'unknown') {
      await supabaseAdmin
        .from('ve_runs')
        .update({ detected_intent: intent.intent })
        .eq('id', run.id);
    }
  } catch (e) {
    console.warn('[ve-pipeline] intent detection failed (non-fatal):', e);
  }

  return 'analyzing';
}

async function stageAnalyze(run: RunRow): Promise<RunStatus> {
  const asset = await loadAsset(run.id);
  if (!asset) throw new Error('No asset found for run');

  const { data: transcript } = await supabaseAdmin
    .from('ve_transcripts')
    .select('id,raw_json')
    .eq('run_id', run.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!transcript) throw new Error('No transcript found for run');

  const segments = (transcript.raw_json?.segments ?? []) as TranscriptSegment[];
  if (!segments.length) {
    throw new Error('Transcript had no segments — source may have no audible speech');
  }

  const sourceDuration = asset.duration_sec ? Number(asset.duration_sec) : undefined;
  console.log(`[ve-pipeline] analyze run=${run.id} source_duration=${sourceDuration?.toFixed(1) ?? 'unknown'}s segments=${segments.length} mode=${run.mode} target=${run.target_clip_count}`);

  const { selected } = generateCandidates(segments, run.mode, run.target_clip_count, sourceDuration);
  if (!selected.length && run.mode === 'post') {
    // 2026-06-10 — Brandon hit "couldn't find a strong shorter cut" on a
    // normal Post Maker take. Scoring rejects any window covering >80% of
    // the source (MAX_CANDIDATE_SOURCE_RATIO) — correct for Clip Picker
    // (find highlights in a long video), wrong for Post Maker where the
    // whole take IS the content. Post mode now falls back to the full
    // speech span; polish (silence trim at edges, retake dedupe, captions,
    // fades) still applies downstream, so it's not a raw re-export.
    const first = segments[0];
    const last = segments[segments.length - 1];
    const fullStart = Math.max(0, first.start - 0.2);
    const fullEnd = sourceDuration ? Math.min(sourceDuration, last.end + 0.3) : last.end + 0.3;
    if (fullEnd - fullStart >= 2) {
      selected.push({
        start: fullStart,
        end: fullEnd,
        text: segments.map((s) => s.text).join(' ').trim(),
        hookText: segments[0]?.text?.trim() || null,
        clipType: 'full_take',
        score: 0.5,
        scoreBreakdown: { full_take_fallback: 1 },
        sourceChunkIdxs: [],
        rank: 1,
      });
      console.log(`[ve-pipeline] post full-take fallback run=${run.id}: ${fullStart.toFixed(1)}-${fullEnd.toFixed(1)}s (scoring found no shorter cut)`);
    }
  }
  if (!selected.length) {
    // Distinguish "no candidates at all" from "every candidate was effectively
    // the full source" — the latter is the common case when footage has no
    // distinct beats and we refuse to ship the source re-exported as a "short".
    throw new Error("We couldn't find a strong shorter cut from this video yet. Try a longer take with clear intro / payoff moments.");
  }

  // BRAND-VOICE HOOK RANKER (2026-05-12) — beats Opus Clip because the lens
  // is the user's voice, not a generic curve. Re-ranks the deterministic
  // candidates from generateCandidates() and attaches feel_diagnosis. Falls
  // back silently if Anthropic is unavailable or brand profile missing.
  const rankerContext = run.context_json as Record<string, unknown> | null;
  const describe = (rankerContext?.describe as string) || '';
  const vibe = (rankerContext?.vibe as string) || 'real';
  const brandProfileId = rankerContext?.brand_profile_id as string | null;

  let brandProfile: Parameters<typeof rankClips>[0]['brand_profile'] = null;
  if (brandProfileId && brandProfileId.startsWith('brand:')) {
    // Bridged from the creator's `brands` table (see /api/create/brand-profiles).
    const realBrandId = brandProfileId.slice('brand:'.length);
    const { data: b } = await supabaseAdmin
      .from('brands')
      .select('name, tone_of_voice, target_audience, description, guidelines')
      .eq('id', realBrandId)
      .maybeSingle();
    if (b) {
      const preferred = [b.guidelines, b.target_audience ? `Audience: ${b.target_audience}` : null]
        .filter(Boolean).join('\n') || null;
      brandProfile = {
        name: b.name as string,
        tone_descriptor: (b.tone_of_voice as string) || null,
        prohibited_phrases: null,
        preferred_phrases: preferred as string | null,
        sample_posts: b.description ? [b.description as string] : [],
      };
    }
  } else if (brandProfileId) {
    const { data: bp } = await supabaseAdmin
      .from('brand_profiles')
      .select('name, tone_descriptor, prohibited_phrases, preferred_phrases, sample_posts_json')
      .eq('id', brandProfileId)
      .maybeSingle();
    if (bp) {
      const samples = (() => {
        try { return JSON.parse((bp.sample_posts_json as string) || '[]') as string[]; }
        catch { return []; }
      })();
      brandProfile = {
        name: bp.name as string,
        tone_descriptor: (bp.tone_descriptor as string) || null,
        prohibited_phrases: (bp.prohibited_phrases as string) || null,
        preferred_phrases: (bp.preferred_phrases as string) || null,
        sample_posts: samples,
      };
    }
  }

  let rankedOverlay: RankedClip[] = [];
  try {
    rankedOverlay = await rankClips({
      segments,
      target_count: run.target_clip_count,
      describe,
      vibe,
      brand_profile: brandProfile,
    });
    console.log(`[ve-pipeline] hook-ranker scored ${rankedOverlay.length} candidates with brand-voice lens`);
  } catch (err) {
    console.warn('[ve-pipeline] hook-ranker failed, keeping deterministic order:', err instanceof Error ? err.message : err);
  }

  // Build a map from start_sec → ranked overlay so we can attach hook_score
  // + feel_diagnosis to whichever generated candidates the LLM agrees with.
  const overlayByStart = new Map<string, RankedClip>();
  for (const r of rankedOverlay) {
    // Match by approximate start_sec (within 0.5s)
    overlayByStart.set(r.start_sec.toFixed(1), r);
  }
  function findOverlay(candStart: number): RankedClip | undefined {
    return overlayByStart.get(candStart.toFixed(1));
  }

  if (sourceDuration) {
    for (const c of selected) {
      const candDur = c.end - c.start;
      const pct = ((candDur / sourceDuration) * 100).toFixed(0);
      const trimDelta = (sourceDuration - candDur).toFixed(1);
      console.log(`[ve-pipeline] Candidate #${c.rank}: ${c.start.toFixed(1)}-${c.end.toFixed(1)}s duration=${candDur.toFixed(1)}s pct=${pct}% trimmed=${trimDelta}s score=${c.score.toFixed(2)}`);
    }
  }

  const candidateRows = selected.map((c) => {
    const insight = deriveInsights({
      score: c.score,
      scoreBreakdown: c.scoreBreakdown,
      clipType: c.clipType,
      durationSec: c.end - c.start,
      hookText: c.hookText,
      mode: run.mode,
    });
    // Look up the brand-voice hook ranker's overlay for this candidate.
    // If found, fold it into score_breakdown so the rendering stage can
    // surface feel_diagnosis on the rendered clip.
    const overlay = findOverlay(c.start);
    const mergedScoreBreakdown = {
      ...c.scoreBreakdown,
      ...(overlay ? {
        brand_hook_score: overlay.hook_score,
        feel_diagnosis: overlay.feel_diagnosis,
        suggested_title: overlay.suggested_title,
      } : {}),
    };
    return {
      run_id: run.id,
      asset_id: asset.id,
      user_id: run.user_id,
      start_sec: c.start,
      end_sec: c.end,
      text: c.text,
      hook_text: c.hookText,
      clip_type: c.clipType,
      // If the brand-voice ranker liked this candidate, use its higher-confidence score.
      score: overlay ? Math.max(c.score, overlay.hook_score / 10) : c.score,
      score_breakdown_json: mergedScoreBreakdown,
      selected: true,
      rank: c.rank,
      hook_strength: insight.hookStrength,
      suggested_use: insight.suggestedUse,
      selection_reason: overlay?.feel_diagnosis || insight.selectionReason,
      best_for: insight.bestFor,
    };
  });

  const { error: insErr } = await supabaseAdmin.from('ve_clip_candidates').insert(candidateRows);
  if (insErr) throw new Error(`Failed to insert candidates: ${insErr.message}`);

  return 'assembling';
}

async function stageAssemble(run: RunRow): Promise<RunStatus> {
  const asset = await loadAsset(run.id);
  if (!asset) throw new Error('No asset found for run');

  const { data: candidates, error: candErr } = await supabaseAdmin
    .from('ve_clip_candidates')
    .select('id,start_sec,end_sec,text,hook_text,clip_type')
    .eq('run_id', run.id)
    .eq('selected', true)
    .order('rank', { ascending: true });
  if (candErr) throw new Error(`Failed to load candidates: ${candErr.message}`);
  if (!candidates || candidates.length === 0) throw new Error('No selected candidates to assemble');

  // ─── Idempotency guard ────────────────────────────────────────────────
  // The Vercel function maxDuration is 300s but the synchronous render loop
  // below can exceed that for multi-clip runs. When that happens, the cron
  // re-enters stageAssemble for the same run and (without this guard) would
  // re-INSERT every clip + ff_render_job row — producing 5× the requested
  // clips. This guard short-circuits the insert path when rows already
  // exist; the render loop further down then operates on the existing
  // rows and skips any that already completed.
  const { data: existingClips } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,candidate_id,ff_render_job_id,status,output_url,template_key,cta_key,timeline_json,watermark')
    .eq('run_id', run.id);
  const alreadyAssembled = !!(existingClips && existingClips.length > 0);
  if (alreadyAssembled) {
    console.log(`[ve-pipeline] stageAssemble re-entry for run=${run.id} — ${existingClips.length} clips already inserted, resuming renders only`);
  }

  const modeCfg = getMode(run.mode);
  const templateKeys = resolveRenderTemplateKeys(
    run.mode,
    run.preset_keys,
    run.target_clip_count,
    modeCfg.defaultTemplateKeys,
  );

  const planForPriority = resolveVEPlan(run.plan_id_at_run);
  const renderedRows: Array<Record<string, unknown>> = [];
  const ffJobRows: Array<Record<string, unknown>> = [];

  // Generate ready-to-paste copy (caption/hashtags/title) now — the candidate
  // text is available and this no longer depends on render-stage timing.
  if (!alreadyAssembled) {
    await packagePendingClips(run).catch((e) =>
      console.warn('[ve-pkg] assemble-stage packaging error (non-fatal):', e instanceof Error ? e.message : e));
  }

  // Create clips are rendered by the Mac-mini fleet (scripts/render-node/
  // slice-worker.mjs): each row is enqueued as kind 'clip_render' carrying a
  // slice spec, and the worker trims the source with ffmpeg. In-process Vercel
  // render was retired (it cannot spawn ffmpeg on the serverless runtime).

  // 2026-06-10 audit fix — "B-roll still never gets added": when rendering
  // moved to the mini fleet, the music/B-roll picks stayed behind in the
  // retired in-process branch (renderer key literally renamed to
  // local_DISABLED_...), so enable_broll/enable_music in context_json were
  // silently ignored. The picks now happen HERE (Vercel has the Pexels/R2
  // keys) and ride to the fleet worker inside the slice spec.
  const polishCtx = (run.context_json ?? {}) as Record<string, unknown>;
  const polishVibe = (polishCtx.vibe as string) || 'real';
  const polishLegacy = run.mode === 'affiliate' || run.mode === 'nonprofit';
  const polishBrollFlag = typeof polishCtx.enable_broll === 'boolean' ? (polishCtx.enable_broll as boolean) : null;
  const polishMusicFlag = typeof polishCtx.enable_music === 'boolean' ? (polishCtx.enable_music as boolean) : null;
  const doPolishBroll = polishBrollFlag === null ? polishLegacy : polishBrollFlag;
  const doPolishMusic = polishMusicFlag === null ? polishLegacy : polishMusicFlag;

  // 2026-06-10 audit fix — Brandon: "the auto editor cuts off/ends videos
  // instead of leaving in the 'fixed' sentences when I mess up and repeat."
  // Post Maker previously rendered ONE contiguous scored window, so a flub
  // mid-take meant the clip just ended before the corrected sentence. Now,
  // for post mode, we run the retake deduper (keep the LAST take — Brandon's
  // locked decision) over the whole take and ship keep_ranges to the fleet
  // worker, which cuts the flubs and stitches the rest together.
  let postKeepRanges: Array<{ start_sec: number; end_sec: number }> | null = null;
  if (run.mode === 'post' && !alreadyAssembled) {
    try {
      const { data: takeChunks } = await supabaseAdmin
        .from('ve_transcript_chunks')
        .select('start_sec,end_sec,text')
        .eq('run_id', run.id)
        .order('idx', { ascending: true });
      if (takeChunks && takeChunks.length) {
        const words = takeChunks.map((c) => ({
          start: Number(c.start_sec), end: Number(c.end_sec), text: String(c.text || ''),
        }));
        const cuts = dedupeTranscriptTakes(words);
        if (cuts.length) {
          const wStart = Math.max(0, words[0].start - 0.2);
          const wEnd = words[words.length - 1].end + 0.3;
          let cursor = wStart;
          const keeps: Array<{ start_sec: number; end_sec: number }> = [];
          for (const c of cuts.slice().sort((a, b) => a.start_sec - b.start_sec)) {
            const cs = Math.max(wStart, c.start_sec);
            const ce = Math.min(wEnd, c.end_sec);
            if (ce <= cursor) continue;
            if (cs > cursor + 0.25) keeps.push({ start_sec: cursor, end_sec: cs });
            cursor = Math.max(cursor, ce);
          }
          if (wEnd > cursor + 0.25) keeps.push({ start_sec: cursor, end_sec: wEnd });
          if (keeps.length) {
            postKeepRanges = keeps;
            const kept = keeps.reduce((t, k) => t + (k.end_sec - k.start_sec), 0);
            console.log(`[ve-pipeline] post retake-dedupe run=${run.id}: ${cuts.length} flubbed take(s) removed, ${keeps.length} keep range(s), ${kept.toFixed(1)}s kept`);
          }
        }
      }
    } catch (e) {
      console.warn('[ve-pipeline] retake dedupe failed (rendering scored window):', (e as Error).message);
    }
  }

  // Skip the timeline-build + row-staging when we're re-entering — those
  // arrays only matter for the INSERT path, which is gated on !alreadyAssembled.
  for (let i = 0; i < candidates.length && !alreadyAssembled; i++) {
    const cand = candidates[i];
    const templateKey = templateKeys[i % templateKeys.length];
    const template = getTemplateOrDefault(templateKey, run.mode);
    const ctaKey = template.defaultCTAKey;
    const cta = getCTAOrDefault(ctaKey, run.mode);

    const timeline = template.build({
      candidate: {
        start: Number(cand.start_sec),
        end: Number(cand.end_sec),
        text: cand.text,
        hookText: cand.hook_text,
        clipType: cand.clip_type,
      },
      asset: {
        storage_url: asset.storage_url,
        duration_sec: Number(asset.duration_sec ?? 0),
        width: asset.width,
        height: asset.height,
      },
      context: run.context_json ?? {},
      ctaKey: cta.key,
      ctaText: cta.overlayText,
    });

    // Watermark layer for free/starter tiers — applied generically so templates
    // never need to know about plan tiers.
    if (run.watermark) {
      const clipLength = Math.max(0.5, Number(cand.end_sec) - Number(cand.start_sec));
      timeline.tracks.push({ clips: [watermarkClip(WATERMARK_TEXT, clipLength)] });
    }

    const renderedId = crypto.randomUUID();
    const ffJobId = crypto.randomUUID();

    renderedRows.push({
      id: renderedId,
      run_id: run.id,
      candidate_id: cand.id,
      user_id: run.user_id,
      template_key: template.key,
      cta_key: cta.key,
      mode: run.mode,
      ff_render_job_id: ffJobId,
      status: 'queued',
      timeline_json: timeline,
      watermark: run.watermark,
      package_status: 'pending',
    });

    // Pick polish assets for THIS clip (transcript-matched B-roll, vibe music).
    // Best-effort: a Pexels/R2 hiccup must never block the render itself.
    const polishLen = postKeepRanges
      ? Math.max(0.5, postKeepRanges.reduce((t, k) => t + (k.end_sec - k.start_sec), 0))
      : Math.max(0.5, Number(cand.end_sec) - Number(cand.start_sec));
    let polishMusic: { audio_url: string; volume_db: number } | null = null;
    let polishBroll: Array<{ at_sec: number; duration_sec: number; video_url: string }> = [];
    if (doPolishMusic) {
      try {
        polishMusic = await pickMusicForVibe({ vibe: polishVibe, clip_duration_sec: polishLen });
      } catch (e) { console.warn('[ve-pipeline] music pick failed (fleet spec):', (e as Error).message); }
    }
    if (doPolishBroll) {
      try {
        polishBroll = await pickBrollForTranscript({
          vibe: polishVibe,
          transcript_text: String(cand.text || ''),
          total_duration_sec: polishLen,
          vertical: true,
        });
      } catch (e) { console.warn('[ve-pipeline] broll pick failed (fleet spec):', (e as Error).message); }
    }

    // Slice spec consumed by the Mac-mini fleet worker
    // (scripts/render-node/slice-worker.mjs): it trims [start,end] from the
    // source asset, polishes audio, composites B-roll/music when present,
    // uploads the clip, and marks the job done.
    const sliceSpec = {
      kind: 'clip_render',
      source_bucket: asset.storage_bucket,
      source_path: asset.storage_path,
      source_url: asset.storage_url ?? null,
      start_sec: postKeepRanges ? postKeepRanges[0].start_sec : Number(cand.start_sec),
      end_sec: postKeepRanges ? postKeepRanges[postKeepRanges.length - 1].end_sec : Number(cand.end_sec),
      // Multi-range edit: worker cuts the flubbed takes and stitches these.
      keep_ranges: postKeepRanges ?? undefined,
      user_id: run.user_id,
      run_id: run.id,
      clip_id: renderedId,
      watermark: !!run.watermark,
      caption_style: (((run.context_json as Record<string, unknown> | null) ?? {}).caption_style as string) || 'bold_yellow',
      music: polishMusic ? { audio_url: polishMusic.audio_url, volume_db: polishMusic.volume_db } : null,
      broll: polishBroll.slice(0, 6).map((b) => ({ at_sec: b.at_sec, duration_sec: b.duration_sec, video_url: b.video_url })),
    };

    ffJobRows.push({
      id: ffJobId,
      user_id: run.user_id,
      correlation_id: `ve:${run.id}:${renderedId}`,
      kind: 'clip_render',
      priority: planForPriority.renderPriority,
      timeline: sliceSpec,
      output_spec: { format: 'mp4', resolution: 'sd', aspectRatio: '9:16', fps: 30 },
      status: 'pending',
    });
  }

  // Skip INSERT on re-entry — the row IDs in renderedRows/ffJobRows would
  // collide with existing rows. We still need the IDs and the candidate map
  // to drive the render loop, which we backfill from existingClips below.
  if (!alreadyAssembled) {
    const { error: rcErr } = await supabaseAdmin.from('ve_rendered_clips').insert(renderedRows);
    if (rcErr) throw new Error(`Failed to insert rendered_clips: ${rcErr.message}`);

    const { error: ffErr } = await supabaseAdmin.from('ff_render_jobs').insert(ffJobRows);
    if (ffErr) {
      await supabaseAdmin.from('ve_rendered_clips').delete().eq('run_id', run.id);
      throw new Error(`Failed to enqueue ff_render_jobs: ${ffErr.message}`);
    }
  } else {
    // Re-entry — rebuild the parallel arrays so the render loop below
    // operates on the existing clip rows. Map by candidate_id so the order
    // matches the existing rows (not the freshly-built ones).
    renderedRows.length = 0;
    ffJobRows.length = 0;
    for (const ec of existingClips!) {
      renderedRows.push({
        id: ec.id,
        run_id: run.id,
        candidate_id: ec.candidate_id,
        status: ec.status,
        output_url: ec.output_url,
        ff_render_job_id: ec.ff_render_job_id,
      });
      ffJobRows.push({
        id: ec.ff_render_job_id,
      });
    }
    // Reorder candidates to match existingClips's candidate_id order.
    const candByCid = new Map(candidates.map((c) => [c.id, c]));
    const reordered = existingClips!
      .map((ec) => candByCid.get(ec.candidate_id as string))
      .filter((c): c is typeof candidates[number] => !!c);
    if (reordered.length === existingClips!.length) {
      candidates.splice(0, candidates.length, ...reordered);
    }
  }

  // Render each clip. Default path is local ffmpeg (reliable, no external
  // dependencies). Shotstack remains available as a future escalation but the
  // current account has no credits + no video-asset feature so we no longer
  // dispatch to it. Set VIDEO_ENGINE_RENDERER=shotstack to re-enable.
  const renderer = (process.env.VIDEO_ENGINE_RENDERER || 'local').toLowerCase();

  if (renderer === 'local_DISABLED_in_process_render_moved_to_mini_fleet') {
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const renderedRow = renderedRows[i];
      const jobRow = ffJobRows[i];
      const jobId = jobRow.id as string;
      const clipId = renderedRow.id as string;

      // Idempotency: skip clips that are already complete from a prior tick.
      // 'failed' rows are also skipped — they'll need manual retry. Anything
      // else (queued / rendering with no output_url) gets re-rendered.
      if (renderedRow.status === 'complete' && renderedRow.output_url) {
        console.log(`[ve-pipeline] skipping clip ${clipId} — already complete`);
        continue;
      }
      if (renderedRow.status === 'failed') {
        console.log(`[ve-pipeline] skipping clip ${clipId} — previously failed`);
        continue;
      }

      const startedAt = new Date().toISOString();

      await supabaseAdmin
        .from('ff_render_jobs')
        .update({ status: 'rendering', started_at: startedAt })
        .eq('id', jobId);
      await supabaseAdmin
        .from('ve_rendered_clips')
        .update({ status: 'rendering' })
        .eq('id', clipId);

      try {
        // Music + B-roll layering. As of 2026-05-15 these are explicitly
        // opt-in per project (enable_broll / enable_music in context_json),
        // because users felt the auto-layer was filler rather than polish.
        // Backward-compat: legacy callers that never set the flags still
        // get the old mode-based default (affiliate/nonprofit enrich).
        const ctx = (run.context_json ?? {}) as Record<string, unknown>;
        const vibe = (ctx.vibe as string) || 'real';
        const legacyEnrich = run.mode === 'affiliate' || run.mode === 'nonprofit';
        const explicitBroll = typeof ctx.enable_broll === 'boolean' ? (ctx.enable_broll as boolean) : null;
        const explicitMusic = typeof ctx.enable_music === 'boolean' ? (ctx.enable_music as boolean) : null;
        const doBroll = explicitBroll === null ? legacyEnrich : explicitBroll;
        const doMusic = explicitMusic === null ? legacyEnrich : explicitMusic;
        const clipDuration = Math.max(0.5, Number(cand.end_sec) - Number(cand.start_sec));

        let music: { audio_url: string; volume_db: number } | null = null;
        let broll: Array<{ at_sec: number; duration_sec: number; video_url: string }> = [];
        if (doMusic) {
          try {
            music = await pickMusicForVibe({ vibe, clip_duration_sec: clipDuration });
          } catch (e) { console.warn('[ve-pipeline] music pick failed:', (e as Error).message); }
        }
        if (doBroll) {
          try {
            broll = await pickBrollForTranscript({
              vibe,
              transcript_text: String(cand.text || ''),
              total_duration_sec: clipDuration,
              vertical: true,
            });
          } catch (e) { console.warn('[ve-pipeline] broll pick failed:', (e as Error).message); }
        }

        const result = await renderClipLocal({
          sourceBucket: asset.storage_bucket,
          sourcePath: asset.storage_path,
          sourceUrl: asset.storage_url || null,
          startSec: Number(cand.start_sec),
          endSec: Number(cand.end_sec),
          userId: run.user_id,
          clipId,
          music: music ? { audio_url: music.audio_url, volume_db: music.volume_db } : null,
          broll: broll.map((b) => ({ at_sec: b.at_sec, duration_sec: b.duration_sec, video_url: b.video_url })),
        });
        const completedAt = new Date().toISOString();
        await supabaseAdmin
          .from('ff_render_jobs')
          .update({
            status: 'done',
            output_url: result.outputUrl,
            duration_ms: Math.round(result.durationSec * 1000),
            completed_at: completedAt,
          })
          .eq('id', jobId);
        await supabaseAdmin
          .from('ve_rendered_clips')
          .update({
            status: 'complete',
            output_url: result.outputUrl,
            duration_sec: result.durationSec,
            completed_at: completedAt,
          })
          .eq('id', clipId);
        await incrementClipUsage(run.user_id).catch(() => {});
        console.log(`[ve-pipeline] local render done ${clipId}: ${result.outputUrl}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ve-pipeline] local render failed for ${clipId}:`, msg);
        await supabaseAdmin
          .from('ff_render_jobs')
          .update({ status: 'failed', error: msg.slice(0, 1000) })
          .eq('id', jobId);
        await supabaseAdmin
          .from('ve_rendered_clips')
          .update({ status: 'failed', error_message: msg.slice(0, 500) })
          .eq('id', clipId);
      }
    }
  } else if (renderer === 'shotstack') {
    // Legacy Shotstack dispatch — kept for when the account has credits again.
    for (const job of ffJobRows) {
      try {
        const ssResponse = await shotstackRenderVideo(job.timeline as object, job.output_spec as object);
        const renderId: string = ssResponse.response?.id || ssResponse.id;
        await supabaseAdmin
          .from('ff_render_jobs')
          .update({ status: 'fallback_shotstack', shotstack_render_id: renderId, started_at: new Date().toISOString() })
          .eq('id', job.id);
      } catch (err) {
        console.error(`[ve-pipeline] Shotstack dispatch failed for job ${job.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } else {
    // FLEET (default): clip_render jobs are now pending in ff_render_jobs. The
    // Mac-mini slice-worker claims, renders with ffmpeg, uploads, and marks them
    // done; stageRendering's existing poll then completes the run. In-process
    // Vercel ffmpeg was retired — it cannot spawn ffmpeg on the serverless
    // runtime (proven 2026-06-08: `spawn` error even with the binary bundled).
    console.log(`[ve-pipeline] fleet: ${ffJobRows.length} clip_render job(s) queued for mini worker (run=${run.id})`);
  }

  return 'rendering';
}

/**
 * Package up to PACKAGING_PER_TICK clips that are still pending.
 * Runs INSIDE stageRendering so packaging completes in parallel with renders.
 * Best-effort: any single failure marks that clip as 'failed' and the run continues.
 */
async function packagePendingClips(run: RunRow): Promise<void> {
  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,template_key,cta_key,candidate_id')
    .eq('run_id', run.id)
    .is('caption_text', null)            // self-heal: (re)package any clip missing copy
    .limit(PACKAGING_PER_TICK);
  if (pendErr) { console.error('[ve-pkg] select failed run=%s: %s', run.id, pendErr.message); return; }
  console.log('[ve-pkg] run=%s clips_to_package=%d', run.id, pending?.length ?? 0);
  if (!pending || pending.length === 0) return;

  for (const rc of pending) {
    try {
      const { data: cand } = await supabaseAdmin
        .from('ve_clip_candidates')
        .select('text,hook_text,clip_type,start_sec,end_sec')
        .eq('id', rc.candidate_id)
        .single();
      if (!cand) {
        await supabaseAdmin.from('ve_rendered_clips')
          .update({ package_status: 'failed', package_error: 'candidate not found' })
          .eq('id', rc.id);
        continue;
      }
      const cta = getCTAOrDefault(rc.cta_key as string, run.mode);
      // Merge first-class product columns into the context the packager sees.
      // `run.context_json` already carries older product_* strings from the
      // upload form; top-level columns from the new PATCH endpoint win.
      const mergedContext: Record<string, unknown> = { ...(run.context_json ?? {}) };
      if (run.product_name)     mergedContext.product_name     = run.product_name;
      if (run.product_url)      mergedContext.product_url      = run.product_url;
      if (run.product_platform) mergedContext.product_platform = run.product_platform;
      if (run.product_price_cents != null) {
        mergedContext.product_price = (run.product_price_cents / 100).toFixed(2);
      }
      if (run.coupon_code)      mergedContext.coupon_code      = run.coupon_code;

      const pkg = await packageClip({
        mode: run.mode,
        clipText: cand.text,
        hookText: cand.hook_text,
        clipType: cand.clip_type,
        durationSec: Number(cand.end_sec) - Number(cand.start_sec),
        templateKey: rc.template_key as string,
        ctaSuggestionFromTemplate: cta.overlayText,
        context: mergedContext,
      }, { correlationId: `ve-pkg:${run.id}:${rc.id}` });

      // Write only columns confirmed to exist in prod. hook_line/alt_captions
      // were silently failing the whole UPDATE (column missing) -> caption_text
      // stayed null. Capture the error instead of ignoring it.
      const { error: upErr } = await supabaseAdmin
        .from('ve_rendered_clips')
        .update({
          caption_text: pkg.caption_text,
          hashtags: pkg.hashtags,
          suggested_title: pkg.suggested_title,
          cta_suggestion: pkg.cta_suggestion,
          package_status: 'done',
          package_error: null,
        })
        .eq('id', rc.id);
      if (upErr) {
        console.error('[ve-pkg] write failed clip=%s: %s', rc.id, upErr.message);
        await supabaseAdmin.from('ve_rendered_clips')
          .update({ package_status: 'failed', package_error: upErr.message.slice(0, 400) })
          .eq('id', rc.id);
      } else {
        console.log('[ve-pkg] packaged clip=%s caption="%s"', rc.id, (pkg.caption_text || '').slice(0, 40));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('ve_rendered_clips')
        .update({ package_status: 'failed', package_error: msg.slice(0, 500) })
        .eq('id', rc.id);
    }
  }
}

async function stageRendering(run: RunRow): Promise<RunStatus> {
  // Run packaging opportunistically while renders are baking.
  await packagePendingClips(run).catch((e) =>
    console.warn('[ve-pipeline] packaging error (non-fatal):', e instanceof Error ? e.message : e),
  );

  // Sync state from ff_render_jobs into ve_rendered_clips.
  const { data: rendered } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,ff_render_job_id,status')
    .eq('run_id', run.id);
  if (!rendered || rendered.length === 0) return 'failed';

  const jobIds = rendered.map((r) => r.ff_render_job_id).filter(Boolean) as string[];
  if (jobIds.length === 0) return 'rendering';

  const { data: jobs } = await supabaseAdmin
    .from('ff_render_jobs')
    .select('id,status,output_url,duration_ms,error,shotstack_render_id')
    .in('id', jobIds);
  if (!jobs) return 'rendering';

  // Poll Shotstack for jobs that were dispatched there
  for (const j of jobs) {
    if (j.status === 'fallback_shotstack' && j.shotstack_render_id && !j.output_url) {
      try {
        const ss = await shotstackGetStatus(j.shotstack_render_id);
        const ssStatus: string = ss.response?.status || ss.status;
        const ssUrl: string | undefined = ss.response?.url || ss.url;
        if (ssStatus === 'done' && ssUrl) {
          j.status = 'done';
          j.output_url = ssUrl;
          await supabaseAdmin.from('ff_render_jobs').update({
            status: 'done', output_url: ssUrl, completed_at: new Date().toISOString(),
          }).eq('id', j.id);
        } else if (ssStatus === 'failed') {
          j.status = 'failed';
          j.error = ss.response?.error || 'Shotstack render failed';
          await supabaseAdmin.from('ff_render_jobs').update({
            status: 'failed', error: j.error,
          }).eq('id', j.id);
        }
        // else still rendering — leave as fallback_shotstack
      } catch (err) {
        console.warn('[ve-pipeline] Shotstack poll failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  let allDone = true;
  let anyFailed = false;

  for (const rc of rendered) {
    const j = jobMap.get(rc.ff_render_job_id ?? '');
    if (!j) { allDone = false; continue; }

    if (j.status === 'done' && rc.status !== 'complete') {
      await supabaseAdmin
        .from('ve_rendered_clips')
        .update({
          status: 'complete',
          output_url: j.output_url,
          duration_sec: j.duration_ms ? j.duration_ms / 1000 : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', rc.id);
    } else if (j.status === 'failed' && rc.status !== 'failed') {
      await supabaseAdmin
        .from('ve_rendered_clips')
        .update({ status: 'failed', error_message: j.error ?? 'render failed' })
        .eq('id', rc.id);
      anyFailed = true;
    } else if (j.status === 'claimed' || j.status === 'rendering' || j.status === 'uploading') {
      if (rc.status === 'queued') {
        await supabaseAdmin.from('ve_rendered_clips').update({ status: 'rendering' }).eq('id', rc.id);
      }
      allDone = false;
    } else if (j.status === 'pending' || j.status === 'fallback_shotstack') {
      allDone = false;
    }
  }

  // Once every clip's VIDEO is rendered, the run is complete. Packaging
  // (captions/hashtags/title) is best-effort metadata and must NOT block
  // completion — otherwise a packaging hiccup leaves a fully-rendered video
  // stuck at 'rendering' forever. packagePendingClips above still backfills
  // captions opportunistically; if it fails the run still completes with the
  // downloadable clip.
  if (allDone) {
    return anyFailed && rendered.every((r) => jobMap.get(r.ff_render_job_id ?? '')?.status === 'failed')
      ? 'failed'
      : 'complete';
  }
  return 'rendering';
}

// ---------------------------------------------------------------------------
// Public: tick one run
// ---------------------------------------------------------------------------

export async function tickRun(runId: string): Promise<TickResult> {
  const run = await loadRun(runId);
  if (!run) return { runId, fromStatus: 'failed', toStatus: 'failed', message: 'run not found' };
  if (run.status === 'complete' || run.status === 'failed') {
    return { runId, fromStatus: run.status, toStatus: run.status, message: 'terminal' };
  }
  if (!isMode(run.mode)) {
    return fail(runId, new Error(`Invalid mode: ${run.mode}`), run.status);
  }

  // Link-source gate: a link asset lives at storage_path 'link/...' until the
  // Mac-mini worker downloads it (yt-dlp) and rewrites storage_path/storage_url.
  // Until that happens there's nothing to transcribe, so hold the run in
  // 'created' rather than racing the downloader and failing on a 404. The mini
  // marks the run failed itself if the download genuinely can't be completed.
  if (run.status === 'created') {
    const { data: gateAsset } = await supabaseAdmin
      .from('ve_assets')
      .select('storage_path, metadata')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = (gateAsset?.metadata ?? {}) as Record<string, unknown>;
    const isLink = meta.source_kind === 'link' || (gateAsset?.storage_path ?? '').startsWith('link/');
    if (isLink && !meta.ingested) {
      return { runId, fromStatus: 'created', toStatus: 'created', message: 'awaiting link ingest' };
    }
  }

  // Bump attempts + last_tick_at + move into the active stage label.
  const activeStage: RunStatus =
    run.status === 'created' ? 'transcribing' :
    run.status === 'transcribing' ? 'transcribing' :
    run.status === 'analyzing' ? 'analyzing' :
    run.status === 'assembling' ? 'assembling' :
    'rendering';
  await setStatus(runId, activeStage);

  try {
    let next: RunStatus;
    switch (activeStage) {
      case 'transcribing': next = await stageTranscribe(run); break;
      case 'analyzing':    next = await stageAnalyze(run); break;
      case 'assembling':   next = await stageAssemble(run); break;
      case 'rendering':    next = await stageRendering(run); break;
      default:             next = 'failed';
    }

    // If rendering returned 'failed' without throwing, set a useful error message
    if (next === 'failed') {
      await setStatus(runId, 'failed', { error_message: `Pipeline failed at ${activeStage} stage` });
    } else {
      await setStatus(runId, next);
    }

    if (next === 'complete') {
      try {
        await markRecommendedClip(runId);
        await autoCreateExportJobs(runId, run.user_id);
      } catch (e) {
        console.warn('[ve-pipeline] post-complete hook error (non-fatal):', e instanceof Error ? e.message : e);
      }
    }

    return { runId, fromStatus: run.status, toStatus: next };
  } catch (err) {
    return fail(runId, err, activeStage);
  }
}

/**
 * Pick up to `max` active runs and tick each. Used by the cron handler.
 *
 * Concurrency: every-minute cron + ~5min render windows means multiple
 * function invocations are alive at once. Without a claim each invocation
 * picks the same oldest runs and races on shared /tmp + duplicate inserts.
 *
 * Claim model: a run is "claimed" if last_tick_at was updated within the
 * last CLAIM_TTL_MS. We do a conditional UPDATE that bumps last_tick_at
 * only when the row's current last_tick_at is older than that window (or
 * NULL). The UPDATE returns the rows we actually claimed — anything else
 * is being handled by a concurrent worker.
 */
const CLAIM_TTL_MS = 4 * 60 * 1000;

export async function tickActiveRuns(max = 5): Promise<TickResult[]> {
  const cutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();

  // First pass: find candidates ordered by stalest last_tick_at.
  const { data: candidates } = await supabaseAdmin
    .from('ve_runs')
    .select('id,last_tick_at')
    .not('status', 'in', '(complete,failed)')
    .order('last_tick_at', { ascending: true, nullsFirst: true })
    .limit(max * 3); // overfetch so claim contention still leaves us work

  if (!candidates || candidates.length === 0) return [];

  // Second pass: attempt to claim each by conditional UPDATE. Only the
  // first worker whose UPDATE wins the WHERE clause gets the row back.
  const claimed: string[] = [];
  for (const c of candidates) {
    if (claimed.length >= max) break;
    const id = c.id as string;
    // Claim via two precise filters instead of one `.or()` string. The old
    // `.or('last_tick_at.is.null,last_tick_at.lt.<ISO>')` matched ZERO rows
    // because the ISO timestamp's millisecond period (e.g. ...:48.312Z) breaks
    // PostgREST's dot-delimited or() parser — so the cron SAW pending runs but
    // never claimed one, and every Create run stalled at 'created' until the
    // 24h zombie sweep failed it. Confirmed in prod 2026-06-08: a normal tick
    // reported {created:1} but ticked 0, while a claim-bypassing force_id tick
    // advanced the same run instantly.
    let { data: upd } = await supabaseAdmin
      .from('ve_runs')
      .update({ last_tick_at: new Date().toISOString() })
      .eq('id', id)
      .lt('last_tick_at', cutoff)
      .select('id');
    if (!upd || upd.length === 0) {
      ({ data: upd } = await supabaseAdmin
        .from('ve_runs')
        .update({ last_tick_at: new Date().toISOString() })
        .eq('id', id)
        .is('last_tick_at', null)
        .select('id'));
    }
    if (upd && upd.length > 0) claimed.push(id);
  }

  // Advance each claimed run through as many stages as fit in this invocation,
  // instead of one stage per CLAIM_TTL window (which made a run crawl ~1 stage
  // / 4 min ≈ 15 min/video). We keep the 4-min claim TTL for concurrency safety
  // — the run is claimed ONCE here; this loop just keeps ticking the same run
  // within that single claim until it reaches a terminal state, stops making
  // progress, or we run low on the function's wall-clock budget (the render
  // stage is the slow one, so we cap to stay under the 300s function limit).
  const results: TickResult[] = [];
  const startedAt = Date.now();
  const MAX_WALL_MS = 240_000;
  for (const id of claimed) {
    let last = await tickRun(id);
    results.push(last);
    let guard = 0;
    while (
      last.toStatus !== 'complete' &&
      last.toStatus !== 'failed' &&
      last.toStatus !== last.fromStatus &&
      guard++ < 6 &&
      Date.now() - startedAt < MAX_WALL_MS
    ) {
      const next = await tickRun(id);
      results.push(next);
      last = next;
    }
    if (Date.now() - startedAt >= MAX_WALL_MS) break;
  }
  return results;
}
