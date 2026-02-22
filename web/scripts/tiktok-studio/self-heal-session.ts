#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Self-Healing Session Handler
 *
 * Detects exit-42 session failures from the most recent nightly report,
 * respects a cooldown lockfile, and automatically runs bootstrap + healthcheck
 * to recover the session.
 *
 * Exit codes:
 *   0  = no action needed OR recovery successful
 *   1  = bootstrap or healthcheck failed
 *
 * Usage:
 *   pnpm run tiktok:selfheal
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

// ─── Constants ──────────────────────────────────────────────────────────────

const TAG = '[self-heal]';
const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_SESSION_INVALID = 42;

const WEB_DIR = process.cwd();
const LOG_DIR = path.join(WEB_DIR, 'data', 'sessions', 'logs');
const COOLDOWN_LOCKFILE = path.join(WEB_DIR, 'data', 'sessions', '.session-invalid.lock');
const COOLDOWN_HOURS = Number(process.env.SESSION_INVALID_COOLDOWN_HOURS) || 6;

// ─── Find most recent nightly report ────────────────────────────────────────

function findLatestNightlyReport(): { filepath: string; data: any } | null {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('nightly-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const filepath = path.join(LOG_DIR, files[0]);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return { filepath, data };
  } catch {
    return null;
  }
}

// ─── Lockfile helpers ───────────────────────────────────────────────────────

function getLockfileAgeHours(): number | null {
  try {
    const stat = fs.statSync(COOLDOWN_LOCKFILE);
    return (Date.now() - stat.mtimeMs) / 3_600_000;
  } catch {
    return null; // No lockfile
  }
}

function deleteLockfile(): void {
  try {
    fs.unlinkSync(COOLDOWN_LOCKFILE);
    console.log(`${TAG} Lockfile deleted.`);
  } catch {
    // Already gone
  }
}

// ─── Spawn helper ───────────────────────────────────────────────────────────

function spawnScript(npmScript: string): Promise<number> {
  return new Promise((resolve) => {
    console.log(`${TAG} Running: pnpm run ${npmScript}`);

    const child = execFile('pnpm', ['run', npmScript], {
      cwd: WEB_DIR,
      timeout: 10 * 60 * 1000, // 10 minute timeout
      env: { ...process.env },
      stdio: 'inherit' as any,
    }, (error) => {
      if (error) {
        const code = typeof error.code === 'number' ? error.code : EXIT_ERROR;
        resolve(code);
      } else {
        resolve(EXIT_OK);
      }
    });

    // Inherit stdio so user can interact with headed browser
    if (child.stdout) child.stdout.pipe(process.stdout);
    if (child.stderr) child.stderr.pipe(process.stderr);
  });
}

// ─── Write recovery log ─────────────────────────────────────────────────────

interface RecoveryLog {
  started_at: string;
  trigger: string;
  lockfile_age_h: number | null;
  bootstrap_exit: number | null;
  healthcheck_exit: number | null;
  recovered: boolean;
  finished_at: string;
}

function writeRecoveryLog(log: RecoveryLog): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(LOG_DIR, `self-heal-${ts}.json`);
  fs.writeFileSync(filepath, JSON.stringify(log, null, 2));
  console.log(`${TAG} Recovery log written → ${filepath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  TikTok Self-Healing Session Handler`);
  console.log(`${'='.repeat(50)}\n`);

  // Step 1: Check the most recent nightly report for exit 42
  const report = findLatestNightlyReport();

  if (!report) {
    console.log(`${TAG} No nightly reports found in ${LOG_DIR}`);
    console.log(`${TAG} No session failure detected.`);
    process.exit(EXIT_OK);
  }

  const exitCode = report.data?.summary?.exit_code;
  console.log(`${TAG} Latest report: ${path.basename(report.filepath)}`);
  console.log(`${TAG} Exit code: ${exitCode}`);

  if (exitCode !== EXIT_SESSION_INVALID) {
    console.log(`${TAG} No session failure detected (exit code ${exitCode} !== 42).`);
    process.exit(EXIT_OK);
  }

  console.log(`${TAG} Session failure detected (exit 42).`);

  // Step 2: Check cooldown lockfile
  const lockfileAgeH = getLockfileAgeHours();

  if (lockfileAgeH !== null && lockfileAgeH < COOLDOWN_HOURS) {
    const remaining = (COOLDOWN_HOURS - lockfileAgeH).toFixed(1);
    console.log(`${TAG} Cooldown active (${remaining}h remaining). Skipping recovery.`);
    process.exit(EXIT_OK);
  }

  if (lockfileAgeH !== null) {
    console.log(`${TAG} Lockfile expired (${lockfileAgeH.toFixed(1)}h old). Proceeding with recovery.`);
  } else {
    console.log(`${TAG} No lockfile found. Proceeding with recovery.`);
  }

  // Step 3: Run bootstrap
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${TAG} Starting bootstrap...`);
  console.log(`${'─'.repeat(50)}\n`);

  const bootstrapExit = await spawnScript('tiktok:bootstrap');
  console.log(`\n${TAG} Bootstrap exit code: ${bootstrapExit}`);

  if (bootstrapExit !== EXIT_OK) {
    console.error(`${TAG} Bootstrap failed (exit ${bootstrapExit}). Lockfile NOT cleared.`);

    writeRecoveryLog({
      started_at: startedAt.toISOString(),
      trigger: 'exit_42',
      lockfile_age_h: lockfileAgeH,
      bootstrap_exit: bootstrapExit,
      healthcheck_exit: null,
      recovered: false,
      finished_at: new Date().toISOString(),
    });

    process.exit(EXIT_ERROR);
  }

  // Bootstrap succeeded — delete lockfile
  console.log(`${TAG} Bootstrap succeeded. Clearing lockfile.`);
  deleteLockfile();

  // Step 4: Run healthcheck as verification
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${TAG} Running healthcheck verification...`);
  console.log(`${'─'.repeat(50)}\n`);

  const healthcheckExit = await spawnScript('tiktok:healthcheck');
  console.log(`\n${TAG} Healthcheck exit code: ${healthcheckExit}`);

  const recovered = healthcheckExit === EXIT_OK;

  writeRecoveryLog({
    started_at: startedAt.toISOString(),
    trigger: 'exit_42',
    lockfile_age_h: lockfileAgeH,
    bootstrap_exit: bootstrapExit,
    healthcheck_exit: healthcheckExit,
    recovered,
    finished_at: new Date().toISOString(),
  });

  if (!recovered) {
    console.error(`${TAG} Healthcheck failed after bootstrap. Session may still be invalid.`);
    process.exit(EXIT_ERROR);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Session recovered successfully!`);
  console.log(`${'='.repeat(50)}\n`);

  process.exit(EXIT_OK);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(EXIT_ERROR);
});
