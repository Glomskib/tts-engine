/**
 * Revenue Intelligence – File-based Run Lock
 *
 * Prevents overlapping ingestion runs (daemon + manual).
 * Uses a .lock file with a timestamp; expires after LOCK_TTL_MS.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const TAG = '[ri:run-lock]';
const LOCK_FILE = join(process.cwd(), '.ri-ingestion.lock');
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface LockData {
  pid: number;
  startedAt: string;
  expiresAt: string;
}

/** Try to acquire the run lock. Returns true if acquired, false if another run is active. */
export function acquireRunLock(): boolean {
  // Check existing lock
  if (existsSync(LOCK_FILE)) {
    try {
      const raw = readFileSync(LOCK_FILE, 'utf-8');
      const lock: LockData = JSON.parse(raw);
      const expiresAt = new Date(lock.expiresAt).getTime();

      if (Date.now() < expiresAt) {
        // Lock is still valid — check if the process is still running
        const isAlive = isPidAlive(lock.pid);
        if (isAlive) {
          console.error(
            `${TAG} Another ingestion run is active (pid=${lock.pid}, started=${lock.startedAt}). Exiting.`,
          );
          return false;
        }
        // Process is dead but lock hasn't expired — stale lock, take over
        console.warn(`${TAG} Stale lock found (pid=${lock.pid} is dead). Taking over.`);
      } else {
        console.warn(`${TAG} Expired lock found (expired=${lock.expiresAt}). Taking over.`);
      }
    } catch {
      // Corrupt lock file — remove and proceed
      console.warn(`${TAG} Corrupt lock file — removing.`);
    }
  }

  // Write new lock
  const now = new Date();
  const lockData: LockData = {
    pid: process.pid,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOCK_TTL_MS).toISOString(),
  };

  try {
    writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
    console.log(`${TAG} Lock acquired (pid=${process.pid})`);
    return true;
  } catch (err) {
    console.error(`${TAG} Failed to write lock file:`, err);
    return false;
  }
}

/** Release the run lock (only if we own it). */
export function releaseRunLock(): void {
  if (!existsSync(LOCK_FILE)) return;

  try {
    const raw = readFileSync(LOCK_FILE, 'utf-8');
    const lock: LockData = JSON.parse(raw);

    // Only release if we own the lock
    if (lock.pid === process.pid) {
      unlinkSync(LOCK_FILE);
      console.log(`${TAG} Lock released`);
    }
  } catch {
    // Best effort — don't crash
  }
}

function isPidAlive(pid: number): boolean {
  try {
    // signal 0 doesn't kill — just checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
