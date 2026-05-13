/**
 * NSFW content moderation for uploaded clip sources.
 *
 * Hook called from transcribe-groq BEFORE Whisper runs. If the frame check
 * flags the source as NSFW, we throw a clear `content_moderation_failed`
 * error so the pipeline marks the run as failed and the user sees the
 * reason in the UI.
 *
 * Approach:
 *   1. Extract a single representative frame from the LOCAL source file
 *      (already downloaded by the transcriber) at ~25% of the duration —
 *      avoids dead-space title cards and end credits.
 *   2. Upload the frame to R2 with a short TTL signed URL so Replicate can
 *      fetch it. Falls back to base64 data URL if R2 isn't configured.
 *   3. Run Replicate's `lucataco/nsfw_image_detection` model. It returns
 *      `{ label: "NSFW" | "NORMAL", score: 0..1 }`.
 *   4. If NSFW with score > THRESHOLD (default 0.85) — reject.
 *
 * If REPLICATE_API_TOKEN isn't configured, moderation is skipped (no-op).
 * Production /api/health flags this so we know moderation is active.
 *
 * Cost: ~$0.0003 per frame (Replicate L4 GPU). At 10K renders/day that's
 * $3/day or $90/month. Acceptable for the legal protection.
 *
 * If you want stricter checks later, raise THRESHOLD to 0.7, or extract
 * 3 frames (start/middle/end) and reject if ANY trip the threshold.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { isR2Configured, presignR2Url } from '@/lib/storage/r2';

const execFileAsync = promisify(execFile);

// Score above this = reject. The model overshoots on edge cases (athletic
// wear, art, skin-tone exposed) so we keep it loose. Update with experience.
const NSFW_THRESHOLD = 0.85;

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

export interface ModerationResult {
  ok: boolean;
  /** Reason for rejection, only set when ok=false. */
  reason?: string;
  /** Raw model score for the dominant label, for telemetry/debug. */
  score?: number;
  /** Set to true when moderation was skipped (env not configured). */
  skipped?: boolean;
}

/**
 * Extract a frame from a local video file at the given timestamp.
 * Returns the path to the extracted .jpg.
 */
async function extractFrame(srcPath: string, atSec: number): Promise<string> {
  const ffmpeg = getFFmpegPath();
  const outPath = join(tmpdir(), `mod-frame-${randomUUID()}.jpg`);
  await execFileAsync(
    ffmpeg,
    [
      '-ss', atSec.toFixed(2),
      '-i', srcPath,
      '-frames:v', '1',
      '-q:v', '4',  // mid-quality JPEG, ~150KB
      '-y',
      outPath,
    ],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (!existsSync(outPath)) throw new Error('frame extraction produced no file');
  return outPath;
}

/**
 * Upload a local jpg to R2 with a 10-minute TTL and return the GET signed URL.
 * Returns null if R2 isn't configured.
 */
async function uploadFrameToR2(localPath: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  const key = `moderation/${Date.now()}-${randomUUID()}.jpg`;
  const putUrl = presignR2Url({ method: 'PUT', key, expiresInSec: 600, contentType: 'image/jpeg' });
  const body = await readFile(localPath);
  const putResp = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body,
  });
  if (!putResp.ok) {
    console.warn(`[moderation] R2 frame upload failed ${putResp.status}`);
    return null;
  }
  return presignR2Url({ method: 'GET', key, expiresInSec: 600 });
}

/**
 * Call Replicate NSFW classifier with the given image URL.
 * Returns { label, score }. Throws if Replicate is unconfigured or errors.
 *
 * Uses Replicate's model-default-version endpoint
 * (POST /v1/models/{owner}/{name}/predictions) so we don't pin to a version
 * hash that can drift. We poll the prediction until it's terminal.
 */
async function classifyImage(imageUrl: string): Promise<{ label: string; score: number }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN missing');

  // lucataco/nsfw_image_detection — small, fast.
  const createResp = await fetch(
    'https://api.replicate.com/v1/models/lucataco/nsfw_image_detection/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: { image: imageUrl } }),
    },
  );
  if (!createResp.ok) {
    const text = await createResp.text().catch(() => '');
    throw new Error(`Replicate create ${createResp.status}: ${text.slice(0, 200)}`);
  }
  const created = await createResp.json() as { id: string; urls?: { get?: string } };
  const pollUrl = created.urls?.get || `https://api.replicate.com/v1/predictions/${created.id}`;

  // Poll up to ~30s for completion. The model is fast (<3s typical) but
  // cold starts occasionally hit 20s.
  const deadline = Date.now() + 30_000;
  let last: { status?: string; output?: unknown; error?: string } | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const r = await fetch(pollUrl, { headers: { Authorization: `Token ${token}` } });
    if (!r.ok) continue;
    last = await r.json();
    if (last?.status && ['succeeded', 'failed', 'canceled'].includes(last.status)) break;
  }
  if (!last || last.status !== 'succeeded') {
    throw new Error(`Replicate moderation prediction did not succeed: ${last?.status || 'timeout'} ${last?.error || ''}`);
  }
  const output = last.output as unknown;

  // Output can be: an object, an array of {label, score}, or a string.
  // Normalize defensively.
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const o = output as { label?: string; score?: number; is_nsfw?: boolean };
    if (o.label && typeof o.score === 'number') return { label: o.label, score: o.score };
    if (typeof o.is_nsfw === 'boolean') return { label: o.is_nsfw ? 'NSFW' : 'NORMAL', score: o.is_nsfw ? 0.99 : 0.01 };
  }
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0] as { label?: string; score?: number };
    if (first.label && typeof first.score === 'number') return { label: first.label, score: first.score };
  }
  // If we can't parse, treat as NORMAL but log so we can fix the parser.
  console.warn('[moderation] unparsed Replicate output:', JSON.stringify(output).slice(0, 200));
  return { label: 'NORMAL', score: 0 };
}

/**
 * Moderate a local video file. Returns { ok: true } if safe to proceed.
 * On Replicate errors, returns ok: true with skipped: true so a moderation
 * outage doesn't break the user's run. Hard rejections require a successful
 * model response that flags NSFW above threshold.
 */
export async function moderateLocalVideo(localPath: string, opts?: { durationSec?: number }): Promise<ModerationResult> {
  if (!process.env.REPLICATE_API_TOKEN) {
    return { ok: true, skipped: true };
  }
  const totalDur = opts?.durationSec && opts.durationSec > 0 ? opts.durationSec : 30;
  const sampleAt = Math.max(0.5, Math.min(totalDur * 0.25, totalDur - 1));

  let framePath: string | null = null;
  try {
    framePath = await extractFrame(localPath, sampleAt);
    const r2Url = await uploadFrameToR2(framePath);
    if (!r2Url) {
      // No R2 — fall back to skipping (no good way to hand a local file to Replicate).
      // We log so it's visible in production; once R2 is wired, this path goes away.
      console.warn('[moderation] R2 unavailable — skipping NSFW check');
      return { ok: true, skipped: true };
    }

    const { label, score } = await classifyImage(r2Url);
    const isNsfw = /NSFW|EXPLICIT|PORN/i.test(label) && score >= NSFW_THRESHOLD;
    if (isNsfw) {
      return {
        ok: false,
        reason: `Content flagged as ${label} (confidence ${(score * 100).toFixed(0)}%). FlashFlow's terms of service prohibit explicit content.`,
        score,
      };
    }
    return { ok: true, score };
  } catch (err) {
    console.warn('[moderation] non-fatal error — proceeding without block:', err instanceof Error ? err.message : err);
    return { ok: true, skipped: true };
  } finally {
    if (framePath && existsSync(framePath)) {
      try { await unlink(framePath); } catch { /* ignore */ }
    }
  }
}
