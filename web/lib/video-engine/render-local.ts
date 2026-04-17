/**
 * Local ffmpeg-based clip rendering for Video Engine.
 *
 * Shotstack is the long-term renderer, but while the Shotstack account is
 * out of credits / missing the video-asset feature, this module provides a
 * fast slice-only path so users still get a downloadable clip.
 *
 * Flow:
 *   1. Download the source video from Supabase Storage
 *   2. Trim start_sec → end_sec with ffmpeg (re-encoded so the clip is a
 *      self-contained keyframe-aligned MP4 that every browser will play)
 *   3. Upload the result to the renders bucket
 *   4. Return the public URL + duration
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const execFileAsync = promisify(execFile);

const OUTPUT_BUCKET = 'renders';

function getFFmpegPath(): string {
  try {
    const sys = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (sys) return sys;
  } catch { /* no system ffmpeg */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch { /* package not available */ }
  return 'ffmpeg';
}

export interface LocalRenderInput {
  sourceBucket: string;
  sourcePath: string;
  startSec: number;
  endSec: number;
  userId: string;
  clipId: string;
}

export interface LocalRenderResult {
  outputUrl: string;
  outputPath: string;
  durationSec: number;
  bytes: number;
}

export async function renderClipLocal(input: LocalRenderInput): Promise<LocalRenderResult> {
  const { sourceBucket, sourcePath, userId, clipId } = input;
  const startSec = Math.max(0, Number(input.startSec) || 0);
  const endSec = Math.max(startSec + 0.5, Number(input.endSec) || startSec + 1);
  const lengthSec = endSec - startSec;

  const workId = randomUUID();
  const srcPath = join(tmpdir(), `ve-src-${workId}.mp4`);
  const outPath = join(tmpdir(), `ve-out-${workId}.mp4`);
  const cleanup = [srcPath, outPath];

  try {
    // Download source from Supabase Storage.
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(sourceBucket)
      .download(sourcePath);
    if (dlErr || !blob) {
      throw new Error(`Failed to download source ${sourceBucket}/${sourcePath}: ${dlErr?.message ?? 'no blob'}`);
    }
    await writeFile(srcPath, Buffer.from(await blob.arrayBuffer()));

    // Slice with re-encode. -ss AFTER -i gives accurate seeking (slower but
    // more reliable than fast-seek for clips that start mid-keyframe).
    const ffmpeg = getFFmpegPath();
    await execFileAsync(
      ffmpeg,
      [
        '-i', srcPath,
        '-ss', startSec.toFixed(3),
        '-t', lengthSec.toFixed(3),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        outPath,
      ],
      { timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
    );

    if (!existsSync(outPath)) throw new Error('ffmpeg produced no output file');
    const { size: bytes } = await stat(outPath);
    if (bytes < 1024) throw new Error(`Rendered clip is suspiciously small (${bytes} bytes)`);

    const outputStoragePath = `ve-renders/${userId}/${clipId}.mp4`;
    const body = await readFile(outPath);

    const { error: upErr } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .upload(outputStoragePath, body, {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (upErr) throw new Error(`Failed to upload rendered clip: ${upErr.message}`);

    const outputUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${OUTPUT_BUCKET}/${outputStoragePath}`;

    return {
      outputUrl,
      outputPath: outputStoragePath,
      durationSec: lengthSec,
      bytes,
    };
  } finally {
    for (const p of cleanup) {
      try { if (existsSync(p)) await unlink(p); } catch { /* ignore */ }
    }
  }
}
