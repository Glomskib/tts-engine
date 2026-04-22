/**
 * Preview-render implementation for the Mac mini edit worker.
 *
 * Scope (Phase 2):
 *   - fetch the edit_plan JSON for a claimed render_jobs row
 *   - fetch source clip storage paths
 *   - download each clip from Supabase Storage to a tmp dir
 *   - run ffmpeg to trim each segment, concatenate, scale/crop to 9:16
 *   - upload the result back to Storage under `<user_id>/<project_id>/preview-<job_id>.mp4`
 *   - return the uploaded storage path (caller writes it to render_jobs.preview_url)
 *
 * NOT in scope for this phase:
 *   - caption burn-in
 *   - overlay text
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
}

interface EditPlan {
  projectId: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  segments: EditSegment[];
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

    // Scale/crop to 9:16 (1080x1920). Crops center.
    await appendLog(ctx.supabase, ctx.jobId, {
      step: 'scale', level: 'info', message: 'scaling to 1080x1920',
    });
    const finalOut = path.join(workDir, 'final.mp4');
    await runFfmpeg([
      '-i', concatOut,
      '-vf',
      // Scale the short side up so crop can take a 1080x1920 box.
      'scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920',
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
