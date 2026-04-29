/**
 * Preview-render implementation for the Mac mini edit worker.
 *
 * Scope (Phase 2 + caption burn-in, 2026-04-29):
 *   - fetch the edit_plan JSON for a claimed render_jobs row
 *   - fetch source clip storage paths
 *   - download each clip from Supabase Storage to a tmp dir
 *   - run ffmpeg to trim each segment, concatenate, scale/crop to 9:16
 *   - **NEW: burn captions into the final scale pass when plan.captions.enabled is true**
 *     and any segment has subtitleText. Captions are mapped to OUTPUT timestamps
 *     (not source) so they line up correctly after trim+concat.
 *   - upload the result back to Storage under `<user_id>/<project_id>/preview-<job_id>.mp4`
 *   - return the uploaded storage path (caller writes it to render_jobs.preview_url)
 *
 * NOT in scope yet:
 *   - overlay text (hook_text / cta_text — separate ASS dialogue layer, easy follow-up)
 *   - music mixing
 *   - final (non-preview) renders at higher quality
 *   - hardware acceleration / h264_videotoolbox tuning
 *   - progress reporting beyond coarse step boundaries
 *
 * The code is intentionally straightforward — correctness over polish. All
 * ffmpeg invocations use `-y` to overwrite and exit on error.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appendLog, setJobProgress } from './claim.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const ffmpegPath: string = (await import('@ffmpeg-installer/ffmpeg')).default.path;

interface EditSegment {
  clipId: string;
  startMs: number;
  endMs: number;
  /** Optional caption text burned into this segment's portion of the output. */
  subtitleText?: string;
  emphasis?: 'hook' | 'proof' | 'cta' | 'broll';
}

interface EditCaptions {
  enabled: boolean;
  stylePreset?: string;
  position?: 'top' | 'center' | 'bottom';
  highlightKeywords?: boolean;
}

interface EditOverlay {
  type: 'hook_text' | 'cta_text';
  text: string;
  /** OUTPUT-time start (worker recomputes this anyway for safety). */
  startMs: number;
  endMs: number;
  stylePreset?: string;
}

interface EditPlan {
  projectId: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  /** Optional explicit hook text — auto-rendered as a top-of-screen overlay during the first segment. */
  hookText?: string;
  segments: EditSegment[];
  captions?: EditCaptions;
  /** Explicit overlay list. Coexists with hookText (which we treat as a shortcut for one hook overlay). */
  overlays?: EditOverlay[];
}

/** Output dimensions per canonical aspect ratio. */
const ASPECT_TO_DIMS: Record<EditPlan['aspectRatio'], { w: number; h: number; label: '1080x1920' | '1920x1080' | '1080x1080' }> = {
  '9:16': { w: 1080, h: 1920, label: '1080x1920' },
  '16:9': { w: 1920, h: 1080, label: '1920x1080' },
  '1:1': { w: 1080, h: 1080, label: '1080x1080' },
};

/**
 * Wrap a long caption into ≤2 lines of ≤36 chars each (vertical) or ≤48 (horizontal).
 * If the text exceeds 2 lines worth, truncate with an ellipsis on the second line.
 * Keeps captions readable on phone screens without extra deps.
 */
function wrapCaption(text: string, maxCharsPerLine: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxCharsPerLine) return t;
  const words = t.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (lines.length === 2) break;
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current = current + ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  // If we ran out of room and there's more, ellipsize the last line.
  const used = lines.join(' ').length;
  if (used + 1 < t.length && lines.length === 2) {
    const last = lines[1];
    if (last.length > maxCharsPerLine - 1) {
      lines[1] = last.slice(0, maxCharsPerLine - 1) + '…';
    } else {
      lines[1] = last + '…';
    }
  }
  return lines.join('\\N');
}

interface RenderContext {
  supabase: SupabaseClient;
  jobId: string;
  userId: string;
  projectId: string;
  planId: string;
  bucket: string;
  tmpRoot: string;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function loadPlan(ctx: RenderContext): Promise<EditPlan> {
  const { data, error } = await ctx.supabase
    .from('edit_plans')
    .select('plan_json')
    .eq('id', ctx.planId)
    .single();
  if (error || !data) throw new Error(`failed to load edit_plans.${ctx.planId}: ${error?.message ?? 'not found'}`);
  return data.plan_json as EditPlan;
}

async function loadClipPaths(
  ctx: RenderContext,
  clipIds: string[],
): Promise<Map<string, string>> {
  const { data, error } = await ctx.supabase
    .from('edit_source_clips')
    .select('id,storage_path,user_id')
    .in('id', clipIds);
  if (error) throw new Error(`failed to load clips: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.user_id !== ctx.userId) {
      throw new Error(`clip ${row.id} does not belong to job owner ${ctx.userId}`);
    }
    map.set(row.id as string, row.storage_path as string);
  }
  return map;
}

async function downloadClip(
  ctx: RenderContext,
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data, error } = await ctx.supabase.storage.from(ctx.bucket).download(storagePath);
  if (error || !data) throw new Error(`storage download failed (${storagePath}): ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

async function uploadOutput(
  ctx: RenderContext,
  localPath: string,
): Promise<string> {
  const key = `${ctx.userId}/${ctx.projectId}/preview-${ctx.jobId}.mp4`;
  const buf = await fs.readFile(localPath);
  const { error } = await ctx.supabase.storage
    .from(ctx.bucket)
    .upload(key, buf, { contentType: 'video/mp4', upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return key;
}

/**
 * Vertical 9:16 preview render:
 *   1. For each segment: trim source with -ss/-to.
 *   2. Concat all trimmed pieces via concat demuxer.
 *   3. Scale + crop to 1080x1920.
 *   4. Output H.264 + AAC MP4.
 */
export async function renderPreview(ctx: RenderContext): Promise<{ storagePath: string }> {
  await appendLog(ctx.supabase, ctx.jobId, { step: 'start', level: 'info', message: 'render begin' });

  const plan = await loadPlan(ctx);
  if (!plan.segments || plan.segments.length === 0) {
    throw new Error('plan has no segments');
  }

  const clipIds = [...new Set(plan.segments.map((s) => s.clipId))];
  const paths = await loadClipPaths(ctx, clipIds);
  for (const id of clipIds) {
    if (!paths.has(id)) throw new Error(`missing clip row for ${id}`);
  }

  const workDir = await fs.mkdtemp(path.join(ctx.tmpRoot, 'job-'));
  try {
    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'download', level: 'info', message: `downloading ${clipIds.length} clip(s)`,
    });

    // Download each unique clip once.
    const localClipPaths = new Map<string, string>();
    for (const clipId of clipIds) {
      const storagePath = paths.get(clipId)!;
      const local = path.join(workDir, `src-${clipId}${path.extname(storagePath) || '.mp4'}`);
      await downloadClip(ctx, storagePath, local);
      localClipPaths.set(clipId, local);
    }
    await setJobProgress(ctx.supabase, ctx.jobId, 25);

    // Trim each segment.
    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'trim', level: 'info', message: `trimming ${plan.segments.length} segment(s)`,
    });
    const segmentFiles: string[] = [];
    for (let i = 0; i < plan.segments.length; i++) {
      const seg = plan.segments[i];
      const src = localClipPaths.get(seg.clipId)!;
      const out = path.join(workDir, `seg-${i.toString().padStart(3, '0')}.mp4`);
      const startSec = (seg.startMs / 1000).toFixed(3);
      const durSec = ((seg.endMs - seg.startMs) / 1000).toFixed(3);
      await runFfmpeg([
        '-ss', startSec, '-t', durSec, '-i', src,
        '-c:v', 'libx264', '-c:a', 'aac',
        '-preset', 'veryfast', '-crf', '24',
        out,
      ]);
      segmentFiles.push(out);
    }
    await setJobProgress(ctx.supabase, ctx.jobId, 55);

    // Concat via concat demuxer.
    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'concat', level: 'info', message: 'concatenating segments',
    });
    const concatList = path.join(workDir, 'concat.txt');
    await fs.writeFile(
      concatList,
      segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    );
    const concatOut = path.join(workDir, 'concat.mp4');
    await runFfmpeg([
      '-f', 'concat', '-safe', '0', '-i', concatList,
      '-c', 'copy', concatOut,
    ]);
    await setJobProgress(ctx.supabase, ctx.jobId, 75);

    // Scale/crop to the plan's aspect ratio. Then optionally burn in
    // captions + hook/cta overlays via a single ASS file in this same pass.
    // One re-encode total — no quality loss vs. doing each in a separate step.
    const dims = ASPECT_TO_DIMS[plan.aspectRatio] ?? ASPECT_TO_DIMS['9:16'];
    const finalOut = path.join(workDir, 'final.mp4');
    const captionsEnabled = plan.captions?.enabled === true;
    const hasAnyCaptions = plan.segments.some((s) => s.subtitleText && s.subtitleText.trim().length > 0);
    const hasOverlays = (plan.overlays && plan.overlays.length > 0) || !!plan.hookText;
    let assPath: string | null = null;
    if ((captionsEnabled && hasAnyCaptions) || hasOverlays) {
      assPath = path.join(workDir, 'captions.ass');
      const assContent = buildAssCaptions(plan, dims.label);
      await fs.writeFile(assPath, assContent, 'utf8');
      const captionCount = plan.segments.filter((s) => s.subtitleText).length;
      const overlayCount = (plan.overlays?.length ?? 0) + (plan.hookText ? 1 : 0);
      await appendLog(ctx.supabase, ctx.jobId, {
        step: 'overlays', level: 'info',
        message: `burning ${captionCount} caption(s) + ${overlayCount} overlay(s)`,
      });
    }

    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'scale', level: 'info',
      message: assPath
        ? `scaling to ${dims.label} + burning captions/overlays`
        : `scaling to ${dims.label}`,
    });

    // Build the -vf chain. The subtitles filter path must be escaped (colons,
    // backslashes) to avoid -vf parsing pitfalls. Cross-platform safe.
    const scaleChain = `scale=w=${dims.w}:h=${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}`;
    const vf = assPath
      ? `${scaleChain},subtitles=filename=${escapeFfmpegFilterArg(assPath)}`
      : scaleChain;

    await runFfmpeg([
      '-i', concatOut,
      '-vf', vf,
      '-c:v', 'libx264', '-c:a', 'aac',
      '-preset', 'veryfast', '-crf', '23',
      '-movflags', '+faststart',
      finalOut,
    ]);
    await setJobProgress(ctx.supabase, ctx.jobId, 90);

    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'upload', level: 'info', message: 'uploading preview artifact',
    });
    const key = await uploadOutput(ctx, finalOut);

    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'done', level: 'info', message: 'render completed', meta: { storage_path: key },
    });

    return { storagePath: key };
  } finally {
    // Best-effort cleanup
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Helper: resolve a tmp dir root, creating it if needed.
 */
export async function ensureTmpRoot(explicit?: string): Promise<string> {
  const dir = explicit || path.join(os.tmpdir(), 'flashflow-edit-worker');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Caption helpers — build an Advanced SubStation Alpha (ASS) subtitle file
// aligned to OUTPUT timestamps (not source clip timestamps). The trick: when
// we trim segments and concat, the output timeline starts at 0 and each
// segment occupies its own [outputStart, outputEnd] range. Captions need to
// be in OUTPUT time so they appear at the right moment after concat.
// ---------------------------------------------------------------------------

function escapeFfmpegFilterArg(p: string): string {
  // Inside ffmpeg's -vf arg, colons separate parameters and backslashes are
  // escapes. We need to escape both for paths (especially Windows-style
  // drive letters or any colons in the path) AND single-quote-wrap to be
  // safe across platforms.
  // Simplest reliable approach: escape : and \ and wrap in single quotes.
  return `'${p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;
}

function escapeAssText(s: string): string {
  // ASS dialogue needs { } \ N escaped. Newlines convert to \\N.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

function msToAssTime(ms: number): string {
  // ASS uses H:MM:SS.cs (centiseconds).
  const totalCs = Math.max(0, Math.round(ms / 10));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);
  return `${hr}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Build an ASS file from a plan. Captions + hook/CTA overlays are aligned to
 * OUTPUT timestamps — accumulated from segment durations (endMs - startMs).
 *
 * Three layers of dialogue:
 *   1. FlashFlow style — main captions, bottom-aligned by default. Word-wrap
 *      to fit phone screens.
 *   2. FlashFlowHook style — hook overlay, top-aligned, larger, bolder, shown
 *      during the first segment.
 *   3. FlashFlowCta style — CTA overlay, bottom-aligned (or top if captions
 *      use bottom), shown during the LAST segment.
 *
 * The three styles use different ASS Alignment values so they never overlap
 * even when caption + hook + cta would all want the same screen position.
 */
export function buildAssCaptions(
  plan: EditPlan,
  resolution: '1080x1920' | '1920x1080' | '1080x1080' = '1080x1920',
): string {
  const [W, H] = resolution.split('x').map(Number);
  const isVertical = H > W;
  const captionPosition = plan.captions?.position ?? 'bottom';
  const captionAlignment =
    captionPosition === 'top' ? 8 : captionPosition === 'center' ? 5 : 2;
  // Margins tuned for vertical (1080x1920) — proportionally scaled for other
  // aspect ratios so captions don't sit too close to the edge.
  const safeMargin = Math.round((isVertical ? 220 : 80) * (H / 1920));
  const captionMarginV = captionPosition === 'center' ? 0 : safeMargin;

  // Caption font: ~3.4% of output height. Hook overlay is ~5%. CTA is ~3.8%.
  const captionFont = Math.round(H * 0.034);
  const hookFont = Math.round(H * 0.05);
  const ctaFont = Math.round(H * 0.038);

  // Wrap budget: ~36 chars per line on vertical, ~60 on horizontal.
  const wrapWidth = isVertical ? 36 : 60;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: FlashFlow,Arial,${captionFont},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,3,${captionAlignment},80,80,${captionMarginV},1
Style: FlashFlowHook,Arial,${hookFont},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,4,8,80,80,${Math.round(H * 0.08)},1
Style: FlashFlowCta,Arial,${ctaFont},&H0000F2C2,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,3,${captionPosition === 'bottom' ? 8 : 2},80,80,${Math.round(H * 0.06)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Walk segments, accumulating output time, building per-segment caption lines.
  let outMs = 0;
  const dialogues: string[] = [];
  let firstSegmentStart = 0;
  let firstSegmentEnd = 0;
  let lastSegmentStart = 0;
  let lastSegmentEnd = 0;
  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const segDur = Math.max(0, seg.endMs - seg.startMs);
    if (i === 0) {
      firstSegmentStart = outMs;
      firstSegmentEnd = outMs + segDur;
    }
    if (i === plan.segments.length - 1) {
      lastSegmentStart = outMs;
      lastSegmentEnd = outMs + segDur;
    }
    if (
      plan.captions?.enabled !== false &&
      segDur > 0 &&
      seg.subtitleText &&
      seg.subtitleText.trim().length > 0
    ) {
      // Pad caption start by 100ms so it doesn't strobe right at the cut.
      const pad = Math.min(100, Math.floor(segDur / 8));
      const start = outMs + pad;
      const end = outMs + segDur - pad;
      if (end > start) {
        const wrapped = wrapCaption(seg.subtitleText.trim(), wrapWidth);
        const text = escapeAssText(wrapped);
        dialogues.push(
          `Dialogue: 0,${msToAssTime(start)},${msToAssTime(end)},FlashFlow,,0,0,0,,${text}`,
        );
      }
    }
    outMs += segDur;
  }

  // Hook overlay — auto-rendered from plan.hookText OR explicit overlays.
  // Spans the first segment by default, capped at 3 seconds (reads quickly).
  if (plan.hookText && plan.hookText.trim().length > 0 && firstSegmentEnd > firstSegmentStart) {
    const hookEnd = Math.min(firstSegmentEnd - 100, firstSegmentStart + 3000);
    const text = escapeAssText(wrapCaption(plan.hookText.trim(), wrapWidth));
    dialogues.push(
      `Dialogue: 1,${msToAssTime(firstSegmentStart + 100)},${msToAssTime(hookEnd)},FlashFlowHook,,0,0,0,,${text}`,
    );
  }

  // Explicit overlays from plan.overlays — placed using the segment they
  // overlap with rather than their literal startMs/endMs (the planner often
  // sends rough times). hook_text → first segment, cta_text → last segment.
  if (plan.overlays && plan.overlays.length > 0) {
    for (const ov of plan.overlays) {
      if (!ov.text || ov.text.trim().length === 0) continue;
      const text = escapeAssText(wrapCaption(ov.text.trim(), wrapWidth));
      if (ov.type === 'hook_text') {
        // Skip if we already auto-rendered hookText to avoid double-rendering.
        if (plan.hookText && plan.hookText.trim() === ov.text.trim()) continue;
        const hookEnd = Math.min(firstSegmentEnd - 100, firstSegmentStart + 3000);
        if (hookEnd > firstSegmentStart) {
          dialogues.push(
            `Dialogue: 1,${msToAssTime(firstSegmentStart + 100)},${msToAssTime(hookEnd)},FlashFlowHook,,0,0,0,,${text}`,
          );
        }
      } else if (ov.type === 'cta_text') {
        // CTA covers the LAST 2-3 seconds of the LAST segment.
        const ctaDur = Math.min(3000, lastSegmentEnd - lastSegmentStart);
        const ctaStart = Math.max(lastSegmentStart, lastSegmentEnd - ctaDur);
        if (lastSegmentEnd > ctaStart) {
          dialogues.push(
            `Dialogue: 1,${msToAssTime(ctaStart)},${msToAssTime(lastSegmentEnd)},FlashFlowCta,,0,0,0,,${text}`,
          );
        }
      }
    }
  }

  return header + dialogues.join('\n') + '\n';
}
