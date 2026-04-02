// @ts-nocheck
/**
 * FlashFlow Render Pipeline
 * Runs on Mac mini render node.
 *
 * Pipeline stages for a clip_render job:
 *   1. Download clips from Supabase Storage
 *   2. Extract audio (FFmpeg) for >25MB clips → Whisper transcription
 *   3. Merge clips into single timeline (FFmpeg concat)
 *   4. Extract keyframes → GPT-4o Vision for visual analysis
 *   5. Resize + compress to 1080x1920 H.264 <287MB (TikTok spec)
 *   6. Upload final render to Supabase Storage
 *   7. Return { final_video_url, analysis, transcript }
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const RENDERS_BUCKET = 'renders';
const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25MB

// TikTok video spec
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const MAX_OUTPUT_BYTES = 287 * 1024 * 1024; // 287MB

// Keyframe analysis: extract 1 frame per every N seconds of merged video
const KEYFRAME_INTERVAL_SECS = 10;
const MAX_KEYFRAMES = 6;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelinePayload {
  clip_urls: string[];
  product_id?: string | null;
  context?: string | null;
  settings?: {
    burn_subtitles?: boolean;
    output_width?: number;
    output_height?: number;
  };
}

export interface PipelineResult {
  final_video_url: string;
  transcript?: string;
  analysis?: {
    hook?: string;
    caption?: string;
    hashtags?: string[];
    cta?: string;
    cover_text?: string;
    content_angle?: string;
    clip_scores?: number[];
    best_clip_index?: number;
    reasoning?: string;
  };
  keyframes?: string[];
  duration_seconds?: number;
  file_size_bytes?: number;
}

export type ProgressCallback = (pct: number, message: string) => void | Promise<void>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function fileSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

async function ffmpeg(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'warning', ...args]);
}

async function ffprobe(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);
  const info = JSON.parse(stdout);
  const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
  return {
    duration: parseFloat(info.format?.duration || '0'),
    width: parseInt(videoStream?.width || '0', 10),
    height: parseInt(videoStream?.height || '0', 10),
  };
}

// ─── Pipeline Stages ──────────────────────────────────────────────────────────

async function downloadClips(
  clipUrls: string[],
  tmpDir: string,
  onProgress: ProgressCallback
): Promise<string[]> {
  const localPaths: string[] = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const dest = path.join(tmpDir, `clip-${i}.mp4`);
    await onProgress(
      Math.round((i / clipUrls.length) * 15),
      `Downloading clip ${i + 1} of ${clipUrls.length}...`
    );
    await downloadFile(clipUrls[i], dest);
    localPaths.push(dest);
  }
  return localPaths;
}

async function extractAudio(
  clipPath: string,
  tmpDir: string,
  index: number
): Promise<string> {
  const audioPath = path.join(tmpDir, `audio-${index}.mp3`);
  await ffmpeg(
    '-i', clipPath,
    '-vn',
    '-ar', '16000',
    '-ac', '1',
    '-b:a', '32k',
    audioPath
  );
  return audioPath;
}

async function transcribeClips(
  clipPaths: string[],
  tmpDir: string,
  onProgress: ProgressCallback
): Promise<string> {
  const transcripts: string[] = [];

  for (let i = 0; i < clipPaths.length; i++) {
    await onProgress(
      15 + Math.round((i / clipPaths.length) * 15),
      `Transcribing clip ${i + 1}...`
    );

    const clipSize = fileSize(clipPaths[i]);
    let audioPath = clipPaths[i];

    // For large clips, extract compressed audio first
    if (clipSize > WHISPER_MAX_BYTES) {
      audioPath = await extractAudio(clipPaths[i], tmpDir, i);
    }

    // If still too big after extraction, skip transcription for this clip
    if (fileSize(audioPath) > WHISPER_MAX_BYTES) {
      transcripts.push(`[Clip ${i + 1}: audio too large for transcription]`);
      continue;
    }

    try {
      const audioStream = fs.createReadStream(audioPath);
      const result = await openai.audio.transcriptions.create({
        file: audioStream as any,
        model: 'whisper-1',
        language: 'en',
      });
      transcripts.push(`[Clip ${i + 1}]: ${result.text}`);
    } catch (err: any) {
      transcripts.push(`[Clip ${i + 1}: transcription failed — ${err.message}]`);
    }
  }

  return transcripts.join('\n\n');
}

async function mergeClips(
  clipPaths: string[],
  tmpDir: string,
  onProgress: ProgressCallback
): Promise<string> {
  await onProgress(30, 'Merging clips...');

  const mergedPath = path.join(tmpDir, 'merged.mp4');

  if (clipPaths.length === 1) {
    // Single clip — just copy
    fs.copyFileSync(clipPaths[0], mergedPath);
    return mergedPath;
  }

  // Write concat list
  const concatFile = path.join(tmpDir, 'concat.txt');
  const lines = clipPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatFile, lines);

  await ffmpeg(
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    mergedPath
  );

  return mergedPath;
}

async function extractKeyframes(
  videoPath: string,
  tmpDir: string,
  onProgress: ProgressCallback
): Promise<string[]> {
  await onProgress(55, 'Extracting keyframes...');

  const probe = await ffprobe(videoPath);
  const duration = probe.duration || 60;

  // Calculate interval to get MAX_KEYFRAMES frames spread across the video
  const interval = Math.max(
    KEYFRAME_INTERVAL_SECS,
    Math.floor(duration / MAX_KEYFRAMES)
  );

  const frameDir = path.join(tmpDir, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });

  await ffmpeg(
    '-i', videoPath,
    '-vf', `fps=1/${interval},scale=640:-1`,
    '-frames:v', String(MAX_KEYFRAMES),
    path.join(frameDir, 'frame-%02d.jpg')
  );

  return fs.readdirSync(frameDir)
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(frameDir, f));
}

async function analyzeWithVision(
  keyframePaths: string[],
  transcript: string,
  productContext: string,
  onProgress: ProgressCallback
): Promise<PipelineResult['analysis']> {
  await onProgress(65, 'Analyzing content with AI...');

  // Build vision message content
  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = keyframePaths.slice(0, MAX_KEYFRAMES).map(fp => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}`,
      detail: 'low' as const,
    },
  }));

  const systemPrompt = `You are a TikTok content strategist specializing in high-converting short-form video.
Analyze the provided video frames and transcript to produce a ready-to-post content package.
Output JSON only. No markdown.`;

  const userPrompt = `VIDEO FRAMES: ${keyframePaths.length} keyframes attached.

TRANSCRIPT:
${transcript || '(no transcript available)'}

PRODUCT CONTEXT:
${productContext || '(no product context)'}

Produce a JSON object with:
{
  "hook": "opening line that grabs attention in first 2 seconds",
  "caption": "engaging TikTok caption under 150 chars",
  "hashtags": ["#ad", "up to 9 more relevant hashtags"],
  "cta": "call to action (shop link in bio, check out product, etc.)",
  "cover_text": "3-5 word text for video cover thumbnail",
  "content_angle": "one-sentence description of the content angle/story",
  "reasoning": "brief explanation of your choices"
}

Rules:
- hashtags MUST start with #ad
- hook should reflect what is visually shown
- caption should expand on the hook
- keep it authentic, not salesy`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    max_tokens: 800,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: userPrompt },
        ],
      },
    ],
  });

  try {
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch {
    return {};
  }
}

async function generateSubtitleFile(
  transcript: string,
  videoDuration: number,
  tmpDir: string
): Promise<string | null> {
  if (!transcript || transcript.length < 10) return null;

  try {
    // Split transcript into subtitle chunks (roughly every 4-5 words)
    const words = transcript.replace(/\[Clip \d+[^\]]*\]:/g, '').trim().split(/\s+/);
    const WORDS_PER_LINE = 5;
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
      chunks.push(words.slice(i, i + WORDS_PER_LINE).join(' '));
    }

    const chunkDuration = videoDuration / Math.max(chunks.length, 1);

    const formatTime = (secs: number) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
    };

    let srt = '';
    chunks.forEach((chunk, i) => {
      const start = i * chunkDuration;
      const end = Math.min((i + 1) * chunkDuration, videoDuration);
      srt += `${i + 1}\n${formatTime(start)} --> ${formatTime(end)}\n${chunk}\n\n`;
    });

    const srtPath = path.join(tmpDir, 'subtitles.srt');
    fs.writeFileSync(srtPath, srt);
    return srtPath;
  } catch {
    return null;
  }
}

async function transcodeToTikTok(
  inputPath: string,
  tmpDir: string,
  onProgress: ProgressCallback,
  subtitlePath?: string | null
): Promise<string> {
  await onProgress(75, 'Transcoding to TikTok spec (1080×1920)...');

  const outputPath = path.join(tmpDir, 'final.mp4');

  // Base video filter: scale + pad to 1080x1920 portrait, black bars
  const baseVf = [
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `setsar=1`,
  ].join(',');

  // Add subtitle overlay if available
  // Using subtitles filter with ASS styling for bottom-center captions
  let vf = baseVf;
  if (subtitlePath && fs.existsSync(subtitlePath)) {
    // Escape path for FFmpeg filter
    const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    vf = `${baseVf},subtitles='${escapedPath}':force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1,Alignment=2,MarginV=60'`;
  }

  await ffmpeg(
    '-i', inputPath,
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-profile:v', 'high',
    '-level', '4.0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    outputPath
  );

  // Check output size and re-encode if over TikTok limit
  const outputSize = fileSize(outputPath);
  if (outputSize > MAX_OUTPUT_BYTES) {
    await onProgress(85, 'Compressing to fit TikTok limit...');
    const reEncodedPath = path.join(tmpDir, 'final-compressed.mp4');
    const probe = await ffprobe(outputPath).catch(() => ({ duration: 60, width: 0, height: 0 }));
    const targetBitrate = Math.floor((MAX_OUTPUT_BYTES * 8) / Math.max(probe.duration, 1) / 1000);
    await ffmpeg(
      '-i', outputPath,
      '-c:v', 'libx264',
      '-b:v', `${Math.max(targetBitrate, 500)}k`,
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      reEncodedPath
    );
    return reEncodedPath;
  }

  return outputPath;
}

async function uploadRender(
  localPath: string,
  userId: string,
  jobId: string,
  onProgress: ProgressCallback
): Promise<string> {
  await onProgress(90, 'Uploading render to storage...');

  const filename = `final-${Date.now()}.mp4`;
  const storagePath = `creator-clips/${userId}/${jobId}/${filename}`;

  const fileBuffer = fs.readFileSync(localPath);

  const { error } = await supabase.storage
    .from(RENDERS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from(RENDERS_BUCKET)
    .getPublicUrl(storagePath);

  return publicUrl;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function runPipeline(
  jobId: string,
  userId: string,
  payload: PipelinePayload,
  onProgress: ProgressCallback
): Promise<PipelineResult> {
  const tmpDir = path.join('/tmp', `render-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await onProgress(0, 'Starting pipeline...');

    // Stage 1: Download clips
    const clipPaths = await downloadClips(payload.clip_urls, tmpDir, onProgress);

    // Stage 2: Transcribe audio
    const transcript = await transcribeClips(clipPaths, tmpDir, onProgress);

    // Stage 3: Merge clips
    const mergedPath = await mergeClips(clipPaths, tmpDir, onProgress);

    // Stage 4: Extract keyframes
    const keyframePaths = await extractKeyframes(mergedPath, tmpDir, onProgress);

    // Stage 5: AI analysis (vision + transcript)
    const productContext = payload.context || '';
    const analysis = await analyzeWithVision(keyframePaths, transcript, productContext, onProgress);

    // Stage 5b: Generate subtitle file from transcript
    const mergeProbe = await ffprobe(mergedPath).catch(() => ({ duration: 60, width: 0, height: 0 }));
    const burnSubs = payload.settings?.burn_subtitles !== false; // default true
    const subtitlePath = burnSubs && transcript
      ? await generateSubtitleFile(transcript, mergeProbe.duration, tmpDir)
      : null;

    // Stage 6: Transcode to TikTok spec (with optional subtitle burn)
    const finalPath = await transcodeToTikTok(mergedPath, tmpDir, onProgress, subtitlePath);

    // Stage 7: Upload render
    const finalVideoUrl = await uploadRender(finalPath, userId, jobId, onProgress);

    await onProgress(100, 'Done!');

    const probe = await ffprobe(finalPath).catch(() => ({ duration: 0, width: 0, height: 0 }));

    return {
      final_video_url: finalVideoUrl,
      transcript: transcript || undefined,
      analysis,
      keyframes: keyframePaths.map(fp => path.basename(fp)),
      duration_seconds: probe.duration || undefined,
      file_size_bytes: fileSize(finalPath),
    };
  } finally {
    // Cleanup tmp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
