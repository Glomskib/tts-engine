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
import * as path from 'path';
import { execFile } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TAG = '[nightly-draft]';
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_SESSION_INVALID = 42;

const MAX_UPLOADS = Number(process.env.MAX_NIGHTLY_UPLOADS) || 3;
const DRY_RUN = process.env.DRY_RUN === '1';

const WEB_DIR = process.cwd();
const LOG_DIR = path.join(WEB_DIR, 'data', 'sessions', 'logs');
const COOLDOWN_LOCKFILE = path.join(WEB_DIR, 'data', 'sessions', '.session-invalid.lock');
const COOLDOWN_HOURS = Number(process.env.SESSION_INVALID_COOLDOWN_HOURS) || 6;

// ─── Supabase client ────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`);
  process.exit(EXIT_ERROR);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Session cooldown ───────────────────────────────────────────────────────

function isSessionCooldownActive(): boolean {
  try {
    const stat = fs.statSync(COOLDOWN_LOCKFILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const cooldownMs = COOLDOWN_HOURS * 3_600_000;
    if (ageMs < cooldownMs) {
      const hoursAgo = (ageMs / 3_600_000).toFixed(1);
      console.error(
        `${TAG} Session-invalid cooldown active (reported ${hoursAgo}h ago, ` +
        `window=${COOLDOWN_HOURS}h). Exiting.`,
      );
      return true;
    }
    fs.unlinkSync(COOLDOWN_LOCKFILE);
  } catch {
    // No lockfile = no cooldown
  }
  return false;
}

// ─── Fetch eligible videos ──────────────────────────────────────────────────

interface VideoRow {
  id: string;
  recording_status: string;
  final_video_url: string;
  last_status_changed_at: string | null;
}

async function fetchEligibleVideos(): Promise<VideoRow[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, recording_status, final_video_url, last_status_changed_at')
    .eq('recording_status', 'READY_TO_POST')
    .not('final_video_url', 'is', null)
    .is('nightly_draft_attempted_at', null)
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

// ─── Write video_events row ─────────────────────────────────────────────────

async function writeVideoEvent(videoId: string): Promise<void> {
  const { error } = await supabase.from('video_events').insert({
    video_id: videoId,
    event_type: 'nightly_draft_uploaded',
    actor: 'nightly_draft_job',
    from_status: 'READY_TO_POST',
    to_status: 'READY_TO_POST',
    details: { source: 'nightly-draft.ts' },
  });

  if (error) {
    console.error(`${TAG} Failed to write video_event for ${videoId}: ${error.message}`);
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
  status: 'drafted' | 'failed' | 'skipped';
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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TikTok Nightly Draft — ${startedAt.toISOString().slice(0, 10)}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`${TAG} Max uploads: ${MAX_UPLOADS}`);
  console.log(`${TAG} Dry run:     ${DRY_RUN}`);
  console.log('');

  // Preflight: check session cooldown
  if (!DRY_RUN && isSessionCooldownActive()) {
    process.exit(EXIT_SESSION_INVALID);
  }

  // Fetch eligible videos
  console.log(`${TAG} Querying Supabase for READY_TO_POST videos...`);
  const videos = await fetchEligibleVideos();

  if (videos.length === 0) {
    console.log(`${TAG} No eligible videos found. Nothing to do.`);
    // Write empty report
    const report: NightlyReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      max_uploads: MAX_UPLOADS,
      dry_run: DRY_RUN,
      videos: [],
      summary: { attempted: 0, drafted: 0, failed: 0, skipped: 0, exit_code: 0 },
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
    console.log(`${TAG} DRY RUN — would upload ${videos.length} video(s) as draft.`);
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
        attempted: 0,
        drafted: 0,
        failed: 0,
        skipped: videos.length,
        exit_code: 0,
      },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  // ── Process each video ──────────────────────────────────────────────────

  const videoReports: VideoReport[] = [];
  let finalExitCode = EXIT_OK;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const num = `[${i + 1}/${videos.length}]`;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${TAG} ${num} Processing ${video.id}`);
    console.log(`${'─'.repeat(50)}`);

    const videoStart = Date.now();

    // Stamp attempted_at BEFORE upload (idempotency guard)
    try {
      await stampAttempted(video.id);
      console.log(`${TAG} ${num} Stamped nightly_draft_attempted_at`);
    } catch (err: any) {
      console.error(`${TAG} ${num} Failed to stamp: ${err.message}`);
      videoReports.push({
        video_id: video.id,
        status: 'failed',
        error: `stamp_failed: ${err.message}`,
        duration_ms: Date.now() - videoStart,
      });
      continue;
    }

    // Spawn upload-from-pack.ts
    console.log(`${TAG} ${num} Spawning upload-from-pack.ts --video-id ${video.id} --mode draft`);
    const result = await spawnUpload(video.id);

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
      // ── Exit 42: stop loop, mark remaining as skipped ──
      console.error(`${TAG} ${num} SESSION INVALID (exit 42). Stopping loop.`);
      videoReports.push({
        video_id: video.id,
        status: 'failed',
        error: 'session_invalid',
        duration_ms: durationMs,
      });

      // Mark remaining videos as skipped
      for (let j = i + 1; j < videos.length; j++) {
        videoReports.push({
          video_id: videos[j].id,
          status: 'skipped',
          reason: 'session_invalid',
          duration_ms: 0,
        });
      }

      finalExitCode = EXIT_SESSION_INVALID;
      break;
    }

    if (result.exitCode === EXIT_OK) {
      // ── Success: write video_events row ──
      console.log(`${TAG} ${num} Draft saved successfully.`);
      await writeVideoEvent(video.id);
      videoReports.push({
        video_id: video.id,
        status: 'drafted',
        duration_ms: durationMs,
      });
    } else {
      // ── Exit 1: log error, continue to next video ──
      console.error(`${TAG} ${num} Upload failed (exit ${result.exitCode}).`);
      if (result.stderr) {
        const stderrTail = result.stderr.trim().split('\n').slice(-5);
        for (const line of stderrTail) {
          console.error(`${TAG} ${num} ERR: ${line}`);
        }
      }
      videoReports.push({
        video_id: video.id,
        status: 'failed',
        error: result.stderr?.trim().split('\n').pop() || `exit_code_${result.exitCode}`,
        duration_ms: durationMs,
      });
      finalExitCode = EXIT_ERROR;
    }
  }

  // ── Write report ────────────────────────────────────────────────────────

  const finishedAt = new Date();
  const drafted = videoReports.filter((r) => r.status === 'drafted').length;
  const failed = videoReports.filter((r) => r.status === 'failed').length;
  const skipped = videoReports.filter((r) => r.status === 'skipped').length;

  const report: NightlyReport = {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    max_uploads: MAX_UPLOADS,
    dry_run: false,
    videos: videoReports,
    summary: {
      attempted: videoReports.length - skipped,
      drafted,
      failed,
      skipped,
      exit_code: finalExitCode,
    },
  };

  writeReport(report);

  // ── Print summary ───────────────────────────────────────────────────────

  const durationSec = (report.duration_ms / 1000).toFixed(0);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Nightly Draft Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Duration:  ${durationSec}s`);
  console.log(`  Attempted: ${report.summary.attempted}`);
  console.log(`  Drafted:   ${drafted}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Exit code: ${finalExitCode}`);
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
