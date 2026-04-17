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
import { generateCandidates } from './scoring';
import { resolveRenderTemplateKeys, getTemplateOrDefault } from './templates';
import { getCTAOrDefault } from './ctas';
import { renderVideo as shotstackRenderVideo, getRenderStatus as shotstackGetStatus } from '@/lib/shotstack';
import { renderClipLocal } from './render-local';
import { deriveInsights } from './insights';
import { detectIntent } from './intent';
import { resolveVEPlan, WATERMARK_TEXT } from './limits';
import { watermarkClip } from './templates/shared';
import { packageClip } from './packaging';
import { notifyTerminalRun } from './notify';
import { markRecommendedClip, autoCreateExportJobs } from './distribution';

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
  await supabaseAdmin
    .from('ve_runs')
    .update({
      status: 'failed',
      error_message: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
      last_tick_at: new Date().toISOString(),
    })
    .eq('id', runId);
  notifyTerminalRun(runId).catch(() => {});
  return { runId, fromStatus, toStatus: 'failed', message };
}

// ---------------------------------------------------------------------------
// Stage handlers
// ---------------------------------------------------------------------------

async function stageTranscribe(run: RunRow): Promise<RunStatus> {
  const asset = await loadAsset(run.id);
  if (!asset) throw new Error('No asset found for run');

  const result = await transcribeStorageAsset({
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
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

  const { selected } = generateCandidates(segments, run.mode, run.target_clip_count);
  if (!selected.length) {
    throw new Error('Scoring produced zero candidates');
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
    return {
      run_id: run.id,
      asset_id: asset.id,
      user_id: run.user_id,
      start_sec: c.start,
      end_sec: c.end,
      text: c.text,
      hook_text: c.hookText,
      clip_type: c.clipType,
      score: c.score,
      score_breakdown_json: c.scoreBreakdown,
      selected: true,
      rank: c.rank,
      hook_strength: insight.hookStrength,
      suggested_use: insight.suggestedUse,
      selection_reason: insight.selectionReason,
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

  for (let i = 0; i < candidates.length; i++) {
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

    ffJobRows.push({
      id: ffJobId,
      user_id: run.user_id,
      correlation_id: `ve:${run.id}:${renderedId}`,
      kind: 'shotstack_timeline',
      priority: planForPriority.renderPriority,
      timeline,
      output_spec: { format: 'mp4', resolution: 'sd', aspectRatio: '9:16', fps: 30 },
      status: 'pending',
    });
  }

  // Insert rendered_clips first so a worker that picks up an ff_render_job
  // can find its parent row by correlation_id.
  const { error: rcErr } = await supabaseAdmin.from('ve_rendered_clips').insert(renderedRows);
  if (rcErr) throw new Error(`Failed to insert rendered_clips: ${rcErr.message}`);

  const { error: ffErr } = await supabaseAdmin.from('ff_render_jobs').insert(ffJobRows);
  if (ffErr) {
    await supabaseAdmin.from('ve_rendered_clips').delete().eq('run_id', run.id);
    throw new Error(`Failed to enqueue ff_render_jobs: ${ffErr.message}`);
  }

  // Render each clip. Default path is local ffmpeg (reliable, no external
  // dependencies). Shotstack remains available as a future escalation but the
  // current account has no credits + no video-asset feature so we no longer
  // dispatch to it. Set VIDEO_ENGINE_RENDERER=shotstack to re-enable.
  const renderer = (process.env.VIDEO_ENGINE_RENDERER || 'local').toLowerCase();

  if (renderer === 'local') {
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const renderedRow = renderedRows[i];
      const jobRow = ffJobRows[i];
      const jobId = jobRow.id as string;
      const clipId = renderedRow.id as string;
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
        const result = await renderClipLocal({
          sourceBucket: asset.storage_bucket,
          sourcePath: asset.storage_path,
          startSec: Number(cand.start_sec),
          endSec: Number(cand.end_sec),
          userId: run.user_id,
          clipId,
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
  } else {
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
  }

  return 'rendering';
}

/**
 * Package up to PACKAGING_PER_TICK clips that are still pending.
 * Runs INSIDE stageRendering so packaging completes in parallel with renders.
 * Best-effort: any single failure marks that clip as 'failed' and the run continues.
 */
async function packagePendingClips(run: RunRow): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id,template_key,cta_key,candidate_id')
    .eq('run_id', run.id)
    .eq('package_status', 'pending')
    .limit(PACKAGING_PER_TICK);
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
      const pkg = await packageClip({
        mode: run.mode,
        clipText: cand.text,
        hookText: cand.hook_text,
        clipType: cand.clip_type,
        durationSec: Number(cand.end_sec) - Number(cand.start_sec),
        templateKey: rc.template_key as string,
        ctaSuggestionFromTemplate: cta.overlayText,
        context: run.context_json ?? {},
      }, { correlationId: `ve-pkg:${run.id}:${rc.id}` });

      await supabaseAdmin
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

  // Block "complete" until packaging has had a chance to finish on every clip.
  if (allDone) {
    const { count: stillPending } = await supabaseAdmin
      .from('ve_rendered_clips')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('package_status', 'pending');
    if ((stillPending ?? 0) > 0) {
      // Stay in 'rendering' so the next tick keeps draining the packaging queue.
      return 'rendering';
    }

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
 */
export async function tickActiveRuns(max = 5): Promise<TickResult[]> {
  const { data: rows } = await supabaseAdmin
    .from('ve_runs')
    .select('id')
    .not('status', 'in', '(complete,failed)')
    .order('last_tick_at', { ascending: true, nullsFirst: true })
    .limit(max);

  if (!rows || rows.length === 0) return [];

  const results: TickResult[] = [];
  for (const r of rows) {
    results.push(await tickRun(r.id as string));
  }
  return results;
}
