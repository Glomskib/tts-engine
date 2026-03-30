/**
 * Render an EditPlan to a final video file using FFmpeg.
 *
 * Supported actions:
 *   keep, cut, text_overlay, speed, broll,
 *   end_card, normalize_audio, burn_captions,
 *   remove_silence, watermark
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, mkdir, stat } from 'fs/promises';
import { existsSync, createWriteStream, createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { uploadToStorage } from '@/lib/storage';
import { logContentItemEvent } from '@/lib/content-items/sync';
import { captureRouteError } from '@/lib/errorTracking';
import { validateEditPlan } from './validate-edit-plan';
import type { EditPlan, EditPlanAction } from './types';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000; // 3 min max to download source
const RENDER_BUCKET = 'renders';

// ── User-friendly error translation ────────────────────────────
function translateFFmpegError(rawError: string): string {
  const e = rawError.toLowerCase();
  if (e.includes('no such file') || e.includes('enoent'))
    return 'FFmpeg binary not found. Server configuration error — contact support.';
  if (e.includes('invalid data found') || e.includes('invalid argument') || e.includes('moov atom not found'))
    return 'The video file appears to be corrupt or in an unsupported format. Try re-exporting from your phone as MP4.';
  if (e.includes('no space left'))
    return 'Server ran out of disk space during render. Try again in a few minutes.';
  if (e.includes('killed') || e.includes('timeout'))
    return 'Render timed out. Your video may be too long — try trimming it to under 3 minutes.';
  if (e.includes('permission denied'))
    return 'Server permission error during render — contact support.';
  if (e.includes('output file is empty') || e.includes('output file #0 does not contain any stream'))
    return 'Render produced an empty video. Check your edit plan — all segments may have been cut.';
  if (e.includes('encoder') || e.includes('codec'))
    return 'Video encoding failed. Try uploading your video in MP4/H.264 format.';
  // Return a trimmed version of the raw error (first meaningful line only)
  const firstLine = rawError.split('\n').find(l => l.trim().length > 10 && !l.startsWith('  '));
  return firstLine ? `Render error: ${firstLine.trim().slice(0, 200)}` : 'Render failed — unknown error. Contact support.';
}

async function safeExecFFmpeg(args: string[], timeout = RENDER_TIMEOUT_MS): Promise<void> {
  try {
    await execFileAsync(FFMPEG, args, { timeout });
  } catch (err) {
    const raw = err instanceof Error ? (err.message + '\n' + ((err as NodeJS.ErrnoException & { stderr?: string }).stderr || '')) : String(err);
    throw new Error(translateFFmpegError(raw));
  }
}

// ── Pre-render validation ───────────────────────────────────────
async function preflight(sourceUrl: string, sourcePath: string): Promise<void> {
  // 1. Check FFmpeg binary exists
  if (!existsSync(FFMPEG)) {
    throw new Error('FFmpeg binary not found. Server configuration error — contact support.');
  }

  // 2. Check source file downloaded and is a real video (>10KB)
  try {
    const info = await stat(sourcePath);
    if (info.size < 10_000) {
      throw new Error(`Downloaded file is too small (${info.size} bytes). The video URL may have expired — try re-uploading.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('bytes')) throw err;
    throw new Error('Source video file missing after download — contact support.');
  }

  // 3. Quick FFmpeg probe to validate the file is a real video
  try {
    await execFileAsync(FFMPEG, ['-v', 'error', '-i', sourcePath, '-f', 'null', '-'], { timeout: 30_000 });
  } catch (err) {
    // FFmpeg always exits non-zero on -f null, so check stderr for actual errors
    const stderr = err instanceof Error ? ((err as NodeJS.ErrnoException & { stderr?: string }).stderr || '') : '';
    if (stderr.includes('Invalid data found') || stderr.includes('moov atom not found') || stderr.includes('No such file')) {
      throw new Error(translateFFmpegError(stderr));
    }
    // Otherwise the probe "failed" normally (expected with -f null), file is fine
  }

  void sourceUrl; // used indirectly via sourcePath
}

// ── Timed action check ──────────────────────────────────────────
const TIMED_ACTIONS = new Set(['cut', 'keep', 'text_overlay', 'broll', 'speed']);

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
 * Full render pipeline for a content item.
 */
export async function renderContentItem(
  input: RenderContentItemInput,
): Promise<RenderResult> {
  const { contentItemId, actorId } = input;
  const tempFiles: string[] = [];

  try {
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('content_items')
      .select('id, workspace_id, raw_video_url, raw_video_storage_path, edit_plan_json, edit_status, transcript_json')
      .eq('id', contentItemId)
      .single();

    if (fetchErr || !item) throw new Error(`Content item ${contentItemId} not found`);
    if (!item.edit_plan_json) throw new Error('No edit_plan_json on content item');

    const validation = validateEditPlan(item.edit_plan_json);
    if (!validation.ok) throw new Error(`Invalid edit plan: ${validation.errors!.join('; ')}`);
    const plan = validation.data!;

    await supabaseAdmin
      .from('content_items')
      .update({ edit_status: 'rendering', render_error: null })
      .eq('id', contentItemId);

    await logContentItemEvent(contentItemId, 'render_requested', actorId, item.edit_status, 'rendering', {});

    const sourceUrl = resolveSourceUrl(item.raw_video_url, item.raw_video_storage_path);
    if (!sourceUrl) throw new Error('No raw video URL or storage path available');

    const workDir = join(tmpdir(), `edit-render-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });
    tempFiles.push(workDir);

    const sourcePath = join(workDir, 'source.mp4');
    await downloadFile(sourceUrl, sourcePath);
    await preflight(sourceUrl, sourcePath);

    const outputPath = join(workDir, 'output.mp4');

    await renderPlan(sourcePath, plan, outputPath, {
      transcriptJson: item.transcript_json as TranscriptWord[] | null,
    });

    // Validate output exists and is non-empty before uploading
    const outputInfo = await stat(outputPath).catch(() => null);
    if (!outputInfo || outputInfo.size < 1000) {
      throw new Error('Render produced an empty or missing output file. Check your edit plan — all segments may have been cut.');
    }

    const storagePath = `editing/${item.workspace_id}/${contentItemId}_${Date.now()}.mp4`;
    const uploadResult = await uploadRenderStream(outputPath, storagePath);

    const durationSec = await probeDuration(outputPath);

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

    return { output_url: uploadResult.url, storage_path: storagePath, duration_sec: durationSec };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message;
    console.error(`[render-plan] Failed for ${contentItemId}:`, message);

    captureRouteError(error, {
      route: 'editing-engine/render',
      feature: 'editing-engine',
      contentItemId,
      userId: actorId,
      severity: 'error',
    });

    await supabaseAdmin
      .from('content_items')
      .update({ edit_status: 'failed', render_error: message.slice(0, 1000) })
      .eq('id', contentItemId);

    await logContentItemEvent(contentItemId, 'render_failed', actorId, 'rendering', 'failed', {
      error: message.slice(0, 500),
    });

    throw err;
  } finally {
    await cleanupFiles(tempFiles);
  }
}

// ── Types ───────────────────────────────────────────────────────

interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

interface RenderOptions {
  transcriptJson?: TranscriptWord[] | null;
}

// ── FFmpeg rendering core ───────────────────────────────────────

export async function renderPlan(
  sourcePath: string,
  plan: EditPlan,
  outputPath: string,
  options: RenderOptions = {},
): Promise<void> {
  const keeps = plan.actions.filter(a => a.type === 'keep');
  const cuts = plan.actions.filter(a => a.type === 'cut');
  const speeds = plan.actions.filter(a => a.type === 'speed');
  const textOverlays = plan.actions.filter(a => a.type === 'text_overlay');
  const brolls = plan.actions.filter(a => a.type === 'broll');
  const endCard = plan.actions.find(a => a.type === 'end_card');
  const normalizeAudio = plan.actions.find(a => a.type === 'normalize_audio');
  const burnCaptions = plan.actions.find(a => a.type === 'burn_captions');
  const removeSilence = plan.actions.find(a => a.type === 'remove_silence');
  const watermarkAction = plan.actions.find(a => a.type === 'watermark');

  // Log unsupported action types
  const supported = new Set([
    'keep', 'cut', 'speed', 'text_overlay', 'broll',
    'end_card', 'normalize_audio', 'burn_captions',
    'remove_silence', 'watermark',
  ]);
  for (const a of plan.actions) {
    if (!supported.has(a.type)) {
      console.warn(`[render-plan] Unsupported action type: ${a.type}, skipping`);
    }
  }

  // ── Resolve output dimensions ─────────────────────────────
  const [outW, outH] = (plan.output.resolution || '1080x1920').split('x').map(Number);

  // ── Step 0: Remove silence (pre-process source) ───────────
  let effectiveSource = sourcePath;
  const workDir = join(outputPath, '..');

  if (removeSilence && removeSilence.type === 'remove_silence' && removeSilence.enabled !== false) {
    const silenceRemovedPath = join(workDir, 'silence_removed.mp4');
    try {
      await removeSilenceFromVideo(
        sourcePath,
        silenceRemovedPath,
        removeSilence.threshold_db,
        removeSilence.min_duration_ms,
        removeSilence.padding_ms,
      );
      effectiveSource = silenceRemovedPath;
    } catch (err) {
      console.warn(`[render-plan] Silence removal failed, using original: ${err}`);
    }
  }

  // ── Step 1: Determine kept segments ───────────────────────
  const segments = resolveSegments(keeps, cuts, plan.source_duration_sec);
  if (segments.length === 0) {
    throw new Error('Your edit plan has no segments to keep. All content was cut. Add a "keep" action or remove conflicting "cut" actions, then regenerate the plan.');
  }

  // ── Step 2: Extract & process each segment ────────────────
  const segmentFiles: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segPath = join(workDir, `seg_${i}.mp4`);
    segmentFiles.push(segPath);

    const speedAction = speeds.find(s => s.start_sec < seg.end && s.end_sec > seg.start);

    const args = [
      '-y',
      '-ss', String(seg.start),
      '-to', String(seg.end),
      '-i', effectiveSource,
      '-avoid_negative_ts', 'make_zero',
    ];

    const videoFilters: string[] = [];
    const audioFilters: string[] = [];

    // Speed
    if (speedAction && speedAction.type === 'speed') {
      videoFilters.push(`setpts=${(1 / speedAction.factor).toFixed(4)}*PTS`);
      audioFilters.push(buildAtempoChain(speedAction.factor));
    }

    // Text overlays
    const overlayTexts = textOverlays.filter(
      t => t.type === 'text_overlay' && t.start_sec < seg.end && t.end_sec > seg.start
    );
    for (const t of overlayTexts) {
      if (t.type !== 'text_overlay') continue;
      const relStart = Math.max(0, t.start_sec - seg.start);
      const relEnd = Math.min(seg.end - seg.start, t.end_sec - seg.start);
      const yPos = t.position === 'top' ? '50' : t.position === 'center' ? '(h-text_h)/2' : 'h-text_h-50';
      const escaped = escapeDrawtext(t.text);
      videoFilters.push(
        `drawtext=text='${escaped}':fontsize=48:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${yPos}:enable='between(t,${relStart},${relEnd})'`
      );
    }

    // Burn captions for this segment
    if (burnCaptions && burnCaptions.type === 'burn_captions' && burnCaptions.enabled !== false && options.transcriptJson) {
      const segCaptions = options.transcriptJson.filter(
        w => w.start >= seg.start && w.end <= seg.end
      );
      if (segCaptions.length > 0) {
        const captionFilters = buildCaptionFilters(segCaptions, seg.start, burnCaptions);
        videoFilters.push(...captionFilters);
      }
    }

    // Watermark
    if (watermarkAction && watermarkAction.type === 'watermark' && watermarkAction.text) {
      const wmFilter = buildWatermarkFilter(watermarkAction);
      videoFilters.push(wmFilter);
    }

    // Scale/pad for aspect ratio
    videoFilters.push(`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`);
    videoFilters.push(`pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`);

    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','));
    }
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push(segPath);

    await safeExecFFmpeg(args, RENDER_TIMEOUT_MS);
  }

  // ── Step 3: B-roll overlays ───────────────────────────────
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

    await safeExecFFmpeg([
      '-y',
      '-i', segmentFiles[i],
      '-i', brollPath,
      '-filter_complex',
      `[1:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2[broll];[0:v][broll]overlay=0:0:enable='between(t,${relStart},${relEnd})'`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      brollOutputPath,
    ]);

    brollSegmentFiles.push(brollOutputPath);
  }

  // ── Step 4: Generate end card if requested ────────────────
  if (endCard && endCard.type === 'end_card') {
    const endCardPath = join(workDir, 'end_card.mp4');
    await generateEndCard(endCardPath, endCard, outW, outH);
    brollSegmentFiles.push(endCardPath);
  }

  // ── Step 5: Concatenate all segments ──────────────────────
  const preLoudnormPath = join(workDir, 'pre_loudnorm.mp4');
  const concatTarget = (normalizeAudio && normalizeAudio.type === 'normalize_audio' && normalizeAudio.enabled !== false)
    ? preLoudnormPath
    : outputPath;

  if (brollSegmentFiles.length === 1) {
    await safeExecFFmpeg(['-y', '-i', brollSegmentFiles[0], '-c', 'copy', concatTarget]);
  } else {
    const concatListPath = join(workDir, 'concat.txt');
    const concatContent = brollSegmentFiles.map(f => `file '${f}'`).join('\n');
    await writeFile(concatListPath, concatContent);

    await safeExecFFmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      concatTarget,
    ]);
  }

  // ── Step 6: Audio normalization (post-process) ────────────
  if (normalizeAudio && normalizeAudio.type === 'normalize_audio' && normalizeAudio.enabled !== false) {
    const targetLufs = normalizeAudio.target_lufs ?? -14;
    try {
      await safeExecFFmpeg([
        '-y', '-i', concatTarget,
        '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '128k',
        outputPath,
      ]);
    } catch (err) {
      console.warn(`[render-plan] Audio normalization failed, copying raw: ${err}`);
      await safeExecFFmpeg(['-y', '-i', concatTarget, '-c', 'copy', outputPath]);
    }
  }
}

// ── End Card Generator ──────────────────────────────────────────

async function generateEndCard(
  outputPath: string,
  action: Extract<EditPlanAction, { type: 'end_card' }>,
  width: number,
  height: number,
): Promise<void> {
  const duration = action.duration_sec ?? 2;
  const bgColor = action.bg_color || '#000000';
  const textColor = action.text_color || '#FFFFFF';
  const mainText = action.text || '';
  const subText = action.subtext || '';

  const filters: string[] = [];

  if (mainText) {
    const escaped = escapeDrawtext(mainText);
    const yMain = subText ? `(h/2)-40` : `(h-text_h)/2`;
    filters.push(
      `drawtext=text='${escaped}':fontsize=56:fontcolor=${textColor}:x=(w-text_w)/2:y=${yMain}`
    );
  }

  if (subText) {
    const escaped = escapeDrawtext(subText);
    filters.push(
      `drawtext=text='${escaped}':fontsize=32:fontcolor=${textColor}@0.7:x=(w-text_w)/2:y=(h/2)+20`
    );
  }

  const filterStr = filters.length > 0
    ? `color=c=${bgColor}:s=${width}x${height}:d=${duration},${filters.join(',')}`
    : `color=c=${bgColor}:s=${width}x${height}:d=${duration}`;

  await safeExecFFmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', filterStr,
    '-f', 'lavfi',
    '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outputPath,
  ], 30_000);
}

// ── Silence Removal ─────────────────────────────────────────────

/**
 * Remove silent segments from a video using FFmpeg silencedetect.
 * Approach: detect silence → invert to get speech segments → concat.
 */
async function removeSilenceFromVideo(
  inputPath: string,
  outputPath: string,
  thresholdDb: number,
  minDurationMs: number,
  paddingMs: number,
): Promise<void> {
  const minDurationSec = minDurationMs / 1000;
  const paddingSec = paddingMs / 1000;

  // Step 1: Detect silence
  const { stderr } = await execFileAsync(FFMPEG, [
    '-i', inputPath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
    '-f', 'null', '-',
  ], { timeout: RENDER_TIMEOUT_MS }).catch(err => ({
    stdout: err.stdout || '', stderr: err.stderr || '',
  }));

  // Parse silence ranges from stderr
  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];

  for (const line of stderr.split('\n')) {
    const startMatch = /silence_start:\s*([\d.]+)/.exec(line);
    if (startMatch) silenceStarts.push(parseFloat(startMatch[1]));
    const endMatch = /silence_end:\s*([\d.]+)/.exec(line);
    if (endMatch) silenceEnds.push(parseFloat(endMatch[1]));
  }

  if (silenceStarts.length === 0) {
    // No silence detected, copy as-is
    await safeExecFFmpeg(['-y', '-i', inputPath, '-c', 'copy', outputPath]);
    return;
  }

  // Step 2: Build speech segments (inverse of silence)
  const duration = await probeDuration(inputPath);
  const speechSegments: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (let i = 0; i < silenceStarts.length; i++) {
    const silStart = Math.max(0, silenceStarts[i] - paddingSec);
    const silEnd = i < silenceEnds.length ? silenceEnds[i] + paddingSec : duration;

    if (silStart > cursor + 0.05) {
      speechSegments.push({ start: cursor, end: silStart });
    }
    cursor = silEnd;
  }

  if (cursor < duration - 0.05) {
    speechSegments.push({ start: cursor, end: duration });
  }

  if (speechSegments.length === 0) {
    // All silence — keep original
    await safeExecFFmpeg(['-y', '-i', inputPath, '-c', 'copy', outputPath]);
    return;
  }

  // Step 3: Extract and concat speech segments
  const workDir = join(outputPath, '..');
  const segFiles: string[] = [];

  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    const segPath = join(workDir, `speech_${i}.mp4`);
    segFiles.push(segPath);
    await safeExecFFmpeg([
      '-y', '-ss', String(seg.start), '-to', String(seg.end),
      '-i', inputPath, '-avoid_negative_ts', 'make_zero',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      segPath,
    ]);
  }

  if (segFiles.length === 1) {
    await safeExecFFmpeg(['-y', '-i', segFiles[0], '-c', 'copy', outputPath]);
  } else {
    const concatPath = join(workDir, 'speech_concat.txt');
    await writeFile(concatPath, segFiles.map(f => `file '${f}'`).join('\n'));
    await safeExecFFmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      outputPath,
    ]);
  }
}

// ── Caption Burn-in ─────────────────────────────────────────────

function buildCaptionFilters(
  words: TranscriptWord[],
  segOffset: number,
  config: Extract<EditPlanAction, { type: 'burn_captions' }>,
): string[] {
  // Group words into ~3-5 word chunks for readable captions
  const chunks: Array<{ start: number; end: number; text: string }> = [];
  let current: typeof chunks[0] | null = null;
  let wordCount = 0;

  for (const w of words) {
    if (!current || wordCount >= 4) {
      if (current) chunks.push(current);
      current = { start: w.start - segOffset, end: w.end - segOffset, text: w.text.trim() };
      wordCount = 1;
    } else {
      current.end = w.end - segOffset;
      current.text += ' ' + w.text.trim();
      wordCount++;
    }
  }
  if (current) chunks.push(current);

  const fontSize = config.font_size ?? 42;
  const yPos = config.position === 'center' ? '(h-text_h)/2' : 'h-text_h-80';

  const borderW = config.style === 'outline' ? 3 : config.style === 'bold' ? 2 : 1;
  const shadowX = config.style === 'bold' ? 2 : 0;
  const shadowY = config.style === 'bold' ? 2 : 0;

  return chunks.map(c => {
    const escaped = escapeDrawtext(c.text);
    return `drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=white:borderw=${borderW}:bordercolor=black:shadowx=${shadowX}:shadowy=${shadowY}:shadowcolor=black@0.5:x=(w-text_w)/2:y=${yPos}:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`;
  });
}

// ── Watermark ───────────────────────────────────────────────────

function buildWatermarkFilter(
  action: Extract<EditPlanAction, { type: 'watermark' }>,
): string {
  if (!action.text) return '';
  const escaped = escapeDrawtext(action.text);
  const opacity = action.opacity ?? 0.7;

  let x: string, y: string;
  switch (action.position) {
    case 'top-left':     x = '20'; y = '20'; break;
    case 'top-right':    x = 'w-text_w-20'; y = '20'; break;
    case 'bottom-left':  x = '20'; y = 'h-text_h-20'; break;
    default:             x = 'w-text_w-20'; y = 'h-text_h-20'; break;
  }

  return `drawtext=text='${escaped}':fontsize=24:fontcolor=white@${opacity}:x=${x}:y=${y}`;
}

// ── Segment resolution ──────────────────────────────────────────

interface Segment { start: number; end: number; }

function resolveSegments(
  keeps: EditPlanAction[],
  cuts: EditPlanAction[],
  duration: number,
): Segment[] {
  if (keeps.length > 0) {
    return keeps
      .map(k => ({ start: (k as { start_sec: number }).start_sec, end: (k as { end_sec: number }).end_sec }))
      .sort((a, b) => a.start - b.start);
  }

  if (cuts.length === 0) {
    return [{ start: 0, end: duration }];
  }

  const sortedCuts = [...cuts]
    .map(c => ({ start: (c as { start_sec: number }).start_sec, end: (c as { end_sec: number }).end_sec }))
    .sort((a, b) => a.start - b.start);

  const result: Segment[] = [];
  let cursor = 0;

  for (const cut of sortedCuts) {
    if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < duration) result.push({ start: cursor, end: duration });

  return result;
}

// ── FFmpeg helpers ──────────────────────────────────────────────

function buildAtempoChain(factor: number): string {
  if (factor >= 0.5 && factor <= 2.0) return `atempo=${factor}`;

  const parts: string[] = [];
  let remaining = factor;
  while (remaining > 2.0) { parts.push('atempo=2.0'); remaining /= 2.0; }
  while (remaining < 0.5) { parts.push('atempo=0.5'); remaining /= 0.5; }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(',');
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '%%');
}

async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stderr } = await execFileAsync(FFMPEG, [
      '-i', filePath, '-f', 'null', '-',
    ], { timeout: 30_000 }).catch(err => ({
      stdout: err.stdout || '', stderr: err.stderr || '',
    }));

    const match = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/.exec(stderr);
    if (match) {
      return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
    }
  } catch { console.warn('[render-plan] Failed to probe duration'); }
  return 0;
}

// ── File helpers ────────────────────────────────────────────────

function resolveSourceUrl(
  rawVideoUrl: string | null,
  rawVideoStoragePath: string | null,
): string | null {
  if (rawVideoUrl) return rawVideoUrl;
  if (rawVideoStoragePath) {
    const { data } = supabaseAdmin.storage.from('video-files').getPublicUrl(rawVideoStoragePath);
    return data.publicUrl;
  }
  return null;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      // Check if the response is an HTML error page (expired signed URL, 403, etc.)
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        throw new Error(`Video URL has expired or is inaccessible (${resp.status}). Try re-uploading your video.`);
      }
      throw new Error(`Failed to download video (${resp.status} ${resp.statusText}). The video URL may have expired — try re-uploading.`);
    }
    if (!resp.body) throw new Error('Video download returned empty response. Try re-uploading your video.');
    const writeStream = createWriteStream(destPath);
    await pipeline(Readable.fromWeb(resp.body as import('stream/web').ReadableStream), writeStream);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Video download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s. Your video file may be too large or the server is slow. Try again.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function uploadRenderStream(filePath: string, storagePath: string): Promise<{ url: string }> {
  // Stream directly to Supabase instead of loading entire file into RAM
  const fileStream = createReadStream(filePath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabaseAdmin.storage
    .from(RENDER_BUCKET)
    .upload(storagePath, fileStream as any, {
      contentType: 'video/mp4',
      upsert: true,
      duplex: 'half',
    } as any);

  if (error) {
    const msg = error.message || String(error);
    if (msg.includes('Bucket not found') || msg.includes('bucket') || msg.includes('404')) {
      throw new Error('Renders storage bucket not found. Contact support — server setup is incomplete.');
    }
    if (msg.includes('exceeded') || msg.includes('too large') || msg.includes('413')) {
      throw new Error('Rendered video is too large to store. Try shortening your video or reducing quality.');
    }
    throw new Error(`Failed to save rendered video: ${msg}`);
  }

  const { data: urlData } = supabaseAdmin.storage.from(RENDER_BUCKET).getPublicUrl(storagePath);
  return { url: urlData.publicUrl };
}

async function cleanupFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const { rm } = await import('fs/promises');
        await rm(p, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  }
}
