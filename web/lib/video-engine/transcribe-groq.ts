/**
 * Groq Whisper transcription — drop-in replacement for OpenAI Whisper.
 *
 * Why Groq: ~30x realtime speed and ~60x cheaper than OpenAI Whisper
 * ($0.0001/min vs $0.006/min). For 1.5M renders/month this is the
 * difference between a $4K/mo transcription bill and a $65/mo one.
 *
 * Groq's API is OpenAI-compatible — same client, different base URL.
 * If GROQ_API_KEY is missing we throw so the caller can fall back to
 * OpenAI cleanly.
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

// Groq's whisper-large-v3 endpoint accepts up to 25MB per request.
// Same cap as OpenAI — so we use the same ffmpeg-compress fallback for large files.
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTS = new Set(['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']);

function getFFmpegPath(): string {
  try {
    const sys = execSync('which ffmpeg', { encoding: 'utf8', timeout: 3000 }).trim();
    if (sys) return sys;
  } catch { /* not on PATH */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch { /* not installed */ }
  return 'ffmpeg';
}

export interface GroqTranscriptResult {
  transcript: string;
  segments: TranscriptSegment[];
  language: string;
  duration_sec: number;
}

export async function transcribeStorageAssetViaGroq(params: {
  storage_bucket: string;
  storage_path: string;
  storage_url?: string | null;  // For R2 / external sources we fetch via signed URL
}): Promise<GroqTranscriptResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  // 1. Download the asset.
  // R2 (or any non-Supabase bucket): fetch directly via the signed URL
  //   we stored at job-create time.
  // Supabase: use the storage SDK.
  const isR2 = params.storage_bucket === 'flashflow-output'
            || params.storage_bucket === (process.env.R2_BUCKET || '')
            || params.storage_bucket?.startsWith('r2');

  const ext = (params.storage_path.split('.').pop() || 'mp4').toLowerCase();
  const safeExt = ALLOWED_EXTS.has(ext) ? ext : 'mp4';
  const tmpPath = join(tmpdir(), `groq-${randomUUID()}.${safeExt}`);

  if (isR2) {
    if (!params.storage_url) throw new Error('R2 download requires storage_url');
    const resp = await fetch(params.storage_url);
    if (!resp.ok) throw new Error(`R2 fetch ${resp.status}: ${resp.statusText}`);
    await writeFile(tmpPath, Buffer.from(await resp.arrayBuffer()));
  } else {
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from(params.storage_bucket)
      .download(params.storage_path);
    if (dlError || !blob) {
      throw new Error(`Storage download failed: ${dlError?.message}`);
    }
    await writeFile(tmpPath, Buffer.from(await blob.arrayBuffer()));
  }

  let finalPath = tmpPath;
  const fsize = statSync(tmpPath).size;

  // 2. If larger than 25MB, compress to mono 16kHz mp3 (Whisper-optimized)
  if (fsize > MAX_BYTES) {
    const audioPath = join(tmpdir(), `groq-${randomUUID()}.mp3`);
    const ffmpeg = getFFmpegPath();
    await execFileAsync(ffmpeg, [
      '-i', tmpPath,
      '-vn',                 // no video
      '-ac', '1',            // mono
      '-ar', '16000',        // 16kHz
      '-b:a', '32k',         // 32kbps mp3 (Whisper-acceptable)
      '-y', audioPath,
    ]);
    finalPath = audioPath;
  }

  // 3. Send to Groq Whisper
  const client = new OpenAI({
    apiKey: groqKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.audio.transcriptions.create({
    file: createReadStream(finalPath),
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  // OpenAI SDK return shape (verbose_json)
  const r = response as unknown as {
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{ id?: number; start: number; end: number; text: string }>;
  };

  // 4. Clean up tmp files
  try {
    if (existsSync(tmpPath)) await unlink(tmpPath);
    if (finalPath !== tmpPath && existsSync(finalPath)) await unlink(finalPath);
  } catch { /* best-effort */ }

  return {
    transcript: r.text,
    segments: (r.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
    language: r.language || 'en',
    duration_sec: r.duration || 0,
  };
}

/**
 * Transcribe with automatic fallback. Tries Groq first (cheap + fast),
 * falls back to OpenAI Whisper if Groq is unconfigured or errors.
 */
export async function transcribeWithFallback(params: {
  storage_bucket: string;
  storage_path: string;
  storage_url?: string | null;
}): Promise<GroqTranscriptResult> {
  if (process.env.GROQ_API_KEY) {
    try {
      return await transcribeStorageAssetViaGroq(params);
    } catch (err) {
      console.warn('[transcribe] Groq failed, falling back to OpenAI:', err instanceof Error ? err.message : err);
    }
  }
  // Fallback to existing OpenAI Whisper path (Supabase-only)
  const { transcribeStorageAsset } = await import('./transcribe');
  const r = await transcribeStorageAsset({
    storage_bucket: params.storage_bucket,
    storage_path: params.storage_path,
  });
  return r;
}
