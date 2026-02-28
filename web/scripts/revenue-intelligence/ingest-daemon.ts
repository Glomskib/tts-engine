#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * Revenue Intelligence – Ingestion Daemon
 *
 * Loops: run ingestion → sleep 10min ± jitter (0-120s) → repeat.
 * Spawns `npm run ri:ingest` as a child process per iteration.
 *
 * Usage:
 *   pnpm run ri:ingest:daemon
 *   pnpm run ri:ingest:daemon -- --sim   # pass --simulate to each run
 *
 * Logs are appended to logs/ri-daemon.log with timestamps.
 * Graceful shutdown on SIGINT/SIGTERM.
 */

import { execSync, spawn } from 'child_process';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const TAG = '[ri:daemon]';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const JITTER_MAX_MS = 120 * 1000;   // 0-120 seconds
const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'ri-daemon.log');

let running = true;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // ignore log write failures
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Allow process to exit during sleep
    const check = setInterval(() => {
      if (!running) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });
}

function runIngestion(extraArgs: string[]): Promise<number> {
  return new Promise((resolve) => {
    const args = ['run', 'ri:ingest', '--', ...extraArgs];
    log(`${TAG} Spawning: npm ${args.join(' ')}`);

    const child = spawn('npm', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        log(`  ${line}`);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        log(`  [err] ${line}`);
      }
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      log(`${TAG} Spawn error: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  // Ensure log directory exists
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  // Forward extra CLI args to the ingestion command
  const extraArgs = process.argv.slice(2);

  log(`${TAG} Daemon started. Interval: ${INTERVAL_MS / 1000}s, jitter: 0-${JITTER_MAX_MS / 1000}s`);
  if (extraArgs.length > 0) {
    log(`${TAG} Extra args: ${extraArgs.join(' ')}`);
  }

  // Graceful shutdown
  const shutdown = () => {
    log(`${TAG} Shutdown signal received — stopping after current iteration`);
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  let iteration = 0;
  while (running) {
    iteration++;
    log(`\n${TAG} === Iteration ${iteration} ===`);

    const code = await runIngestion(extraArgs);
    log(`${TAG} Ingestion exited with code ${code}`);

    if (!running) break;

    const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
    const sleepMs = INTERVAL_MS + jitter;
    log(`${TAG} Sleeping ${(sleepMs / 1000).toFixed(0)}s (${(INTERVAL_MS / 1000).toFixed(0)}s + ${(jitter / 1000).toFixed(0)}s jitter)`);
    await sleep(sleepMs);
  }

  log(`${TAG} Daemon stopped.`);
}

main().catch((err) => {
  log(`${TAG} Fatal: ${err}`);
  process.exit(1);
});
