/**
 * AI Video Editor — processing pipeline.
 *
 * Runs the job through: download assets → transcribe → build timeline → render → upload.
 * Uses ffmpeg-static + child_process. No fluent-ffmpeg dependency required.
 *
 * NOTE: This runs inside Next.js API route handlers (runtime = 'nodejs').
 * Vercel's 300s maxDuration limit applies — long videos will fail.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import OpenAI, { toFile } from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require('ffmpeg-static');

export const BUCKET_NAME = 'edit-jobs';

export type EditMode = 'quick' | 'hook' | 'ugc' | 'talking_head';
export type CaptionStyle = 'normal' | 'kinetic';
export type PaceSetting = 'normal' | 'fast';

export interface EditModeOptions {
  caption_style?: CaptionStyle;
  pace?: PaceSetting;
}

export type AssetKind = 'raw' | 'broll' | 'product' | 'music';

export interface EditJobAsset {
  kind: AssetKind;
  path: string; // storage path
  name: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface EditJobTranscript {
  text: string;
  words: TranscriptWord[];
  segments: Array<{ start: number; end: number; text: string }>;
}

// ---------- ffmpeg helpers ----------

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

function runFfmpegCapture(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      // ffmpeg silencedetect emits on stderr and may exit 0 or 1
      if (code === 0 || code === 1) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function getDuration(input: string): Promise<number> {
  const out = await runFfmpegCapture(['-i', input, '-f', 'null', '-']);
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
}

// ---------- silence trim ----------

interface KeepSegment { start: number; end: number }

async function detectSilenceSegments(
  input: string,
  minSilence: number,
  duration: number,
): Promise<KeepSegment[]> {
  const out = await runFfmpegCapture([
    '-i', input,
    '-af', `silencedetect=noise=-30dB:d=${minSilence}`,
    '-f', 'null', '-',
  ]);

  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of out.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) starts.push(parseFloat(s[1]));
    if (e) ends.push(parseFloat(e[1]));
  }

  // Build keep segments = complement of silence ranges
  const silences: KeepSegment[] = [];
  for (let i = 0; i < starts.length; i++) {
    silences.push({ start: starts[i], end: ends[i] ?? duration });
  }

  const keep: KeepSegment[] = [];
  let cursor = 0;
  for (const sil of silences) {
    if (sil.start > cursor + 0.05) {
      keep.push({ start: cursor, end: sil.start });
    }
    cursor = sil.end;
  }
  if (cursor < duration - 0.05) keep.push({ start: cursor, end: duration });

  if (keep.length === 0) {
    // Fallback: keep whole thing
    return [{ start: 0, end: duration }];
  }
  return keep;
}

// ---------- ASS captions ----------

function secToAss(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const cs = Math.floor((s % 1) * 100);
  const ss = Math.floor(s);
  return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function buildAss(
  transcript: EditJobTranscript,
  mode: EditMode,
  videoHeight = 1920,
  captionStyle: CaptionStyle = 'normal',
): string {
  const isKinetic = captionStyle === 'kinetic';
  // Styling — kinetic = bigger font, shorter chunks
  const baseFontSize = Math.round(videoHeight * (isKinetic ? 0.065 : 0.045));
  const hookFontSize = Math.round(videoHeight * (isKinetic ? 0.09 : 0.075));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial,${baseFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,${Math.round(videoHeight * 0.08)},1
Style: Hook,Arial Black,${hookFontSize},&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,3,2,40,40,${Math.round(videoHeight * 0.3)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into short phrases (~3-5 words)
  const lines: string[] = [];
  const words = transcript.words || [];
  if (words.length === 0 && transcript.segments) {
    for (const seg of transcript.segments) {
      const style = mode === 'hook' && seg.start < 3 ? 'Hook' : 'Normal';
      lines.push(`Dialogue: 0,${secToAss(seg.start)},${secToAss(seg.end)},${style},,0,0,0,,${escapeAss(seg.text.trim().toUpperCase())}`);
    }
  } else {
    let i = 0;
    // Kinetic = 2-word flashes for faster cadence
    const chunkSize = isKinetic ? 2 : 4;
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize);
      if (chunk.length === 0) break;
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const text = chunk.map((w) => w.word.trim()).join(' ').toUpperCase();
      const style = mode === 'hook' && start < 3 ? 'Hook' : 'Normal';
      lines.push(`Dialogue: 0,${secToAss(start)},${secToAss(end)},${style},,0,0,0,,${escapeAss(text)}`);
      i += chunkSize;
    }
  }

  return header + lines.join('\n') + '\n';
}

function escapeAss(s: string): string {
  return s.replace(/\n/g, '\\N').replace(/,/g, '\u066c');
}

// ---------- mode → flags ----------

interface ModeConfig {
  silenceTrim: boolean;
  minSilence: number;
  captions: boolean;
  music: boolean;
  productOverlay: boolean;
  jumpCuts: boolean;
}

function modeConfig(mode: EditMode, options: EditModeOptions = {}): ModeConfig {
  const fast = options.pace === 'fast';
  // Fast pace = tighter silence threshold so more "dead air" is cut.
  const base = (normal: number) => (fast ? Math.min(normal, 0.4) : normal);
  switch (mode) {
    case 'quick':
      return { silenceTrim: true, minSilence: base(0.7), captions: false, music: false, productOverlay: false, jumpCuts: false };
    case 'hook':
      return { silenceTrim: true, minSilence: base(0.7), captions: true, music: false, productOverlay: false, jumpCuts: true };
    case 'ugc':
      return { silenceTrim: true, minSilence: base(0.7), captions: true, music: true, productOverlay: true, jumpCuts: false };
    case 'talking_head':
      return { silenceTrim: true, minSilence: base(0.4), captions: true, music: false, productOverlay: false, jumpCuts: false };
  }
}

// ---------- storage helpers ----------

async function downloadFromStorage(storagePath: string, destFile: string): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_NAME).download(storagePath);
  if (error || !data) throw new Error(`Download failed for ${storagePath}: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(destFile, buf);
}

async function uploadToStorage(storagePath: string, localFile: string, contentType: string): Promise<string> {
  const buf = await fs.readFile(localFile);
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buf, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function ensureEditJobsBucket(): Promise<void> {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
  if (exists) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 500 * 1024 * 1024,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Failed to create bucket: ${error.message}`);
  }
}

// ---------- job status updater ----------

async function setStatus(jobId: string, status: string, extra: Record<string, unknown> = {}) {
  await supabaseAdmin.from('edit_jobs').update({ status, ...extra }).eq('id', jobId);
}

// ---------- main pipeline ----------

/**
 * Convert a raw error into a human-friendly, actionable message.
 * Used by both the sync path and the Inngest function so failures always
 * surface a concrete next action instead of a stack trace.
 */
export function humanizeEditJobError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/OPENAI_API_KEY/i.test(raw)) {
    return 'Transcription is unavailable because OPENAI_API_KEY is not set. Contact support or set the key in environment settings.';
  }
  if (/file too large|413|Maximum content size|25\s*MB|payload/i.test(raw)) {
    return 'Audio extracted from this clip is larger than Whisper\'s 25 MB limit. Try a shorter clip or trim before uploading.';
  }
  if (/No raw footage/i.test(raw)) {
    return 'No raw footage attached to this job. Upload at least one .mp4 or .mov clip and try again.';
  }
  if (/Silence trim produced no usable segments/i.test(raw)) {
    return 'Silence detection removed the entire clip. Try a different edit mode or a longer clip with clearer audio.';
  }
  if (/ffmpeg exited/i.test(raw)) {
    return `ffmpeg failed while processing the video. The clip may be corrupted or use an unsupported codec. (${raw.slice(-200)})`;
  }
  if (/Download failed|Upload failed/i.test(raw)) {
    return `Storage transfer failed: ${raw}. Try again in a moment.`;
  }
  if (/not found/i.test(raw) && /Job/i.test(raw)) {
    return 'Job record was deleted before processing could start.';
  }
  return raw.length > 400 ? raw.slice(0, 400) + '…' : raw;
}

export interface ProcessEditJobOptions {
  /** Whether the user is on a paid plan. Free users get a watermark. */
  isPaid?: boolean;
}

export async function processEditJob(
  jobId: string,
  options: ProcessEditJobOptions = {},
): Promise<void> {
  const isPaid = options.isPaid === true;
  // Load job
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);

  const mode = job.mode as EditMode;
  const modeOptions: EditModeOptions = (job.mode_options && typeof job.mode_options === 'object')
    ? (job.mode_options as EditModeOptions)
    : {};
  const captionStyle: CaptionStyle = modeOptions.caption_style === 'kinetic' ? 'kinetic' : 'normal';
  const cfg = modeConfig(mode, modeOptions);
  const assets: EditJobAsset[] = Array.isArray(job.assets) ? job.assets : [];
  const rawAssets = assets.filter((a) => a.kind === 'raw');
  if (rawAssets.length === 0) {
    throw new Error('No raw footage attached to job');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set — transcription cannot run. Set this env var and retry.');
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `edit-job-${jobId}-`));
  try {
    // 1. Download all raw files
    const localRaws: string[] = [];
    for (let i = 0; i < rawAssets.length; i++) {
      const dest = path.join(workDir, `raw_${i}.mp4`);
      await downloadFromStorage(rawAssets[i].path, dest);
      localRaws.push(dest);
    }

    // 2. Transcribe (transcribe first raw for now — combining audio is overkill for MVP)
    await setStatus(jobId, 'transcribing', { started_at: new Date().toISOString() });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const primary = localRaws[0];

    // Extract audio for Whisper (smaller upload)
    const audioFile = path.join(workDir, 'audio.mp3');
    await runFfmpeg(['-y', '-i', primary, '-vn', '-acodec', 'libmp3lame', '-b:a', '96k', audioFile]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tResp: any = await openai.audio.transcriptions.create({
      file: await toFileLike(audioFile, 'audio.mp3'),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
    });

    const transcript: EditJobTranscript = {
      text: tResp.text ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      words: (tResp.words ?? []).map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segments: (tResp.segments ?? []).map((s: any) => ({ start: s.start, end: s.end, text: s.text })),
    };

    await supabaseAdmin.from('edit_jobs').update({ transcript }).eq('id', jobId);

    // 3. Build timeline
    await setStatus(jobId, 'building_timeline');

    // Build keep segments from silence detection on primary
    const primaryDuration = await getDuration(primary);
    let keep: KeepSegment[] = [{ start: 0, end: primaryDuration }];
    if (cfg.silenceTrim) {
      keep = await detectSilenceSegments(primary, cfg.minSilence, primaryDuration);
    }

    // For jump cuts: split long keeps into 1.5-3s chunks
    if (cfg.jumpCuts) {
      const chunked: KeepSegment[] = [];
      for (const seg of keep) {
        let s = seg.start;
        while (s < seg.end) {
          const len = 1.5 + Math.random() * 1.5;
          const e = Math.min(s + len, seg.end);
          chunked.push({ start: s, end: e });
          s = e;
        }
      }
      keep = chunked;
    }

    // 4. Render: cut + normalize each segment, concat
    await setStatus(jobId, 'rendering');

    const segFiles: string[] = [];
    for (let i = 0; i < keep.length; i++) {
      const seg = keep[i];
      const dur = seg.end - seg.start;
      if (dur <= 0.1) continue;
      const segFile = path.join(workDir, `seg_${i.toString().padStart(4, '0')}.mp4`);
      await runFfmpeg([
        '-y',
        '-ss', seg.start.toFixed(3),
        '-i', primary,
        '-t', dur.toFixed(3),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        segFile,
      ]);
      segFiles.push(segFile);
    }

    if (segFiles.length === 0) {
      throw new Error('Silence trim produced no usable segments');
    }

    // Concat
    const listFile = path.join(workDir, 'list.txt');
    await fs.writeFile(listFile, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const concatFile = path.join(workDir, 'concat.mp4');
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      concatFile,
    ]);

    let currentFile = concatFile;

    // 5. Burn captions
    if (cfg.captions) {
      const assFile = path.join(workDir, 'captions.ass');
      await fs.writeFile(assFile, buildAss(transcript, mode, 1920, captionStyle));
      const withCaps = path.join(workDir, 'with_caps.mp4');
      // ffmpeg ass filter needs escaped path
      const escapedAss = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      await runFfmpeg([
        '-y',
        '-i', currentFile,
        '-vf', `ass=${escapedAss}`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'copy',
        withCaps,
      ]);
      currentFile = withCaps;
    }

    // 6. Product overlay (UGC mode)
    if (cfg.productOverlay) {
      const product = assets.find((a) => a.kind === 'product');
      if (product) {
        const productFile = path.join(workDir, 'product' + path.extname(product.name));
        await downloadFromStorage(product.path, productFile);
        const withOverlay = path.join(workDir, 'with_overlay.mp4');
        await runFfmpeg([
          '-y',
          '-i', currentFile,
          '-i', productFile,
          '-filter_complex', '[1:v]scale=300:-1[pw];[0:v][pw]overlay=W-w-40:40',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-c:a', 'copy',
          withOverlay,
        ]);
        currentFile = withOverlay;
      }
    }

    // 7. Music bed (UGC mode)
    if (cfg.music) {
      const music = assets.find((a) => a.kind === 'music');
      if (music) {
        const musicFile = path.join(workDir, 'music' + path.extname(music.name));
        await downloadFromStorage(music.path, musicFile);
        const withMusic = path.join(workDir, 'with_music.mp4');
        await runFfmpeg([
          '-y',
          '-i', currentFile,
          '-stream_loop', '-1',
          '-i', musicFile,
          '-filter_complex', '[1:a]volume=0.1[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          withMusic,
        ]);
        currentFile = withMusic;
      }
    }

    // 7.5 Watermark for free-tier users (Phase 7.2)
    if (!isPaid) {
      const wmFile = path.join(workDir, 'watermarked.mp4');
      const drawtext = "drawtext=text='FlashFlow':fontcolor=white@0.55:fontsize=42:x=w-tw-30:y=h-th-30:box=1:boxcolor=black@0.3:boxborderw=8";
      await runFfmpeg([
        '-y',
        '-i', currentFile,
        '-vf', drawtext,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'copy',
        wmFile,
      ]);
      currentFile = wmFile;
    }

    // 8. Upload output
    const outputPath = `${job.user_id}/${jobId}/output/final.mp4`;
    const publicUrl = await uploadToStorage(outputPath, currentFile, 'video/mp4');

    await supabaseAdmin
      .from('edit_jobs')
      .update({
        status: 'completed',
        output_url: publicUrl,
        preview_url: publicUrl,
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } finally {
    // Cleanup
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
  }
}

// Convert a local file to an OpenAI SDK-compatible upload
async function toFileLike(filePath: string, name: string) {
  const buf = await fs.readFile(filePath);
  return toFile(buf, name);
}
