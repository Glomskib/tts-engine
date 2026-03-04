#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Nightly Upload — CLI orchestrator
 *
 * Discovers `ready_to_post` videos from the FlashFlow API queue and uploads
 * them to TikTok Studio as drafts using a single persistent browser session.
 *
 * Flow:
 *   1. Preflight: check session health (cooldown lockfile, profile dir)
 *   2. Fetch queue from API → list of eligible videos
 *   3. Open browser session once (single persistent context)
 *   4. Loop through videos: fetch pack → download → upload → fill → attach → save
 *   5. Between each video: check login, brief cooldown
 *   6. Save storageState backup + close browser
 *   7. Write summary JSON to data/tiktok-uploads/nightly-YYYY-MM-DD.json
 *
 * Exit codes:
 *   0  = all videos uploaded successfully (or queue empty)
 *   1  = some videos failed (partial success)
 *   42 = session invalid — needs manual bootstrap
 *
 * CLI flags:
 *   --dry-run       — fetch queue + log what would be uploaded, no browser
 *   --limit N       — max videos per run (default: 10)
 *   --mode draft|post — override post mode (default: draft)
 *
 * Usage:
 *   pnpm run tiktok:nightly
 *   pnpm run tiktok:nightly -- --dry-run
 *   pnpm run tiktok:nightly -- --limit 3
 *   pnpm run tiktok:nightly -- --limit 1 --mode post
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  CONFIG,
  TIMEOUTS,
  openUploadStudio,
  closeSession,
  saveSessionBackup,
  checkLogin,
  dismissJoyride,
  uploadVideoFile,
  fillDescription,
  attachProductByID,
  saveDraft,
  publishPost,
  reportStatus,
  type StudioUploadResult,
} from '../../../skills/tiktok-studio-uploader/index.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type UploaderStatus, mapResultToUploaderStatus, logUploadStep } from '../../lib/uploader-status.js';
import { getNodeId } from '../../lib/node-id.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TAG = '[nightly-upload]';
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_SESSION_INVALID = 42;

const ACTOR = `nightly_upload/${getNodeId()}`;

const BETWEEN_VIDEO_DELAY_MS = 3_000;
const DEFAULT_LIMIT = 10;

// ─── CLI Flags ──────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

function parseLimit(): number {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_LIMIT;
}

function parseMode(): 'draft' | 'post' {
  const idx = process.argv.indexOf('--mode');
  if (idx !== -1 && process.argv[idx + 1] === 'post') return 'post';
  return CONFIG.postMode;
}

const LIMIT = parseLimit();
const MODE = parseMode();
const SHOULD_POST = MODE === 'post';

// ─── Optional Supabase client (for upload-step event logging) ───────────────

function getOptionalSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Preflight Checks ──────────────────────────────────────────────────────

function preflightCheck(): boolean {
  // Check profile directory
  if (!fs.existsSync(CONFIG.profileDir)) {
    console.error(`${TAG} FAIL: Profile directory does not exist: ${CONFIG.profileDir}`);
    console.error(`${TAG} Run: pnpm run tiktok:bootstrap`);
    return false;
  }

  // Check cooldown lockfile
  try {
    const stat = fs.statSync(CONFIG.cooldownLockfile);
    const ageMs = Date.now() - stat.mtimeMs;
    const cooldownHours = Number(process.env.SESSION_INVALID_COOLDOWN_HOURS) || 6;
    if (ageMs < cooldownHours * 3_600_000) {
      const hoursAgo = (ageMs / 3_600_000).toFixed(1);
      console.error(
        `${TAG} Session-invalid cooldown active (${hoursAgo}h ago, window=${cooldownHours}h).`,
      );
      console.error(`${TAG} Run: pnpm run tiktok:bootstrap`);
      return false;
    }
  } catch {
    // No lockfile = no cooldown — good
  }

  return true;
}

// ─── API Helpers ────────────────────────────────────────────────────────────

function getApiUrl(): string {
  return (
    process.env.FF_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    CONFIG.flashflowApiUrl ||
    'http://localhost:3000'
  );
}

function getApiToken(): string {
  return process.env.FF_API_TOKEN || CONFIG.flashflowApiToken || '';
}

interface QueueVideo {
  id: string;
  product_name?: string;
  product_id?: string;
  title?: string;
}

async function fetchQueue(limit: number): Promise<QueueVideo[]> {
  const baseUrl = getApiUrl();
  const token = getApiToken();

  if (!token) {
    throw new Error('FF_API_TOKEN required to fetch video queue');
  }

  const url = `${baseUrl}/api/videos/queue?status=ready_to_post&sort=priority&limit=${limit}`;
  console.log(`${TAG} Fetching queue: GET ${url}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Queue API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    ok?: boolean;
    data?: { videos?: QueueVideo[] };
    videos?: QueueVideo[];
  };

  // Handle both { data: { videos: [...] } } and { videos: [...] } shapes
  const videos = json.data?.videos || json.videos || [];
  return videos;
}

interface UploadPack {
  video_id: string;
  product_id: string;
  caption: string;
  description: string;
  hashtags: string[];
  cover_text: string;
  video_url: string;
  product?: { tiktok_product_id: string };
}

async function fetchUploadPack(videoId: string): Promise<UploadPack> {
  const baseUrl = getApiUrl();
  const token = getApiToken();
  const url = `${baseUrl}/api/publish/upload-pack`;

  console.log(`${TAG}   Fetching upload pack for video_id=${videoId}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ video_id: videoId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload pack API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    ok: boolean;
    data: { pack: UploadPack };
    error?: { message: string };
  };

  if (!json.ok) {
    throw new Error(`Upload pack error: ${json.error?.message || 'unknown'}`);
  }

  return json.data.pack;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.log(`${TAG}   Download retry ${attempt}/${retries}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
  throw new Error('unreachable');
}

async function downloadVideo(videoUrl: string): Promise<string> {
  console.log(`${TAG}   Downloading video...`);
  const res = await fetchWithRetry(videoUrl);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-nightly-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(videoPath, buffer);
  console.log(`${TAG}   Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB → ${videoPath}`);
  return videoPath;
}

function cleanupTempVideo(videoPath: string): void {
  try {
    fs.unlinkSync(videoPath);
    fs.rmdirSync(path.dirname(videoPath));
  } catch {
    /* ignore */
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────

interface VideoResult {
  video_id: string;
  status: UploaderStatus | 'skipped';
  tiktok_draft_id?: string;
  url?: string;
  errors: string[];
}

interface NightlySummary {
  date: string;
  started_at: string;
  finished_at: string;
  mode: 'draft' | 'post';
  total_queued: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  session_expired: boolean;
  results: VideoResult[];
}

function writeSummary(summary: NightlySummary): string {
  const dir = CONFIG.nightlyOutputDir;
  fs.mkdirSync(dir, { recursive: true });
  const filename = `nightly-${summary.date}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
  console.log(`${TAG} Summary written → ${filepath}`);
  return filepath;
}

// ─── Single-Video Upload ────────────────────────────────────────────────────

async function uploadSingleVideo(
  page: any,
  pack: UploadPack,
  shouldPost: boolean,
): Promise<VideoResult> {
  const videoResult: VideoResult = {
    video_id: pack.video_id,
    status: 'failed',
    errors: [],
  };

  let videoPath = '';

  try {
    // Download video
    videoPath = await downloadVideo(pack.video_url);

    // Navigate to upload page
    console.log(`${TAG}   Navigating to upload page...`);
    await page.goto(CONFIG.uploadUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    // Dismiss Joyride overlay if it reappeared on navigation
    await dismissJoyride(page);

    // Upload video file
    console.log(`${TAG}   Uploading video file...`);
    await uploadVideoFile(page, videoPath);
    console.log(`${TAG}   Video accepted.`);

    // Dismiss Joyride overlay if it appeared after upload
    await dismissJoyride(page);

    // Fill description
    const description =
      pack.description ||
      pack.caption + '\n' + pack.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    console.log(`${TAG}   Filling description...`);
    await fillDescription(page, description);
    console.log(`${TAG}   Description filled.`);

    // Attach product
    const productId = pack.product?.tiktok_product_id || pack.product_id;
    console.log(`${TAG}   Attaching product ${productId}...`);
    const productResult = await attachProductByID(page, productId);
    videoResult.errors.push(...productResult.errors);
    if (productResult.linked) {
      console.log(`${TAG}   Product linked.`);
    } else {
      console.log(`${TAG}   Product linking failed — continuing to save.`);
    }

    // Save draft or post
    if (shouldPost) {
      console.log(`${TAG}   Publishing post...`);
      const postResult = await publishPost(page);
      videoResult.errors.push(...postResult.errors);
      if (postResult.saved) {
        videoResult.status = 'posted';
        videoResult.tiktok_draft_id = postResult.tiktok_draft_id;
        videoResult.url = postResult.url;
      }
    } else {
      console.log(`${TAG}   Saving as draft...`);
      const draftResult = await saveDraft(page);
      videoResult.errors.push(...draftResult.errors);
      if (draftResult.saved) {
        videoResult.status = 'drafted';
        videoResult.tiktok_draft_id = draftResult.tiktok_draft_id;
        videoResult.url = draftResult.url;
      }
    }
  } catch (err: any) {
    videoResult.errors.push(err.message);
  } finally {
    // Clean up temp video
    if (videoPath) cleanupTempVideo(videoPath);
  }

  return videoResult;
}

// ─── Dry Run ────────────────────────────────────────────────────────────────

async function runDryRun(): Promise<void> {
  console.log(`\n${TAG} === DRY RUN ===\n`);
  console.log(`Mode:    ${MODE}`);
  console.log(`Limit:   ${LIMIT}`);
  console.log(`API URL: ${getApiUrl()}\n`);

  const videos = await fetchQueue(LIMIT);

  if (videos.length === 0) {
    console.log(`${TAG} Queue is empty — no videos ready to post.`);
    process.exit(EXIT_OK);
  }

  console.log(`${TAG} Found ${videos.length} video(s) in queue:\n`);
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    console.log(`  ${i + 1}. [${v.id}] ${v.product_name || v.title || '(untitled)'}`);
  }

  console.log(`\n${TAG} Dry run complete — would upload ${videos.length} video(s) as ${MODE}.`);
  process.exit(EXIT_OK);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const dateStr = startedAt.toISOString().slice(0, 10);
  const correlationId = `nightly-upload-${startedAt.toISOString()}`;
  const optionalSupabase = getOptionalSupabase();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TikTok Nightly Upload — ${dateStr}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`${TAG} Mode:    ${MODE}`);
  console.log(`${TAG} Limit:   ${LIMIT}`);
  console.log(`${TAG} Dry-run: ${DRY_RUN}`);
  console.log(`${TAG} Profile: ${CONFIG.profileDir}`);
  console.log('');

  // Dry run: fetch queue and exit
  if (DRY_RUN) {
    await runDryRun();
    return;
  }

  // Preflight: check session health
  if (!preflightCheck()) {
    process.exit(EXIT_SESSION_INVALID);
  }

  // Fetch queue
  const videos = await fetchQueue(LIMIT);
  if (videos.length === 0) {
    console.log(`${TAG} Queue is empty — nothing to upload. Exiting.`);
    process.exit(EXIT_OK);
  }

  console.log(`${TAG} Found ${videos.length} video(s) to process.\n`);

  // Open browser session once
  console.log(`${TAG} Opening browser session...`);
  const session = await openUploadStudio();
  if (!session) {
    console.error(`${TAG} Failed to open browser session — session invalid.`);
    process.exit(EXIT_SESSION_INVALID);
  }

  const { page, context } = session;
  const results: VideoResult[] = [];
  let sessionExpired = false;

  // Process each video
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const num = `[${i + 1}/${videos.length}]`;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${TAG} ${num} Processing video ${video.id}`);
    console.log(`${'─'.repeat(50)}`);

    // Fetch upload pack
    let pack: UploadPack;
    try {
      pack = await fetchUploadPack(video.id);
    } catch (err: any) {
      console.error(`${TAG} ${num} Failed to fetch upload pack: ${err.message}`);
      results.push({
        video_id: video.id,
        status: 'failed',
        errors: [`Failed to fetch upload pack: ${err.message}`],
      });
      continue;
    }

    // Log queued → uploading
    if (optionalSupabase) {
      await logUploadStep(optionalSupabase, {
        video_id: video.id, from: 'queued', to: 'uploading', step: 'upload_start',
        actor: ACTOR, correlation_id: correlationId,
      });
    }

    // Upload the video
    const result = await uploadSingleVideo(page, pack, SHOULD_POST);
    results.push(result);

    // Log upload result
    if (optionalSupabase && result.status !== 'skipped') {
      await logUploadStep(optionalSupabase, {
        video_id: video.id, from: 'uploading', to: result.status as UploaderStatus,
        step: 'upload_result', actor: ACTOR, correlation_id: correlationId,
        ...(result.status === 'failed' ? { error: result.errors.join('; ') } : {}),
      });
    }

    const statusIcon = result.status === 'drafted' || result.status === 'posted' ? 'OK' : 'FAIL';
    console.log(`${TAG} ${num} Result: ${statusIcon} (${result.status})`);
    if (result.tiktok_draft_id) {
      console.log(`${TAG} ${num} TikTok ID: ${result.tiktok_draft_id}`);
    }
    if (result.errors.length > 0) {
      console.log(`${TAG} ${num} Errors: ${result.errors.join('; ')}`);
    }

    // Report status back to FlashFlow (non-blocking)
    const uploadResult: StudioUploadResult = {
      status: result.status === 'drafted' || result.status === 'posted' ? result.status : 'error' as const,
      tiktok_draft_id: result.tiktok_draft_id,
      product_id: pack.product?.tiktok_product_id || pack.product_id,
      video_file: 'video.mp4',
      url: result.url,
      errors: result.errors,
    };
    try {
      await reportStatus({ video_id: video.id, result: uploadResult });
    } catch {
      /* non-blocking */
    }

    // Check login before next video (mid-batch login check)
    if (i < videos.length - 1) {
      const stillLoggedIn = await checkLogin(page);
      if (!stillLoggedIn) {
        console.error(`\n${TAG} SESSION EXPIRED mid-batch after video ${i + 1}/${videos.length}.`);
        sessionExpired = true;
        if (optionalSupabase) {
          await logUploadStep(optionalSupabase, {
            video_id: video.id, from: 'uploading', to: 'failed', step: 'session_expired',
            actor: ACTOR, correlation_id: correlationId, error: 'session_expired_mid_batch',
          });
        }

        // Mark remaining videos as skipped
        for (let j = i + 1; j < videos.length; j++) {
          results.push({
            video_id: videos[j].id,
            status: 'skipped',
            errors: ['Session expired before this video could be processed'],
          });
        }
        break;
      }

      // Brief cooldown between videos
      console.log(`${TAG} Cooling down ${BETWEEN_VIDEO_DELAY_MS / 1000}s before next video...`);
      await page.waitForTimeout(BETWEEN_VIDEO_DELAY_MS);
    }
  }

  // Save session backup + close browser
  console.log(`\n${TAG} Saving session backup...`);
  try {
    await saveSessionBackup(context);
  } catch {
    /* non-critical */
  }
  await closeSession(session, 0);
  console.log(`${TAG} Browser session closed.`);

  // Build summary
  const finishedAt = new Date();
  const succeeded = results.filter(
    (r) => r.status === 'drafted' || r.status === 'posted',
  ).length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const summary: NightlySummary = {
    date: dateStr,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    mode: MODE,
    total_queued: videos.length,
    attempted: results.length - skipped,
    succeeded,
    failed,
    skipped,
    session_expired: sessionExpired,
    results,
  };

  // Write summary JSON
  writeSummary(summary);

  // Print final summary
  const durationSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(0);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Nightly Upload Summary — ${dateStr}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Duration:  ${durationSec}s`);
  console.log(`  Queued:    ${videos.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Session:   ${sessionExpired ? 'EXPIRED' : 'valid'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Exit code
  if (sessionExpired) {
    process.exit(EXIT_SESSION_INVALID);
  } else if (failed > 0) {
    process.exit(EXIT_ERROR);
  } else {
    process.exit(EXIT_OK);
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(EXIT_ERROR);
});
