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
import {
  buildEditPlan,
  remapCaptionsToFinalTime,
  normalizeKeepRanges,
  type EditPlan,
  type PlanCaption,
} from './edit-plan';

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

/**
 * Detect retakes/flubs and drop the earlier attempt.
 *
 * Heuristic: when two adjacent transcript segments start with the same first
 * ~2 words AND the gap between them is small (≤1.8s), the speaker likely
 * restarted the sentence. Keep the LATER attempt and drop the earlier.
 *
 * Inspired by Brandon's spec: "I love it when — I absolutely love it when
 * this happens..." includes both takes if you don't catch it.
 */
function removeRetakeIntervals(
  transcript: EditJobTranscript,
  keep: KeepSegment[],
): KeepSegment[] {
  const segs = transcript.segments;
  if (!segs || segs.length < 2) return keep;

  const skipRanges: Array<[number, number]> = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i];
    const b = segs[i + 1];
    const gap = b.start - a.end;
    if (gap > 1.8) continue;

    const aw = (a.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/);
    const bw = (b.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/);
    if (aw.length < 2 || bw.length < 2) continue;

    // Match if first 2 words match exactly, or if the first 8 chars match.
    // Previously we ALSO dropped any segment ≤4 words on a "likely aborted"
    // theory, but that nuked legitimate short segments (e.g. "Wait for it.")
    // that happened to be followed by a related sentence. Now we only treat
    // a short segment as a retake if the next segment ALSO starts with
    // similar words — i.e. there's actual evidence of a restart.
    const firstTwoMatch = aw.slice(0, 2).join(' ') === bw.slice(0, 2).join(' ');
    const firstEightMatch = aw.join(' ').slice(0, 8) === bw.join(' ').slice(0, 8);
    const aShortAndOverlap =
      aw.length <= 4 && (firstTwoMatch || aw[0] === bw[0]);

    if (firstTwoMatch || firstEightMatch || aShortAndOverlap) {
      skipRanges.push([a.start, a.end]);
    }
  }

  if (skipRanges.length === 0) return keep;

  // Subtract skip ranges from each keep segment
  return keep.flatMap<KeepSegment>((k) => {
    let parts: KeepSegment[] = [k];
    for (const [skipStart, skipEnd] of skipRanges) {
      const next: KeepSegment[] = [];
      for (const p of parts) {
        if (skipEnd <= p.start || skipStart >= p.end) {
          next.push(p);
        } else {
          if (skipStart > p.start) next.push({ start: p.start, end: skipStart });
          if (skipEnd < p.end) next.push({ start: skipEnd, end: p.end });
        }
      }
      parts = next;
    }
    return parts.filter((p) => p.end - p.start > 0.1);
  });
}

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
  videoWidth = 1080,
): string {
  const isKinetic = captionStyle === 'kinetic';
  // Styling — kinetic = bigger font, shorter chunks. Font is sized off the
  // shorter dimension so 16:9 horizontal output doesn't get giant letters.
  const refDim = Math.min(videoHeight, videoWidth);
  const baseFontSize = Math.round(refDim * (isKinetic ? 0.065 : 0.045));
  const hookFontSize = Math.round(refDim * (isKinetic ? 0.09 : 0.075));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
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

/**
 * Render captions from the LLM EditPlan instead of raw transcript words.
 * The plan's captions are already tone-tweaked, properly chunked (2-5 words),
 * and tagged with style hints (hook/normal/emphasis).
 *
 * NOTE: plan.captions timestamps reference the FINAL cut (because the LLM
 * sees the planned keep ranges). When the renderer concats those keeps, the
 * timestamps line up \u2014 that's the contract.
 */
function buildAssFromPlan(
  captions: PlanCaption[],
  videoHeight = 1920,
  captionStyle: CaptionStyle = 'normal',
  videoWidth = 1080,
): string {
  const isKinetic = captionStyle === 'kinetic';
  const refDim = Math.min(videoHeight, videoWidth);
  const baseFontSize = Math.round(refDim * (isKinetic ? 0.065 : 0.045));
  const hookFontSize = Math.round(refDim * (isKinetic ? 0.09 : 0.075));
  const emphasisFontSize = Math.round(refDim * (isKinetic ? 0.075 : 0.055));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial,${baseFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,${Math.round(videoHeight * 0.08)},1
Style: Hook,Arial Black,${hookFontSize},&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,3,2,40,40,${Math.round(videoHeight * 0.3)},1
Style: Emphasis,Arial Black,${emphasisFontSize},&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,3,2,60,60,${Math.round(videoHeight * 0.08)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  for (const c of captions) {
    if (c.end - c.start < 0.05) continue;
    const styleName =
      c.style === 'hook' ? 'Hook'
      : c.style === 'emphasis' ? 'Emphasis'
      : 'Normal';
    lines.push(
      `Dialogue: 0,${secToAss(c.start)},${secToAss(c.end)},${styleName},,0,0,0,,${escapeAss(c.text.toUpperCase())}`,
    );
  }

  return header + lines.join('\n') + '\n';
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
  await supabaseAdmin.from('ai_edit_jobs').update({ status, ...extra }).eq('id', jobId);
}

/**
 * Real-time-feeling progress updater. The detail page polls every ~1.5s and
 * reads progress_pct + phase_message off the row, so this is what makes
 * "kinda working" feel like "actually working".
 *
 * Values are coarse-grained because the pipeline can't easily report sub-step
 * progress from inside a synchronous ffmpeg spawn — but a 30→55→70→85 climb
 * is dramatically better than three status-string flips.
 *
 * Wrapped in try/catch because we never want a logging failure to fail a job.
 */
async function setProgress(jobId: string, pct: number, message: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('ai_edit_jobs')
      .update({
        progress_pct: Math.max(0, Math.min(100, Math.round(pct))),
        phase_message: message.slice(0, 200),
      })
      .eq('id', jobId);
    // Supabase JS v2 surfaces errors via the resolved object's .error, not
    // by throwing — so we have to inspect it explicitly. We never want a
    // logging-style call to fail a job.
    if (error) {
      console.warn('[editor] setProgress db error', { jobId, pct, error: error.message });
    }
  } catch (err) {
    console.warn('[editor] setProgress threw', { jobId, pct, err });
  }
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
    return "Transcription is unavailable because OPENAI_API_KEY isn't set on the server. Hit Retry once it's configured — your upload is safe.";
  }
  if (/file too large|413|Maximum content size|25\s*MB|payload/i.test(raw)) {
    return "Your clip's audio is over Whisper's 25 MB limit. Try a clip under 30 minutes, or split it into two and run them separately.";
  }
  if (/No raw footage/i.test(raw)) {
    return "We couldn't find any video on this job. Upload an .mp4, .mov, or .webm clip and try again.";
  }
  if (/Silence trim produced no usable segments/i.test(raw)) {
    return "We couldn't detect any speech in this clip. Try a longer clip with clearer audio, or switch to Quick Cut mode which is more forgiving.";
  }
  if (/Anthropic API error 4\d\d/i.test(raw)) {
    return "The AI editor briefly hit a rate limit. Hit Retry — we won't re-bill the transcription.";
  }
  if (/Anthropic API error 5\d\d/i.test(raw) || /Anthropic.*timeout/i.test(raw)) {
    return "The AI editor service is having a moment. Hit Retry in 30 seconds — your upload + transcription are saved.";
  }
  if (/openai|whisper/i.test(raw) && /(429|rate.?limit)/i.test(raw)) {
    return "Transcription hit a rate limit. Hit Retry in 30 seconds — nothing was billed.";
  }
  if (/openai|whisper/i.test(raw) && /(5\d\d|timeout|ECONN|EAI_AGAIN)/i.test(raw)) {
    return "Transcription service is having a moment. Hit Retry — your upload is safe.";
  }
  if (/AbortError|operation was aborted/i.test(raw)) {
    return "The AI call timed out. Hit Retry — your upload + transcript are saved.";
  }
  if (/ffmpeg exited/i.test(raw)) {
    return `Video processing failed — your clip may be corrupted or use an unusual codec. Try re-exporting from your camera/phone in standard .mp4 (H.264). (${raw.slice(-200)})`;
  }
  if (/Download failed/i.test(raw)) {
    return `We couldn't pull your clip from storage. This is usually a transient hiccup — hit Retry. (${raw.slice(-150)})`;
  }
  if (/Upload failed/i.test(raw)) {
    return `Couldn't save your finished video to storage. Hit Retry — the render itself worked. (${raw.slice(-150)})`;
  }
  if (/not found/i.test(raw) && /Job/i.test(raw)) {
    return "This job record was deleted before processing could start. Create a new edit and re-upload.";
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
    .from('ai_edit_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);

  if (process.env.NODE_ENV !== 'production' || process.env.EDITOR_DEBUG === '1') {
    console.log('[editor]', {
      route: 'pipeline.processEditJob',
      user_id: job.user_id,
      job_id: jobId,
    });
  }

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

  // Note: OPENAI_API_KEY is only required if we actually run Whisper —
  // checked inline below so retries with an existing transcript don't fail.

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `edit-job-${jobId}-`));
  try {
    // 1. Download all raw files
    await setProgress(jobId, 5, 'Pulling your footage from storage…');
    const localRaws: string[] = [];
    for (let i = 0; i < rawAssets.length; i++) {
      const dest = path.join(workDir, `raw_${i}.mp4`);
      await downloadFromStorage(rawAssets[i].path, dest);
      localRaws.push(dest);
    }

    // 2. Transcribe (transcribe first raw for now — combining audio is overkill for MVP)
    await setStatus(jobId, 'transcribing', { started_at: new Date().toISOString() });
    await setProgress(jobId, 15, 'Listening to every word your speaker said…');
    const primary = localRaws[0];

    // Skip re-transcribe on retry: if the job already has a non-empty transcript,
    // reuse it. Saves Whisper $$ on Inngest retries triggered by downstream failures.
    const existingTranscript = (job.transcript && typeof job.transcript === 'object')
      ? (job.transcript as Partial<EditJobTranscript>)
      : null;
    let transcript: EditJobTranscript;

    if (existingTranscript && typeof existingTranscript.text === 'string' && existingTranscript.text.trim().length > 0) {
      console.log('[editor] Reusing existing transcript for job', jobId, '— skipping Whisper');
      transcript = {
        text: existingTranscript.text,
        words: Array.isArray(existingTranscript.words) ? existingTranscript.words : [],
        segments: Array.isArray(existingTranscript.segments) ? existingTranscript.segments : [],
      };
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set — transcription cannot run. Set this env var and retry.');
      }
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // Extract audio for Whisper (smaller upload)
      const audioFile = path.join(workDir, 'audio.mp3');
      // 64k mono mp3 is plenty for Whisper (accuracy unaffected) and frees ~33%
      // headroom under the 25 MB upload cap for longer clips.
      await runFfmpeg(['-y', '-i', primary, '-vn', '-acodec', 'libmp3lame', '-b:a', '64k', audioFile]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tResp: any = await openai.audio.transcriptions.create({
        file: await toFileLike(audioFile, 'audio.mp3'),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
      });

      transcript = {
        text: tResp.text ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        words: (tResp.words ?? []).map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        segments: (tResp.segments ?? []).map((s: any) => ({ start: s.start, end: s.end, text: s.text })),
      };

      await supabaseAdmin.from('ai_edit_jobs').update({ transcript }).eq('id', jobId);
    }

    // 3. Build timeline (heuristic pass first, then LLM-driven plan)
    await setStatus(jobId, 'building_timeline');
    await setProgress(jobId, 30, 'Trimming dead air and catching retakes…');

    // Build keep segments from silence detection on primary
    const primaryDuration = await getDuration(primary);
    let keep: KeepSegment[] = [{ start: 0, end: primaryDuration }];
    if (cfg.silenceTrim) {
      keep = await detectSilenceSegments(primary, cfg.minSilence, primaryDuration);
    }

    // Retake/flub detection — drops the earlier of two adjacent sentence attempts
    // that start with the same words. Brandon's flagship complaint: overseas editors
    // miss "I love it when — I absolutely love it when this happens..." and keep both.
    keep = removeRetakeIntervals(transcript, keep);

    // 3b. LLM EDIT PLAN — the value-prop step. Claude Sonnet 4 reads the
    // transcript, mode, platform, and user notes and produces a structured
    // plan: keep ranges, hook rewrite, caption phrases, b-roll cues, end card.
    // Falls back to the heuristic plan if the LLM is unavailable — pipeline
    // never blocks on the LLM.
    await setStatus(jobId, 'planning');
    await setProgress(jobId, 45, 'AI editor is choosing your best moments…');

    const platform = typeof modeOptions === 'object'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((modeOptions as any).platform as string | undefined)
      : undefined;
    const notes = typeof modeOptions === 'object'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((modeOptions as any).notes as string | undefined)
      : undefined;

    const editPlan: EditPlan = await buildEditPlan({
      transcript,
      mode,
      platform,
      notes,
      heuristicKeep: keep,
      sourceDuration: primaryDuration,
      jobId,
    });

    // Persist the plan so the UI can show it + so retries don't re-bill the LLM.
    await supabaseAdmin
      .from('ai_edit_jobs')
      .update({ edit_plan: editPlan })
      .eq('id', jobId);

    // If the LLM produced concrete keep ranges, prefer them over the
    // heuristic — that's the whole point. Otherwise stick with heuristic.
    // normalizeKeepRanges sorts + merges overlaps so the renderer never
    // double-cuts the same segment.
    if (editPlan.source === 'llm' && editPlan.keep_ranges.length > 0) {
      keep = normalizeKeepRanges(
        editPlan.keep_ranges.map((k) => ({ start: k.start, end: k.end })),
      );
    } else {
      // Even on the heuristic path, normalize — silenceDetect + retake
      // removal can produce adjacent ranges that benefit from merging.
      keep = normalizeKeepRanges(keep);
    }

    // For jump cuts: split long keeps into 1.5-3s chunks. Deterministic seeded
    // PRNG (off the jobId) so retries produce the same cuts → idempotent renders
    // and predictable customer-support repro.
    if (cfg.jumpCuts) {
      const rng = mulberry32(hashString(jobId));
      const chunked: KeepSegment[] = [];
      for (const seg of keep) {
        let s = seg.start;
        while (s < seg.end) {
          const len = 1.5 + rng() * 1.5;
          const e = Math.min(s + len, seg.end);
          chunked.push({ start: s, end: e });
          s = e;
        }
      }
      keep = chunked;
    }

    // 4. Render: cut + normalize each segment, concat
    await setStatus(jobId, 'rendering');
    await setProgress(jobId, 55, 'Cutting your scenes — this is the long step…');

    const dims = dimsForPlatform(platform);
    const scaleFilter =
      `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,` +
      `pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

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
        '-vf', scaleFilter,
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
      // Last-ditch fallback: if every keep range got filtered, render the
      // whole clip un-trimmed instead of failing the job. Better to return
      // a working video than throw.
      console.warn('[editor] no usable keep segments; rendering full clip as fallback', { jobId });
      const segFile = path.join(workDir, 'seg_full.mp4');
      await runFfmpeg([
        '-y',
        '-i', primary,
        '-vf', scaleFilter,
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
      // Reset keep so caption-remap uses the whole clip.
      keep = [{ start: 0, end: primaryDuration }];
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

    // 5. Burn captions — prefer the LLM-curated captions if we got them,
    // because they're tone-tweaked, all-caps, properly chunked. Fall back
    // to verbatim transcript word-grouping when the plan is heuristic.
    if (cfg.captions) {
      await setProgress(jobId, 75, 'Burning in punchy captions…');
      const assFile = path.join(workDir, 'captions.ass');
      const useLlmCaptions = editPlan.source === 'llm' && editPlan.captions.length > 0;
      // The LLM emits captions in SOURCE time. We just concatenated `keep`
      // ranges into the final cut, so remap the captions to final-cut time
      // before generating the ASS file. Dropped ranges → captions silently
      // omitted (already filtered by remapCaptionsToFinalTime).
      const finalTimeCaptions = useLlmCaptions
        ? remapCaptionsToFinalTime(editPlan.captions, keep)
        : [];

      let assContent: string;
      if (useLlmCaptions && finalTimeCaptions.length > 0) {
        assContent = buildAssFromPlan(finalTimeCaptions, dims.height, captionStyle, dims.width);
      } else {
        // Heuristic fallback path: build captions from the transcript words,
        // BUT remap them to final-cut time so they line up with the cuts.
        // (The previous build used source-time stamps, which drifted past
        // any silence-trimmed segment.)
        const remappedTranscript = remapTranscriptToFinalTime(transcript, keep);
        assContent = buildAss(remappedTranscript, mode, dims.height, captionStyle, dims.width);
      }
      await fs.writeFile(assFile, assContent);
      const withCaps = path.join(workDir, 'with_caps.mp4');
      const escapedAss = escapeAssPath(assFile);
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
      await setProgress(jobId, 88, 'Adding the FlashFlow watermark…');
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
    await setProgress(jobId, 95, 'Uploading your finished video…');
    const outputPath = `${job.user_id}/${jobId}/output/final.mp4`;
    const publicUrl = await uploadToStorage(outputPath, currentFile, 'video/mp4');

    await supabaseAdmin
      .from('ai_edit_jobs')
      .update({
        status: 'completed',
        output_url: publicUrl,
        preview_url: publicUrl,
        error: null,
        finished_at: new Date().toISOString(),
        progress_pct: 100,
        phase_message: 'Your video is ready.',
      })
      .eq('id', jobId);

    // 9. Storage TTL — async cleanup of raw uploads after the job is done.
    // Outputs (final.mp4) stay; raws are the user's source files which we no
    // longer need once the render is delivered. Wrap in try/catch so a cleanup
    // failure never poisons a successfully completed job.
    cleanupRawUploads(job.user_id, jobId).catch((cleanupErr) => {
      console.warn('[editor] raw cleanup failed for job', jobId, cleanupErr);
    });
  } finally {
    // Cleanup
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Delete every object under `{userId}/{jobId}/raw/` from the edit-jobs bucket.
 * Called after the job hits status='completed'. Outputs (under .../output/)
 * are intentionally left alone — those are the user's deliverable.
 *
 * Safe to fail: caller catches and logs.
 */
async function cleanupRawUploads(userId: string, jobId: string): Promise<void> {
  const prefix = `${userId}/${jobId}/raw`;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .list(prefix, { limit: 1000 });

    if (error) {
      console.warn('[editor] cleanup: list failed for', prefix, error);
      return;
    }
    if (!data || data.length === 0) {
      console.log('[editor] cleanup: nothing to remove under', prefix);
      return;
    }

    const paths = data.map((entry) => `${prefix}/${entry.name}`);
    const { error: rmErr } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove(paths);

    if (rmErr) {
      console.warn('[editor] cleanup: remove failed for', prefix, rmErr);
      return;
    }
    console.log(`[editor] cleanup: removed ${paths.length} raw upload(s) under ${prefix}`);
  } catch (err) {
    console.warn('[editor] cleanup: unexpected error for', prefix, err);
  }
}

// Convert a local file to an OpenAI SDK-compatible upload
async function toFileLike(filePath: string, name: string) {
  const buf = await fs.readFile(filePath);
  return toFile(buf, name);
}

// ---------- Transcript source→final time remap ----------

/**
 * Remap an entire transcript (words + segments) from SOURCE time into
 * FINAL-CUT time, given the keep ranges that will be concatenated. Words /
 * segments that fall in dropped ranges are removed. Used by the heuristic
 * caption path so captions line up with the trimmed cuts.
 */
export function remapTranscriptToFinalTime(
  t: EditJobTranscript,
  keepRanges: Array<{ start: number; end: number }>,
): EditJobTranscript {
  const sorted = [...keepRanges]
    .filter((r) => r.end - r.start > 0.05)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return t;

  // Compute cumulative offset for each keep range.
  const offsets: Array<{ start: number; end: number; cum: number }> = [];
  let cum = 0;
  for (const r of sorted) {
    offsets.push({ start: r.start, end: r.end, cum });
    cum += r.end - r.start;
  }

  function map(stamp: number): number | null {
    for (const o of offsets) {
      if (stamp >= o.start && stamp < o.end) {
        return o.cum + (stamp - o.start);
      }
    }
    return null;
  }

  const words: TranscriptWord[] = [];
  for (const w of t.words || []) {
    const ws = map(w.start);
    const we = map(w.end);
    if (ws === null || we === null || we - ws < 0.02) continue;
    words.push({ word: w.word, start: ws, end: we });
  }

  const segments = (t.segments || []).flatMap((s) => {
    const ss = map(s.start);
    const se = map(s.end);
    if (ss === null || se === null || se - ss < 0.05) return [];
    return [{ start: ss, end: se, text: s.text }];
  });

  return { text: t.text, words, segments };
}

// ---------- Determinism helpers ----------

/**
 * Tiny, fast non-crypto PRNG. Seeded by hashString(jobId) so retries of the
 * same job produce identical jump-cut splits. Idempotent renders are a feature.
 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function() {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ---------- Output dimensions per platform ----------

export interface OutputDims { width: number; height: number }

/**
 * Decide the output frame size from the caller's platform string.
 * Defaults to 9:16 1080×1920 (TikTok/Reels/Shorts) — that's where most of
 * Brandon's traffic lives. yt_long → 16:9, square → 1:1.
 */
export function dimsForPlatform(platform: string | undefined): OutputDims {
  const p = (platform || '').toLowerCase();
  if (p === 'yt_long' || p === 'youtube' || p === 'horizontal') {
    return { width: 1920, height: 1080 };
  }
  if (p === 'square' || p === '1x1') {
    return { width: 1080, height: 1080 };
  }
  return { width: 1080, height: 1920 };
}

/**
 * Build an ASS-friendly path. ffmpeg's libass filter needs `:` and `\` escaped
 * inside the filter argument; on Windows-style paths we also flip slashes.
 * We DO NOT wrap in quotes — ffmpeg handles that itself when using `-vf`.
 */
export function escapeAssPath(p: string): string {
  return p
    .replace(/\\/g, '/')   // windows → posix
    .replace(/:/g, '\\:')  // colons in filters are special
    .replace(/'/g, "\\'"); // apostrophes (rare, but happen in some tmpdir paths)
}
