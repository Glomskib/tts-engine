/**
 * Centralized TikTok session helpers.
 *
 * Consolidates cooldown lockfile logic, storage-state age checks, and
 * profile-exists checks that were previously duplicated across
 * upload-from-pack.ts, nightly-draft.ts, check-session.ts, and browser.ts.
 *
 * Pure Node fs/path — no Playwright, no Supabase imports.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Exit code 42 = "needs manual login" — distinct from generic error (1). */
export const EXIT_SESSION_INVALID = 42;

// ─── Paths (mirror CONFIG from skills/tiktok-studio-uploader/types.ts) ──────

const _sessionsDir =
  process.env.TIKTOK_SESSIONS_DIR ||
  path.join(process.cwd(), 'data', 'sessions');

const COOLDOWN_LOCKFILE = path.join(_sessionsDir, '.session-invalid.lock');

const STORAGE_STATE_PATH =
  process.env.TIKTOK_STORAGE_STATE ||
  path.join(_sessionsDir, 'tiktok-studio.storageState.json');

const PROFILE_DIR =
  process.env.TIKTOK_BROWSER_PROFILE ||
  path.join(_sessionsDir, 'tiktok-studio-profile');

const COOLDOWN_HOURS = Number(process.env.SESSION_INVALID_COOLDOWN_HOURS) || 6;

// ─── Cooldown ────────────────────────────────────────────────────────────────

/** Returns true if cooldown is active (session-invalid reported recently). */
export function isSessionCooldownActive(): boolean {
  try {
    const stat = fs.statSync(COOLDOWN_LOCKFILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const cooldownMs = COOLDOWN_HOURS * 3_600_000;
    if (ageMs < cooldownMs) {
      const hoursAgo = (ageMs / 3_600_000).toFixed(1);
      console.error(
        `[session-guard] Session-invalid cooldown active (reported ${hoursAgo}h ago, ` +
        `window=${COOLDOWN_HOURS}h). Exiting silently.`,
      );
      return true;
    }
    // Lockfile expired — allow re-report
    fs.unlinkSync(COOLDOWN_LOCKFILE);
  } catch {
    // No lockfile = no cooldown
  }
  return false;
}

/** Write the cooldown lockfile after emitting the first session-invalid event. */
export function setSessionCooldown(): void {
  try {
    fs.mkdirSync(path.dirname(COOLDOWN_LOCKFILE), { recursive: true });
    fs.writeFileSync(COOLDOWN_LOCKFILE, new Date().toISOString() + '\n');
  } catch (err: any) {
    console.error(`[session-guard] Failed to write cooldown lockfile: ${err.message}`);
  }
}

/** Remove the cooldown lockfile (e.g. after a successful session check). */
export function clearSessionCooldown(): void {
  try {
    fs.unlinkSync(COOLDOWN_LOCKFILE);
  } catch {
    // Doesn't exist — nothing to clear
  }
}

// ─── Health helpers ──────────────────────────────────────────────────────────

export interface CooldownInfo {
  active: boolean;
  reported_hours_ago: number | null;
  window_hours: number;
}

/** Get cooldown lockfile info without side-effects (no log, no delete). */
export function getCooldownInfo(): CooldownInfo {
  try {
    const stat = fs.statSync(COOLDOWN_LOCKFILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;
    const cooldownMs = COOLDOWN_HOURS * 3_600_000;
    return {
      active: ageMs < cooldownMs,
      reported_hours_ago: ageHours,
      window_hours: COOLDOWN_HOURS,
    };
  } catch {
    return { active: false, reported_hours_ago: null, window_hours: COOLDOWN_HOURS };
  }
}

export interface StorageStateAge {
  exists: boolean;
  age_hours: number | null;
  path: string;
}

/** Check storageState JSON freshness. */
export function getStorageStateAge(): StorageStateAge {
  try {
    const stat = fs.statSync(STORAGE_STATE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;
    return { exists: true, age_hours: ageHours, path: STORAGE_STATE_PATH };
  } catch {
    return { exists: false, age_hours: null, path: STORAGE_STATE_PATH };
  }
}

/** Check whether the persistent Chromium profile directory exists. */
export function profileExists(): boolean {
  return fs.existsSync(PROFILE_DIR);
}

// ─── Composite health check ─────────────────────────────────────────────────

export interface LocalSessionHealth {
  profile_exists: boolean;
  storage_state_age_hours: number | null;
  cooldown_active: boolean;
  cooldown_reported_hours_ago: number | null;
}

/** Aggregate local session health for the API endpoint. */
export function getLocalSessionHealth(): LocalSessionHealth {
  const cd = getCooldownInfo();
  const ss = getStorageStateAge();
  return {
    profile_exists: profileExists(),
    storage_state_age_hours: ss.age_hours,
    cooldown_active: cd.active,
    cooldown_reported_hours_ago: cd.reported_hours_ago,
  };
}
