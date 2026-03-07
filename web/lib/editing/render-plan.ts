/**
 * Render an EditPlan to a final video file using FFmpeg.
 *
 * Supported actions: keep, cut, text_overlay, speed, broll.
 * Unsupported action types are logged and skipped.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { uploadToStorage } from '@/lib/storage';
import { logContentItemEvent } from '@/lib/content-items/sync';
import { validateEditPlan } from './validate-edit-plan';
import type { EditPlan, EditPlanAction } from './types';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

/** Max render time: 5 minutes */
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

/** Storage bucket for rendered outputs */
const RENDER_BUCKET = 'renders';

// ── Public interface ────────────────────────────────────────────

export interface RenderResult {
  output_url: string;
  storage_path: string;
  duration_sec: number;
}

export interface RenderContentItemInput {
  contentItemId: string;
  actorId: string;
}

/**
 * Full render pipeline for a content item:
 * load → validate → download source → ffmpeg → upload → update DB.
 */
export async function renderContentItem(
  input: RenderContentItemInput,
): Promise<RenderResult> {
  const { contentItemId, actorId } = input;
  const tempFiles: string[] = [];

  try {
    // ── 1. Load content item ──────────────────────────────────
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('content_items')
      .select('id, workspace_id, raw_video_url, raw_video_storage_path, edit_plan_json, edit_status')
      .eq('id', contentItemId)
      .single();

    if (fetchErr || !item) {
      throw new Error(`Content item ${contentItemId} not found`);
    }

    if (!item.edit_plan_json) {
      throw new Error('No edit_plan_json on content item');
    }

    // ── 2. Validate plan ──────────────────────────────────────
    const validation = validateEditPlan(item.edit_plan_json);
    if (!validation.ok) {
      throw new Error(`Invalid edit plan: ${validation.errors!.join('; ')}`);
    }
    const plan = validation.data!;

    // ── 3. Set status → rendering ─────────────────────────────
    await supabaseAdmin
      .from('content_items')
      .update({ edit_status: 'rendering', render_error: null })
      .eq('id', contentItemId);

    await logContentItemEvent(contentItemId, 'render_requested', actorId, item.edit_status, 'rendering', {});

    // ── 4. Download source video ──────────────────────────────
    const sourceUrl = resolveSourceUrl(item.raw_video_url, item.raw_video_storage_path);
    if (!sourceUrl) {
      throw new Error('No raw video URL or storage path available');
    }

    const workDir = join(tmpdir(), `edit-render-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });
    tempFiles.push(workDir);

    const sourcePath = join(workDir, 'source.mp4');
    await downloadFile(sourceUrl, sourcePath);
    tempFiles.push(sourcePath);

    // ── 5. Render via FFmpeg ──────────────────────────────────
    const outputPath = join(workDir, 'output.mp4');
    tempFiles.push(outputPath);

    await renderPlan(sourcePath, plan, outputPath);

    // ── 6. Upload rendered file ───────────────────────────────
    const renderedBuffer = await readFile(outputPath);
    const storagePath = `editing/${item.workspace_id}/${contentItemId}_${Date.now()}.mp4`;
    const blob = new Blob([renderedBuffer], { type: 'video/mp4' });

    const uploadResult = await uploadToStorage(RENDER_BUCKET, storagePath, blob, {
      contentType: 'video/mp4',
      upsert: true,
    });

    // ── 7. Probe output duration ──────────────────────────────
    const durationSec = await probeDuration(outputPath);

    // ── 8. Update content item → rendered ─────────────────────
    await supabaseAdmin
      .from('content_items')
      .update({
        edit_status: 'rendered',
        rendered_video_url: uploadResult.url,
        rendered_video_storage_path: storagePath,
        render_error: null,
        last_rendered_at: new Date().toISOString(),
      })
      .eq('id', contentItemId);

    await logContentItemEvent(contentItemId, 'render_completed', actorId, 'rendering', 'rendered', {
      storage_path: storagePath,
      duration_sec: durationSec,
    });

    return {
      output_url: uploadResult.url,
      storage_path: storagePath,
      duration_sec: durationSec,
    };
  } catch (err) {
    // ── Failure path ────────────────────────────────────────
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[render-plan] Failed for ${contentItemId}:`, message);

    await supabaseAdmin
      .from('content_items')
      .update({
        edit_status: 'failed',
        render_error: message.slice(0, 1000),
      })
      .eq('id', contentItemId);

    await logContentItemEvent(contentItemId, 'render_failed', actorId, 'rendering', 'failed', {
      error: message.slice(0, 500),
    });

    throw err;
  } finally {
    await cleanupFiles(tempFiles);
  }
}

// ── FFmpeg rendering core ───────────────────────────────────────

/**
 * Render an EditPlan against a local source file, writing to outputPath.
 */
export async function renderPlan(
  sourcePath: string,
  plan: EditPlan,
  outputPath: string,
): Promise<void> {
  // Separate actions by type
  const keeps = plan.actions.filter(a => a.type === 'keep');
  const cuts = plan.actions.filter(a => a.type === 'cut');
  const speeds = plan.actions.filter(a => a.type === 'speed');
  const textOverlays = plan.actions.filter(a => a.type === 'text_overlay');
  const brolls = plan.actions.filter(a => a.type === 'broll');

  // Log unsupported action types
  const supported = new Set(['keep', 'cut', 'speed', 'text_overlay', 'broll']);
  for (const a of plan.actions) {
    if (!supported.has(a.type)) {
      console.warn(`[render-plan] Unsupported action type: ${a.type}, skipping`);
    }
  }

  // ── Step 1: Determine kept segments ───────────────────────
  // If explicit keeps exist, use them. Otherwise, derive from cuts.
  const segments = resolveSegments(keeps, cuts, plan.source_duration_sec);

  if (segments.length === 0) {
    throw new Error('Edit plan resolves to zero segments — nothing to render');
  }

  const workDir = join(outputPath, '..'); // same temp dir

  // ── Step 2: Extract & process each segment ────────────────
  const segmentFiles: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segPath = join(workDir, `seg_${i}.mp4`);
    segmentFiles.push(segPath);

    // Find speed adjustments overlapping this segment
    const speedAction = speeds.find(
      s => s.start_sec < seg.end && s.end_sec > seg.start
    );

    // Extract segment with optional speed adjustment
    const args = [
      '-y',
      '-ss', String(seg.start),
      '-to', String(seg.end),
      '-i', sourcePath,
      '-avoid_negative_ts', 'make_zero',
    ];

    const filters: string[] = [];

    // Speed filter
    if (speedAction && speedAction.type === 'speed') {
      const factor = speedAction.factor;
      filters.push(`setpts=${(1 / factor).toFixed(4)}*PTS`);
      // Audio tempo adjustment (atempo supports 0.5–2.0, chain for wider range)
      const audioFilters = buildAtempoChain(factor);
      args.push('-af', audioFilters);
    }

    // Text overlay filters for this segment
    const overlayTexts = textOverlays.filter(
      t => t.type === 'text_overlay' && t.start_sec < seg.end && t.end_sec > seg.start
    );
    for (const t of overlayTexts) {
      if (t.type !== 'text_overlay') continue;
      const relStart = Math.max(0, t.start_sec - seg.start);
      const relEnd = Math.min(seg.end - seg.start, t.end_sec - seg.start);
      const yPos = t.position === 'top' ? '50' : t.position === 'center' ? '(h-text_h)/2' : 'h-text_h-50';
      const escaped = escapeDrawtext(t.text);
      filters.push(
        `drawtext=text='${escaped}':fontsize=48:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${yPos}:enable='between(t,${relStart},${relEnd})'`
      );
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push(segPath);

    await execFileAsync(FFMPEG, args, { timeout: RENDER_TIMEOUT_MS });
  }

  // ── Step 3: Handle broll overlays on segments ─────────────
  const brollSegmentFiles: string[] = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const seg = segments[i];
    const applicableBrolls = brolls.filter(
      b => b.type === 'broll' && b.asset_url && b.start_sec < seg.end && b.end_sec > seg.start
    );

    if (applicableBrolls.length === 0) {
      brollSegmentFiles.push(segmentFiles[i]);
      continue;
    }

    // Overlay first matching broll clip
    const broll = applicableBrolls[0];
    if (broll.type !== 'broll' || !broll.asset_url) {
      brollSegmentFiles.push(segmentFiles[i]);
      continue;
    }

    const brollPath = join(workDir, `broll_${i}.mp4`);
    try {
      await downloadFile(broll.asset_url, brollPath);
    } catch (err) {
      console.warn(`[render-plan] Failed to download broll asset, skipping: ${err}`);
      brollSegmentFiles.push(segmentFiles[i]);
      continue;
    }

    const relStart = Math.max(0, broll.start_sec - seg.start);
    const relEnd = Math.min(seg.end - seg.start, broll.end_sec - seg.start);

    const brollOutputPath = join(workDir, `seg_broll_${i}.mp4`);
    segmentFiles.push(brollOutputPath); // track for cleanup

    await execFileAsync(FFMPEG, [
      '-y',
      '-i', segmentFiles[i],
      '-i', brollPath,
      '-filter_complex',
      `[1:v]scale=iw:ih[broll];[0:v][broll]overlay=0:0:enable='between(t,${relStart},${relEnd})'`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      brollOutputPath,
    ], { timeout: RENDER_TIMEOUT_MS });

    brollSegmentFiles.push(brollOutputPath);
    segmentFiles.push(brollPath); // track for cleanup
  }

  // ── Step 4: Concatenate all segments ──────────────────────
  if (brollSegmentFiles.length === 1) {
    // Single segment — just copy
    await execFileAsync(FFMPEG, [
      '-y', '-i', brollSegmentFiles[0],
      '-c', 'copy',
      outputPath,
    ], { timeout: RENDER_TIMEOUT_MS });
  } else {
    // Write concat list
    const concatListPath = join(workDir, 'concat.txt');
    const concatContent = brollSegmentFiles
      .map(f => `file '${f}'`)
      .join('\n');
    await writeFile(concatListPath, concatContent);
    segmentFiles.push(concatListPath);

    await execFileAsync(FFMPEG, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      outputPath,
    ], { timeout: RENDER_TIMEOUT_MS });
  }
}

// ── Segment resolution ──────────────────────────────────────────

interface Segment {
  start: number;
  end: number;
}

/**
 * Resolve final kept segments from explicit keeps and cuts.
 * If keeps are provided, use them directly.
 * If only cuts, invert them against source duration.
 */
function resolveSegments(
  keeps: EditPlanAction[],
  cuts: EditPlanAction[],
  duration: number,
): Segment[] {
  if (keeps.length > 0) {
    return keeps
      .map(k => ({ start: k.start_sec, end: k.end_sec }))
      .sort((a, b) => a.start - b.start);
  }

  if (cuts.length === 0) {
    // No keeps, no cuts → keep everything
    return [{ start: 0, end: duration }];
  }

  // Invert cuts to get keeps
  const sortedCuts = [...cuts]
    .map(c => ({ start: c.start_sec, end: c.end_sec }))
    .sort((a, b) => a.start - b.start);

  const result: Segment[] = [];
  let cursor = 0;

  for (const cut of sortedCuts) {
    if (cut.start > cursor) {
      result.push({ start: cursor, end: cut.start });
    }
    cursor = Math.max(cursor, cut.end);
  }

  if (cursor < duration) {
    result.push({ start: cursor, end: duration });
  }

  return result;
}

// ── FFmpeg helpers ──────────────────────────────────────────────

/**
 * Build atempo filter chain for speed factors outside 0.5–2.0 range.
 * FFmpeg's atempo only supports 0.5 to 100.0 but for quality, chain 0.5–2.0 steps.
 */
function buildAtempoChain(factor: number): string {
  if (factor >= 0.5 && factor <= 2.0) {
    return `atempo=${factor}`;
  }

  const parts: string[] = [];
  let remaining = factor;

  while (remaining > 2.0) {
    parts.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push('atempo=0.5');
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(4)}`);

  return parts.join(',');
}

/** Escape text for FFmpeg drawtext filter */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '%%');
}

/** Probe duration of a video file using ffmpeg */
async function probeDuration(filePath: string): Promise<number> {
  try {
    // Use ffmpeg's -i to get duration from stderr
    const { stderr } = await execFileAsync(FFMPEG, [
      '-i', filePath,
      '-f', 'null', '-',
    ], { timeout: 30_000 }).catch(err => {
      // ffmpeg exits with code 1 for -f null, but stderr has the info
      return { stdout: err.stdout || '', stderr: err.stderr || '' };
    });

    const match = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/.exec(stderr);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      const ms = parseInt(match[4], 10);
      return h * 3600 + m * 60 + s + ms / 100;
    }
  } catch {
    console.warn('[render-plan] Failed to probe duration');
  }
  return 0;
}

// ── File helpers ────────────────────────────────────────────────

function resolveSourceUrl(
  rawVideoUrl: string | null,
  rawVideoStoragePath: string | null,
): string | null {
  if (rawVideoUrl) return rawVideoUrl;
  if (rawVideoStoragePath) {
    const { data } = supabaseAdmin.storage
      .from('video-files')
      .getPublicUrl(rawVideoStoragePath);
    return data.publicUrl;
  }
  return null;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download ${url}: ${resp.status} ${resp.statusText}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(destPath, buffer);
}

async function cleanupFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const { rm } = await import('fs/promises');
        await rm(p, { recursive: true, force: true });
      }
    } catch { /* ignore cleanup errors */ }
  }
}
