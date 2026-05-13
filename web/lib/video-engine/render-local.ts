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
import { isR2Configured, presignR2Url } from '@/lib/storage/r2';

const execFileAsync = promisify(execFile);

const SUPA_OUTPUT_BUCKET = 'renders';

interface BrollClip { at_sec: number; duration_sec: number; video_url: string }
interface MusicTrack { audio_url: string; volume_db: number }

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
  /** Optional — when set, the source is fetched directly via this URL instead
   *  of via Supabase SDK. Used for R2 + external sources. */
  sourceUrl?: string | null;
  startSec: number;
  endSec: number;
  userId: string;
  clipId: string;
  /** Optional music track to mix under the speech. Music ducks below speech. */
  music?: MusicTrack | null;
  /** Optional B-roll cutaways. Each clip overlays at at_sec for duration_sec. */
  broll?: BrollClip[];
}

export interface LocalRenderResult {
  outputUrl: string;
  outputPath: string;
  outputBucket: string;
  outputBackend: 'r2' | 'supabase';
  durationSec: number;
  bytes: number;
}

/**
 * Download a remote URL (R2 signed URL, public URL, etc.) to a tmp file.
 */
async function downloadUrl(url: string, dest: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`);
  await writeFile(dest, Buffer.from(await resp.arrayBuffer()));
}

/**
 * Resolve the source to a local tmp file.
 * - If sourceUrl provided → fetch via HTTPS
 * - Else → use Supabase SDK to download from sourceBucket/sourcePath
 */
async function fetchSource(input: LocalRenderInput, dest: string): Promise<void> {
  const isR2 = input.sourceBucket === (process.env.R2_BUCKET || 'flashflow-output')
            || input.sourceBucket?.startsWith('r2');
  if (input.sourceUrl) {
    await downloadUrl(input.sourceUrl, dest);
    return;
  }
  if (isR2) {
    throw new Error('R2 source needs sourceUrl');
  }
  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(input.sourceBucket)
    .download(input.sourcePath);
  if (dlErr || !blob) {
    throw new Error(`Failed to download source ${input.sourceBucket}/${input.sourcePath}: ${dlErr?.message ?? 'no blob'}`);
  }
  await writeFile(dest, Buffer.from(await blob.arrayBuffer()));
}

export async function renderClipLocal(input: LocalRenderInput): Promise<LocalRenderResult> {
  const { userId, clipId } = input;
  const startSec = Math.max(0, Number(input.startSec) || 0);
  const endSec = Math.max(startSec + 0.5, Number(input.endSec) || startSec + 1);
  const lengthSec = endSec - startSec;

  // ─── /tmp pre-clean ─────────────────────────────────────────────────
  // Vercel function /tmp is ~512MB. A 400MB source + intermediate files
  // from a previous render that didn't finish cleanly will exhaust it
  // and the next render dies with ENOSPC mid-write. Wipe any stale
  // ve-* artifacts from prior invocations before we start.
  try {
    const tmpDir = tmpdir();
    const { readdir } = await import('fs/promises');
    const entries = await readdir(tmpDir);
    let removed = 0;
    for (const name of entries) {
      if (!/^ve-(src|out|music|broll|frame|mod)-/.test(name)) continue;
      try { await unlink(join(tmpDir, name)); removed++; } catch { /* ignore */ }
    }
    if (removed > 0) console.log(`[ve-render-local] cleaned ${removed} stale tmp files before render`);
  } catch (e) {
    console.warn('[ve-render-local] tmp pre-clean failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  const workId = randomUUID();
  const srcPath = join(tmpdir(), `ve-src-${workId}.mp4`);
  const outPath = join(tmpdir(), `ve-out-${workId}.mp4`);
  const musicPath = join(tmpdir(), `ve-music-${workId}.mp3`);
  const cleanup: string[] = [srcPath, outPath];

  try {
    // Source: Supabase SDK or HTTPS (R2 / external).
    await fetchSource(input, srcPath);

    // Music + B-roll downloads run in parallel — none of them block source-fetch.
    const brollPaths: { path: string; at: number; dur: number }[] = [];
    const assetDownloads: Promise<unknown>[] = [];

    if (input.music?.audio_url) {
      assetDownloads.push(downloadUrl(input.music.audio_url, musicPath).catch((e) => {
        console.warn(`[ve-render-local] music download failed: ${(e as Error).message}`);
      }));
      cleanup.push(musicPath);
    }

    if (Array.isArray(input.broll) && input.broll.length > 0) {
      // Cap at 6 cutaways per clip so ffmpeg filter graph stays reasonable.
      for (const [idx, b] of input.broll.slice(0, 6).entries()) {
        const bPath = join(tmpdir(), `ve-broll-${workId}-${idx}.mp4`);
        cleanup.push(bPath);
        brollPaths.push({ path: bPath, at: b.at_sec, dur: b.duration_sec });
        assetDownloads.push(downloadUrl(b.video_url, bPath).catch((e) => {
          console.warn(`[ve-render-local] broll download failed for ${idx}: ${(e as Error).message}`);
          // mark as missing so we skip it in the filter graph
          brollPaths[brollPaths.length - 1].path = '';
        }));
      }
    }

    if (assetDownloads.length > 0) await Promise.all(assetDownloads);

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

    const validBroll = brollPaths.filter((b) => b.path && existsSync(b.path));
    const hasMusic = existsSync(musicPath);
    const hasOverlay = validBroll.length > 0 || hasMusic;

    if (!hasOverlay) {
      // Fast path — simple slice + audio polish.
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
    } else {
      // Compositing path — filter_complex with optional broll overlays + music.
      const args: string[] = ['-i', srcPath];
      if (hasMusic) args.push('-stream_loop', '-1', '-i', musicPath);
      for (const b of validBroll) args.push('-i', b.path);

      const parts: string[] = [];
      // Trim source to clip window + apply vocal polish + fades.
      parts.push(
        `[0:v]trim=start=${trimmedStart.toFixed(3)}:duration=${trimmedLength.toFixed(3)},setpts=PTS-STARTPTS,${vFilter}[vbase]`,
      );
      parts.push(
        `[0:a]atrim=start=${trimmedStart.toFixed(3)}:duration=${trimmedLength.toFixed(3)},asetpts=PTS-STARTPTS,${aFilter}[abase]`,
      );

      // Chain B-roll overlays. Each broll is shifted so its frame 0 aligns
      // with its scheduled at_sec, then enable= controls visibility window.
      let curV = 'vbase';
      const brollFirstIdx = hasMusic ? 2 : 1;
      for (let i = 0; i < validBroll.length; i++) {
        const b = validBroll[i];
        const at = Math.max(0, Math.min(b.at, trimmedLength - 0.2));
        const dur = Math.max(0.4, Math.min(b.dur, trimmedLength - at));
        if (dur <= 0.4) continue;
        const inIdx = brollFirstIdx + i;
        parts.push(
          `[${inIdx}:v]scale=iw:ih,setpts=PTS-STARTPTS+${at.toFixed(3)}/TB[br${i}]`,
        );
        const nextV = i === validBroll.length - 1 ? 'vout' : `vmix${i}`;
        parts.push(
          `[${curV}][br${i}]overlay=enable='between(t,${at.toFixed(3)},${(at + dur).toFixed(3)})':eof_action=pass[${nextV}]`,
        );
        curV = nextV;
      }
      if (curV !== 'vout') parts.push(`[${curV}]null[vout]`);

      // Mix in music (ducked under speech). Music input loops via -stream_loop -1.
      if (hasMusic) {
        const musicVol = Number.isFinite(input.music?.volume_db) ? input.music!.volume_db : -16;
        parts.push(`[1:a]volume=${musicVol}dB,atrim=duration=${trimmedLength.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, trimmedLength - 0.6).toFixed(3)}:d=0.6[mbg]`);
        parts.push(`[abase][mbg]amix=inputs=2:duration=first:weights=1 0.6:normalize=0[aout]`);
      } else {
        parts.push(`[abase]anull[aout]`);
      }

      const filterComplex = parts.join(';');
      await execFileAsync(
        ffmpeg,
        [
          ...args,
          '-filter_complex', filterComplex,
          '-map', '[vout]',
          '-map', '[aout]',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          '-y',
          outPath,
        ],
        { timeout: 240_000, maxBuffer: 64 * 1024 * 1024 },
      );
    }

    if (!existsSync(outPath)) throw new Error('ffmpeg produced no output file');
    const { size: bytes } = await stat(outPath);
    if (bytes < 1024) throw new Error(`Rendered clip is suspiciously small (${bytes} bytes)`);

    const outputStoragePath = `ve-renders/${userId}/${clipId}.mp4`;
    const body = await readFile(outPath);

    // Prefer R2 for renders when configured (free egress at scale).
    if (isR2Configured()) {
      const r2Bucket = process.env.R2_BUCKET || 'flashflow-output';
      const r2Key = `ve-renders/${userId}/${clipId}.mp4`;
      const putUrl = presignR2Url({ method: 'PUT', key: r2Key, expiresInSec: 600, contentType: 'video/mp4' });
      const putResp = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body,
      });
      if (!putResp.ok) {
        const text = await putResp.text().catch(() => '');
        throw new Error(`R2 PUT failed ${putResp.status}: ${text.slice(0, 200)}`);
      }
      // Signed read URL for the client. 7-day window so the UI download link
      // outlives the typical user review/repost cadence.
      const readUrl = presignR2Url({ method: 'GET', key: r2Key, expiresInSec: 7 * 24 * 3600 });
      return {
        outputUrl: readUrl,
        outputPath: r2Key,
        outputBucket: r2Bucket,
        outputBackend: 'r2',
        durationSec: trimmedLength,
        bytes,
      };
    }

    // Fallback: Supabase Storage public bucket.
    const { error: upErr } = await supabaseAdmin.storage
      .from(SUPA_OUTPUT_BUCKET)
      .upload(outputStoragePath, body, {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (upErr) throw new Error(`Failed to upload rendered clip: ${upErr.message}`);

    const outputUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SUPA_OUTPUT_BUCKET}/${outputStoragePath}`;

    return {
      outputUrl,
      outputPath: outputStoragePath,
      outputBucket: SUPA_OUTPUT_BUCKET,
      outputBackend: 'supabase',
      durationSec: trimmedLength,
      bytes,
    };
  } finally {
    for (const p of cleanup) {
      try { if (existsSync(p)) await unlink(p); } catch { /* ignore */ }
    }
  }
}
