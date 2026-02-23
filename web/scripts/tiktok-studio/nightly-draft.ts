#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Nightly Draft — CLI orchestrator
 *
 * Fetches READY_TO_POST videos from Supabase, spawns upload-from-pack.ts per
 * video, and writes a JSON report. Saves as drafts only — never posts.
 *
 * Exit codes:
 *   0  = all videos drafted (or queue empty)
 *   1  = some videos failed
 *   42 = session invalid — needs manual bootstrap
 *
 * Env vars:
 *   MAX_NIGHTLY_UPLOADS    — max videos per run (default: 3)
 *   DRY_RUN                — '1' to skip actual uploads
 *   SUPABASE_URL           — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *
 * Usage:
 *   npm run tiktok:nightly-draft
 *   DRY_RUN=1 npm run tiktok:nightly-draft
 *   MAX_NIGHTLY_UPLOADS=1 npm run tiktok:nightly-draft
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { atomicClaimVideo, atomicReleaseVideo } from '../../lib/video-claim.js';
import { createLogger } from '../../lib/logger.js';
import {
  EXIT_SESSION_INVALID,
  isSessionCooldownActive,
} from '../../lib/tiktok/session.js';
import { logUploadStep } from '../../lib/uploader-status.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const log = createLogger('nightly-draft');
const TAG = '[nightly-draft]';
const EXIT_OK = 0;
const EXIT_ERROR = 1;

const MAX_UPLOADS = Number(process.env.MAX_NIGHTLY_UPLOADS) || 3;
const DRY_RUN = process.env.DRY_RUN === '1';

const WEB_DIR = process.cwd();
const LOG_DIR = path.join(WEB_DIR, 'data', 'sessions', 'logs');

const ACTOR = `nightly_draft_job/${os.hostname()}`;
const CLAIM_TTL_MINUTES = 30; // 5-min upload timeout + buffer

// ─── Supabase client ────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`);
  process.exit(EXIT_ERROR);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Pre-flight session health check ────────────────────────────────────────

async function preflightSessionCheck(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/tiktok/session-health', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const health = await res.json();
      if (!health.valid) {
        console.error(`${TAG} [preflight] Session unhealthy: valid=${health.valid}, cooldown=${health.cooldown_active}`);
        return false;
      }
      console.log(`${TAG} [preflight] Session healthy (expires in ${health.expires_in_hours}h)`);
    }
  } catch {
    // Server not running — fall back to local cooldown check
    if (isSessionCooldownActive()) return false;
  }
  return true;
}

// ─── Fetch eligible videos ──────────────────────────────────────────────────

interface VideoRow {
  id: string;
  recording_status: string;
  final_video_url: string;
  last_status_changed_at: string | null;
}

async function fetchEligibleVideos(): Promise<VideoRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('videos')
    .select('id, recording_status, final_video_url, last_status_changed_at')
    .eq('recording_status', 'READY_TO_POST')
    .eq('status', 'ready_to_post')  // Pipeline status must also match (API validates this)
    .not('final_video_url', 'is', null)
    .is('nightly_draft_attempted_at', null)
    .or(`claimed_by.is.null,claim_expires_at.lt.${now}`)  // Not actively claimed
    .order('last_status_changed_at', { ascending: true })
    .limit(MAX_UPLOADS);

  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  return data || [];
}

// ─── Stamp attempted_at ─────────────────────────────────────────────────────

async function stampAttempted(videoId: string): Promise<void> {
  const { error } = await supabase
    .from('videos')
    .update({ nightly_draft_attempted_at: new Date().toISOString() })
    .eq('id', videoId);

  if (error) {
    throw new Error(`Failed to stamp nightly_draft_attempted_at: ${error.message}`);
  }
}

// ─── Spawn upload-from-pack.ts ──────────────────────────────────────────────

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function spawnUpload(videoId: string): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(WEB_DIR, 'scripts', 'tiktok-studio', 'upload-from-pack.ts');
    const args = ['tsx', scriptPath, '--video-id', videoId, '--mode', 'draft'];

    execFile('npx', args, {
      cwd: WEB_DIR,
      timeout: 5 * 60 * 1000, // 5 minute timeout per video
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      let exitCode = 0;
      if (error) {
        exitCode = typeof error.code === 'number' ? error.code : EXIT_ERROR;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// ─── Report types ───────────────────────────────────────────────────────────

interface VideoReport {
  video_id: string;
  status: 'drafted' | 'failed' | 'skipped' | 'claim_skipped';
  error?: string;
  reason?: string;
  duration_ms: number;
}

interface NightlyReport {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  max_uploads: number;
  dry_run: boolean;
  videos: VideoReport[];
  summary: {
    eligible: number;
    claimed: number;
    claim_skipped: number;
    attempted: number;
    drafted: number;
    failed: number;
    skipped: number;
    exit_code: number;
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const correlationId = `nightly-draft-${startedAt.toISOString()}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TikTok Nightly Draft — ${startedAt.toISOString().slice(0, 10)}`);
  console.log(`${'='.repeat(60)}\n`);
  log.info('run_started', { actor: ACTOR, max_uploads: MAX_UPLOADS, dry_run: DRY_RUN });
  console.log(`${TAG} Actor:       ${ACTOR}`);
  console.log(`${TAG} Max uploads: ${MAX_UPLOADS}`);
  console.log(`${TAG} Dry run:     ${DRY_RUN}`);
  console.log('');

  // Preflight: check session health (API first, local cooldown fallback)
  if (!DRY_RUN) {
    const healthy = await preflightSessionCheck();
    if (!healthy) {
      process.exit(EXIT_SESSION_INVALID);
    }
  }

  // Fetch eligible videos
  console.log(`${TAG} Querying Supabase for READY_TO_POST videos...`);
  const videos = await fetchEligibleVideos();

  if (videos.length === 0) {
    console.log(`${TAG} No eligible videos found. Nothing to do.`);
    const report: NightlyReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      max_uploads: MAX_UPLOADS,
      dry_run: DRY_RUN,
      videos: [],
      summary: {
        eligible: 0, claimed: 0, claim_skipped: 0,
        attempted: 0, drafted: 0, failed: 0, skipped: 0, exit_code: 0,
      },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  console.log(`${TAG} Found ${videos.length} eligible video(s):\n`);
  for (const v of videos) {
    console.log(`  - ${v.id} (status_changed: ${v.last_status_changed_at || 'unknown'})`);
  }
  console.log('');

  // DRY_RUN: log what would happen and exit
  if (DRY_RUN) {
    console.log(`${TAG} DRY RUN — would claim & upload ${videos.length} video(s) as draft.`);
    const report: NightlyReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      max_uploads: MAX_UPLOADS,
      dry_run: true,
      videos: videos.map((v) => ({
        video_id: v.id,
        status: 'skipped' as const,
        reason: 'dry_run',
        duration_ms: 0,
      })),
      summary: {
        eligible: videos.length, claimed: 0, claim_skipped: 0,
        attempted: 0, drafted: 0, failed: 0, skipped: videos.length, exit_code: 0,
      },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  // ── Claim phase: atomically claim all eligible videos ─────────────────

  const videoReports: VideoReport[] = [];
  const claimedVideoIds: string[] = [];  // Track for finally-block cleanup
  const processedVideoIds = new Set<string>();  // Track which claims we've resolved

  console.log(`${TAG} Claiming ${videos.length} video(s) with actor=${ACTOR}...`);

  for (const video of videos) {
    const claimResult = await atomicClaimVideo(supabase, {
      video_id: video.id,
      actor: ACTOR,
      claim_role: 'uploader',
      ttl_minutes: CLAIM_TTL_MINUTES,
      correlation_id: correlationId,
    });

    if (claimResult.ok) {
      claimedVideoIds.push(video.id);
      console.log(`${TAG}   ✓ Claimed ${video.id}`);
      await logUploadStep(supabase, {
        video_id: video.id, from: 'queued', to: 'claimed', step: 'claim',
        actor: ACTOR, correlation_id: correlationId,
      });
    } else {
      console.log(`${TAG}   ✗ Skipped ${video.id} (${claimResult.action}: ${claimResult.message})`);
      videoReports.push({
        video_id: video.id,
        status: 'claim_skipped',
        reason: `${claimResult.action}: ${claimResult.message}`,
        duration_ms: 0,
      });
    }
  }

  const claimSkipped = videos.length - claimedVideoIds.length;
  console.log(`${TAG} Claimed ${claimedVideoIds.length}/${videos.length} (${claimSkipped} skipped)\n`);

  if (claimedVideoIds.length === 0) {
    console.log(`${TAG} No videos claimed. Nothing to process.`);
    const report: NightlyReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      max_uploads: MAX_UPLOADS,
      dry_run: false,
      videos: videoReports,
      summary: {
        eligible: videos.length, claimed: 0, claim_skipped: claimSkipped,
        attempted: 0, drafted: 0, failed: 0, skipped: 0, exit_code: 0,
      },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  // ── Process phase: upload each claimed video ──────────────────────────

  let finalExitCode = EXIT_OK;

  try {
    for (let i = 0; i < claimedVideoIds.length; i++) {
      const videoId = claimedVideoIds[i];
      const num = `[${i + 1}/${claimedVideoIds.length}]`;

      console.log(`\n${'─'.repeat(50)}`);
      console.log(`${TAG} ${num} Processing ${videoId}`);
      console.log(`${'─'.repeat(50)}`);

      const videoStart = Date.now();

      // Spawn upload-from-pack.ts
      console.log(`${TAG} ${num} Spawning upload-from-pack.ts --video-id ${videoId} --mode draft`);
      await logUploadStep(supabase, {
        video_id: videoId, from: 'claimed', to: 'uploading', step: 'spawn',
        actor: ACTOR, correlation_id: correlationId,
      });
      const result = await spawnUpload(videoId);

      const durationMs = Date.now() - videoStart;
      console.log(`${TAG} ${num} Exit code: ${result.exitCode} (${durationMs}ms)`);

      // Log child stdout (last 20 lines to avoid noise)
      if (result.stdout) {
        const lines = result.stdout.trim().split('\n');
        const tail = lines.slice(-20);
        if (lines.length > 20) console.log(`${TAG} ${num} ... (${lines.length - 20} lines truncated)`);
        for (const line of tail) {
          console.log(`${TAG} ${num} | ${line}`);
        }
      }

      if (result.exitCode === EXIT_SESSION_INVALID) {
        // ── Exit 42: release this claim + remaining, stop loop ──
        console.error(`${TAG} ${num} SESSION INVALID (exit 42). Stopping loop.`);
        await logUploadStep(supabase, {
          video_id: videoId, from: 'uploading', to: 'failed', step: 'session_invalid',
          actor: ACTOR, correlation_id: correlationId, error: 'session_invalid',
        });

        // Release this video's claim (failed, should be retryable)
        await atomicReleaseVideo(supabase, {
          video_id: videoId, actor: ACTOR, correlation_id: correlationId,
        });
        processedVideoIds.add(videoId);

        videoReports.push({
          video_id: videoId,
          status: 'failed',
          error: 'session_invalid',
          duration_ms: durationMs,
        });

        // Mark remaining claimed videos as skipped and release their claims
        for (let j = i + 1; j < claimedVideoIds.length; j++) {
          const remainingId = claimedVideoIds[j];
          await atomicReleaseVideo(supabase, {
            video_id: remainingId, actor: ACTOR, correlation_id: correlationId,
          });
          processedVideoIds.add(remainingId);
          videoReports.push({
            video_id: remainingId,
            status: 'skipped',
            reason: 'session_invalid',
            duration_ms: 0,
          });
        }

        finalExitCode = EXIT_SESSION_INVALID;
        break;
      }

      if (result.exitCode === EXIT_OK) {
        // ── Success: stamp attempted_at, write event, release claim ──
        log.info('video_drafted', { video_id: videoId, duration_ms: durationMs });
        console.log(`${TAG} ${num} Draft saved successfully.`);
        await stampAttempted(videoId);
        console.log(`${TAG} ${num} Stamped nightly_draft_attempted_at`);
        await logUploadStep(supabase, {
          video_id: videoId, from: 'uploading', to: 'drafted', step: 'draft_saved',
          actor: ACTOR, correlation_id: correlationId, meta: { duration_ms: durationMs },
        });
        await atomicReleaseVideo(supabase, {
          video_id: videoId, actor: ACTOR, correlation_id: correlationId,
        });
        processedVideoIds.add(videoId);
        videoReports.push({
          video_id: videoId,
          status: 'drafted',
          duration_ms: durationMs,
        });
      } else {
        // ── Failure: release claim (no stamp — allows retry) ──
        log.error('video_failed', { video_id: videoId, exit_code: result.exitCode, duration_ms: durationMs });
        console.error(`${TAG} ${num} Upload failed (exit ${result.exitCode}).`);
        await logUploadStep(supabase, {
          video_id: videoId, from: 'uploading', to: 'failed', step: 'upload_failed',
          actor: ACTOR, correlation_id: correlationId,
          error: `exit_code_${result.exitCode}`, meta: { duration_ms: durationMs },
        });
        if (result.stderr) {
          const stderrTail = result.stderr.trim().split('\n').slice(-5);
          for (const line of stderrTail) {
            console.error(`${TAG} ${num} ERR: ${line}`);
          }
        }
        await atomicReleaseVideo(supabase, {
          video_id: videoId, actor: ACTOR, correlation_id: correlationId,
        });
        processedVideoIds.add(videoId);
        videoReports.push({
          video_id: videoId,
          status: 'failed',
          error: result.stderr?.trim().split('\n').pop() || `exit_code_${result.exitCode}`,
          duration_ms: durationMs,
        });
        finalExitCode = EXIT_ERROR;
      }
    }
  } finally {
    // ── Cleanup: release any claims not yet resolved (crash safety) ──────
    for (const videoId of claimedVideoIds) {
      if (!processedVideoIds.has(videoId)) {
        console.log(`${TAG} Releasing orphaned claim for ${videoId}`);
        await atomicReleaseVideo(supabase, {
          video_id: videoId, actor: ACTOR, correlation_id: correlationId,
        });
      }
    }
  }

  // ── Write report ────────────────────────────────────────────────────────

  const finishedAt = new Date();
  const drafted = videoReports.filter((r) => r.status === 'drafted').length;
  const failed = videoReports.filter((r) => r.status === 'failed').length;
  const skipped = videoReports.filter((r) => r.status === 'skipped').length;
  const claimSkippedCount = videoReports.filter((r) => r.status === 'claim_skipped').length;

  const report: NightlyReport = {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    max_uploads: MAX_UPLOADS,
    dry_run: false,
    videos: videoReports,
    summary: {
      eligible: videos.length,
      claimed: claimedVideoIds.length,
      claim_skipped: claimSkippedCount,
      attempted: drafted + failed,
      drafted,
      failed,
      skipped,
      exit_code: finalExitCode,
    },
  };

  writeReport(report);

  log.info('run_completed', { drafted, failed, skipped, claimed: claimedVideoIds.length, duration_ms: report.duration_ms });
  log.metric('drafted', drafted);
  log.metric('failed', failed);
  log.metric('duration_ms', report.duration_ms);

  // ── Print summary ───────────────────────────────────────────────────────

  const durationSec = (report.duration_ms / 1000).toFixed(0);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Nightly Draft Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Duration:      ${durationSec}s`);
  console.log(`  Eligible:      ${videos.length}`);
  console.log(`  Claimed:       ${claimedVideoIds.length}`);
  console.log(`  Claim skipped: ${claimSkippedCount}`);
  console.log(`  Attempted:     ${report.summary.attempted}`);
  console.log(`  Drafted:       ${drafted}`);
  console.log(`  Failed:        ${failed}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Exit code:     ${finalExitCode}`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(finalExitCode);
}

// ─── Write report JSON ──────────────────────────────────────────────────────

function writeReport(report: NightlyReport): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(LOG_DIR, `nightly-${ts}.json`);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`${TAG} Report written → ${filepath}`);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(EXIT_ERROR);
});
