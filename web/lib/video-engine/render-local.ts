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

    // ─── Pre-probe: detect leading dead-space so we can start on the punch ───
    // silencedetect emits `silence_end: <sec>` lines on stderr. If the clip
    // starts with silence, we advance the cut in so the clip opens on speech.
    // Capped at +0.5s so we never chop into real content by accident.
    const ffmpeg = getFFmpegPath();
    let trimmedStart = startSec;
    let trimmedLength = lengthSec;
    try {
      const probe = await execFileAsync(
        ffmpeg,
        [
          '-ss', startSec.toFixed(3),
          '-t', Math.min(lengthSec, 2.5).toFixed(3),
          '-i', srcPath,
          '-af', 'silencedetect=n=-32dB:d=0.15',
          '-f', 'null', '-',
        ],
        { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
      );
      const probeErr = (probe.stderr || '').toString();
      const match = /silence_start:\s*0(?:\.0+)?\s[\s\S]*?silence_end:\s*([0-9.]+)/m.exec(probeErr);
      if (match) {
        const deadSpace = Math.min(0.5, Math.max(0, parseFloat(match[1]) - 0.05));
        if (deadSpace >= 0.15) {
          trimmedStart = startSec + deadSpace;
          trimmedLength = Math.max(0.5, lengthSec - deadSpace);
          console.log(`[ve-render-local] trimmed ${deadSpace.toFixed(2)}s leading silence for ${clipId}`);
        }
      }
    } catch { /* probe is best-effort; fall back to original cut */ }

    // Slice with re-encode. -ss AFTER -i gives accurate seeking (slower but
    // more reliable than fast-seek for clips that start mid-keyframe).
    //
    // Perceived-edit polish applied to every TTS render:
    //   - leading dead-space trim (above) so clips open on the punch
    //   - acompressor tightens the vocal dynamic range BEFORE loudnorm so
    //     soft phrases don't get drowned by a shouty hook
    //   - 0.25s video fade-in + 0.3s fade-out so clips don't jolt in/out
    //   - EBU R128 loudnorm matches TikTok/Reels target (-14 LUFS) so the
    //     clip doesn't play noticeably quieter than neighboring feed videos.
    const fadeInSec = 0.2;
    const fadeOutSec = Math.min(0.3, Math.max(0, trimmedLength - fadeInSec - 0.1));
    const fadeOutStart = Math.max(0, trimmedLength - fadeOutSec).toFixed(3);
    const vFilter = `fade=t=in:st=0:d=${fadeInSec}${fadeOutSec > 0 ? `,fade=t=out:st=${fadeOutStart}:d=${fadeOutSec.toFixed(3)}` : ''}`;
    const aFilter = `acompressor=threshold=-18dB:ratio=3:attack=5:release=200,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:st=0:d=${fadeInSec}${fadeOutSec > 0 ? `,afade=t=out:st=${fadeOutStart}:d=${fadeOutSec.toFixed(3)}` : ''}`;
    await execFileAsync(
      ffmpeg,
      [
        '-i', srcPath,
        '-ss', trimmedStart.toFixed(3),
        '-t', trimmedLength.toFixed(3),
        '-vf', vFilter,
        '-af', aFilter,
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
      durationSec: trimmedLength,
      bytes,
    };
  } finally {
    for (const p of cleanup) {
      try { if (existsSync(p)) await unlink(p); } catch { /* ignore */ }
    }
  }
}
