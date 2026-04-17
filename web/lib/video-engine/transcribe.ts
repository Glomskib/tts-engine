/**
 * Whisper transcription for assets stored in Supabase Storage.
 *
 * Downloads video from Supabase Storage and sends it directly to OpenAI Whisper.
 * Whisper accepts video files natively — no ffmpeg audio extraction needed.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TranscriptSegment } from './types';

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

  // Whisper accepts video files directly — no ffmpeg extraction needed.
  // This avoids the ffmpeg binary dependency entirely on serverless (Vercel).
  // Whisper only accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
  // Map unsupported extensions (e.g. .mov, .avi) to .mp4 so Whisper accepts them.
  const WHISPER_EXTS = new Set(['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']);
  const id = randomUUID();
  const rawExt = params.storage_path.split('.').pop()?.toLowerCase() || 'mp4';
  const ext = WHISPER_EXTS.has(rawExt) ? rawExt : 'mp4';
  const videoPath = join(tmpdir(), `ve-${id}.${ext}`);

  try {
    const buf = Buffer.from(await blob.arrayBuffer());
    await writeFile(videoPath, buf);

    // Whisper has a 25MB file limit. If the file is larger, we need to note this
    // but still attempt — OpenAI may accept slightly over or the server-side
    // compression may bring it under.
    const fileSizeMB = buf.length / (1024 * 1024);
    if (fileSizeMB > 25) {
      console.warn(`[transcribe] File is ${fileSizeMB.toFixed(1)}MB — exceeds Whisper 25MB limit, attempting anyway`);
    }

    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(videoPath),
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
    try { if (existsSync(videoPath)) await unlink(videoPath); } catch { /* ignore */ }
  }
}
