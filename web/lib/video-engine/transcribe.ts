/**
 * Whisper transcription for assets stored in Supabase Storage.
 *
 * Strategy:
 *   ≤ 25 MB  → send video directly to Whisper (no ffmpeg needed)
 *   > 25 MB  → extract compressed audio via ffmpeg, then send to Whisper
 *
 * Whisper accepted formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
 * .MOV and .avi are mapped to .mp4 so Whisper accepts them.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream, existsSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TranscriptSegment } from './types';

const execFileAsync = promisify(execFile);

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const WHISPER_EXTS = new Set(['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']);

/** Resolve an ffmpeg binary path. Used only for files > 25MB. */
function getFFmpegPath(): string {
  // 1. System ffmpeg (local dev, Mac mini render nodes)
  try {
    const sys = execSync('which ffmpeg', { encoding: 'utf8', timeout: 3000 }).trim();
    if (sys) return sys;
  } catch { /* not on PATH */ }
  // 2. @ffmpeg-installer ships a binary inside the npm package (works on Vercel)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch { /* not installed */ }
  // 3. Last resort
  return 'ffmpeg';
}

export interface AssetTranscriptResult {
  transcript: string;
  segments: TranscriptSegment[];
  language: string;
  duration_sec: number;
}

export async function transcribeStorageAsset(params: {
  storage_bucket: string;
  storage_path: string;
}): Promise<AssetTranscriptResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured');

  const { data: blob, error: dlError } = await supabaseAdmin.storage
    .from(params.storage_bucket)
    .download(params.storage_path);

  if (dlError || !blob) {
    throw new Error(`Failed to download asset ${params.storage_path}: ${dlError?.message ?? 'no blob'}`);
  }

  const id = randomUUID();
  const rawExt = params.storage_path.split('.').pop()?.toLowerCase() || 'mp4';
  const safeExt = WHISPER_EXTS.has(rawExt) ? rawExt : 'mp4';
  const videoPath = join(tmpdir(), `ve-${id}.${safeExt}`);
  const audioPath = join(tmpdir(), `ve-${id}.mp3`);
  const cleanup: string[] = [videoPath];

  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    await writeFile(videoPath, buf);

    let transcribePath = videoPath;

    // Files over 25MB: extract compressed audio so Whisper can handle them.
    // Use very aggressive compression (32kbps mono) to ensure the audio stays
    // well under 25MB even for long videos (~14MB/hour at 32kbps).
    if (buf.length > WHISPER_MAX_BYTES) {
      console.log(`[transcribe] File is ${(buf.length / 1024 / 1024).toFixed(1)}MB — extracting audio for Whisper`);
      const ffmpeg = getFFmpegPath();
      await execFileAsync(
        ffmpeg,
        ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-ab', '32k', '-ar', '16000', '-ac', '1', '-y', audioPath],
        { timeout: 180_000 },
      );
      if (existsSync(audioPath)) {
        const audioSize = statSync(audioPath).size;
        const audioMB = audioSize / (1024 * 1024);
        cleanup.push(audioPath);
        console.log(`[transcribe] Audio extracted: ${audioMB.toFixed(1)}MB`);

        if (audioSize <= WHISPER_MAX_BYTES) {
          transcribePath = audioPath;
        } else {
          // Still too large — should be extremely rare at 32kbps mono.
          // Truncate error so the user gets a clear message.
          throw new Error(
            `Video is too long for transcription. The extracted audio is ${audioMB.toFixed(0)}MB ` +
            `(limit: 25MB). Try uploading a shorter clip.`
          );
        }
      } else {
        console.warn('[transcribe] Audio extraction produced no file — falling back to direct upload');
      }
    }

    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(transcribePath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    // Handle empty transcripts (silence, music-only, no speech)
    if (!transcription.text?.trim() && (!transcription.segments || transcription.segments.length === 0)) {
      throw new Error(
        'No speech detected in this video. FlashFlow needs spoken content to find the best clips. ' +
        'Try uploading a video with talking or voiceover.'
      );
    }

    const segments: TranscriptSegment[] = (transcription.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));

    return {
      transcript: transcription.text || '',
      segments,
      language: transcription.language || 'en',
      duration_sec: transcription.duration || 0,
    };
  } finally {
    for (const p of cleanup) {
      try { if (existsSync(p)) await unlink(p); } catch { /* ignore */ }
    }
  }
}
