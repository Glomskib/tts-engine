/**
 * Whisper transcription for assets stored in Supabase Storage.
 *
 * This mirrors the TikTok branch of `lib/creator-style/transcript-adapter.ts`
 * but downloads from Supabase Storage (service-role) instead of TikTok URLs.
 * Audio is extracted with ffmpeg then sent to OpenAI Whisper.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { execSync } from 'child_process';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TranscriptSegment } from './types';

const execFileAsync = promisify(execFile);

/** Resolve ffmpeg binary: prefer system install, fall back to @ffmpeg-installer. */
function getFFmpegPath(): string {
  try {
    const sys = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (sys) return sys;
  } catch { /* no system ffmpeg */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch { /* package not available */ }
  return 'ffmpeg'; // last resort: hope it's on PATH
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
  const videoPath = join(tmpdir(), `ve-${id}.mp4`);
  const audioPath = join(tmpdir(), `ve-${id}.mp3`);
  const cleanup = [videoPath, audioPath];

  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    await writeFile(videoPath, buf);

    const ffmpeg = getFFmpegPath();
    await execFileAsync(
      ffmpeg,
      ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-y', audioPath],
      { timeout: 120_000 },
    );
    if (!existsSync(audioPath)) throw new Error('Audio extraction failed');

    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

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
