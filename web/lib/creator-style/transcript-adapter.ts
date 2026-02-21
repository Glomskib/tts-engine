/**
 * Uniform transcript extraction for TikTok and YouTube videos.
 *
 * - TikTok: download video → ffmpeg audio extract → Whisper
 * - YouTube: Supadata/caption extractor (no download needed)
 *
 * Also returns the raw video buffer for TikTok (needed for frame extraction).
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
// Dynamic imports to avoid webpack bundling native addons (canvas.node)
// at build time — these modules are only loaded when actually called.
async function loadTikTokDownloader() {
  const mod = await import('@/lib/tiktok-downloader');
  return mod.downloadTikTokVideo;
}
async function loadYouTubeCaptions() {
  const mod = await import('@/lib/youtube-transcript');
  return mod.extractYouTubeCaptions;
}

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  transcript: string;
  segments: TranscriptSegment[];
  language: string;
  duration_seconds: number;
  source: 'whisper' | 'supadata' | 'youtube-captions';
  /** Raw video buffer — available for TikTok, null for YouTube */
  videoBuffer: Buffer | null;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function detectPlatform(url: string): 'tiktok' | 'youtube' | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes('tiktok.com') ||
      host === 'vm.tiktok.com' ||
      host === 'vt.tiktok.com'
    ) {
      return 'tiktok';
    }
    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be')
    ) {
      return 'youtube';
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TikTok path: download → ffmpeg → Whisper
// ---------------------------------------------------------------------------

async function transcribeTikTok(url: string): Promise<TranscriptResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured');

  // Download video (dynamic import to avoid canvas.node bundling)
  const downloadTikTokVideo = await loadTikTokDownloader();
  const videoBuffer = await downloadTikTokVideo(url);

  const id = randomUUID();
  const videoPath = join(tmpdir(), `style-tt-${id}.mp4`);
  const audioPath = join(tmpdir(), `style-tt-${id}.mp3`);
  const filesToClean = [videoPath, audioPath];

  try {
    await writeFile(videoPath, videoBuffer);

    // Extract audio with ffmpeg
    await execFileAsync(ffmpegInstaller.path, [
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ab', '128k',
      '-ar', '44100',
      '-y',
      audioPath,
    ], { timeout: 30000 });

    if (!existsSync(audioPath)) {
      throw new Error('Audio extraction failed');
    }

    // Transcribe with Whisper
    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const transcript = transcription.text || '';
    const segments: TranscriptSegment[] = (transcription.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));
    const duration = transcription.duration || 0;
    const language = transcription.language || 'en';

    return {
      transcript,
      segments,
      language,
      duration_seconds: duration,
      source: 'whisper',
      videoBuffer,
    };
  } finally {
    // Cleanup temp files
    for (const p of filesToClean) {
      try {
        if (existsSync(p)) await unlink(p);
      } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// YouTube path: captions API
// ---------------------------------------------------------------------------

async function transcribeYouTube(url: string): Promise<TranscriptResult> {
  const extractYouTubeCaptions = await loadYouTubeCaptions();
  const result = await extractYouTubeCaptions(url);

  if (!result) {
    throw new Error('No captions available for this YouTube video');
  }

  // Duration from last segment end time if not provided
  const duration = result.duration ||
    (result.segments.length > 0
      ? result.segments[result.segments.length - 1].end
      : 0);

  return {
    transcript: result.transcript,
    segments: result.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    language: result.language || 'en',
    duration_seconds: duration,
    source: 'supadata',
    videoBuffer: null, // YouTube doesn't need video download for transcripts
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function getTranscript(
  url: string,
  platform?: 'tiktok' | 'youtube',
): Promise<TranscriptResult> {
  const detected = platform || detectPlatform(url);
  if (!detected) {
    throw new Error(`Cannot detect platform from URL: ${url}`);
  }

  if (detected === 'tiktok') {
    return transcribeTikTok(url);
  }
  return transcribeYouTube(url);
}
