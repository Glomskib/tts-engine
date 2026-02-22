/**
 * Types and configuration for TikTok Studio browser automation.
 */

import * as path from 'path';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Stable Chrome UA string — pinned to avoid fingerprint drift. */
export const STABLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const _sessionsDir =
  process.env.TIKTOK_SESSIONS_DIR ||
  path.join(process.cwd(), 'data', 'sessions');

export const CONFIG = {
  uploadUrl:
    process.env.TIKTOK_STUDIO_UPLOAD_URL ||
    'https://www.tiktok.com/tiktokstudio/upload',

  /** Persistent Chromium profile directory — cookies/localStorage survive restarts. */
  profileDir:
    process.env.TIKTOK_BROWSER_PROFILE ||
    path.join(_sessionsDir, 'tiktok-studio-profile'),

  /** storageState JSON backup — used as fallback when persistent profile fails. */
  storageStatePath:
    process.env.TIKTOK_STORAGE_STATE ||
    path.join(_sessionsDir, 'tiktok-studio.storageState.json'),

  /** Session metadata (last save timestamp, verified flag, etc.). */
  metaFilePath: path.join(_sessionsDir, 'tiktok-studio.meta.json'),

  /** Directory for error screenshots / reports. */
  errorDir: path.join(process.cwd(), 'data', 'tiktok-errors'),

  /** Cooldown lockfile — prevents repeated session-invalid alerts. */
  cooldownLockfile: path.join(_sessionsDir, '.session-invalid.lock'),

  headless: process.env.TIKTOK_HEADLESS === 'true',

  /** Launch headed and wait for manual login, then save session and exit. */
  bootstrapLogin: process.env.TIKTOK_BOOTSTRAP_LOGIN === '1',

  /** When session is expired, run bootstrap flow instead of failing fast. */
  forceRelogin: process.env.FORCE_RELOGIN === '1',

  /** 'draft' (default) or 'post'. POST_NOW=true overrides to 'post'. */
  postMode:
    process.env.POST_NOW === 'true'
      ? 'post' as const
      : (process.env.POST_MODE === 'post' ? 'post' as const : 'draft' as const),

  /** Stable browser fingerprint to avoid detection across runs. */
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  userAgent: STABLE_USER_AGENT,
  viewport: { width: 1280, height: 900 } as const,

  /** Output directory for nightly upload summary JSON files. */
  nightlyOutputDir: path.join(process.cwd(), 'data', 'tiktok-uploads'),

  /** FlashFlow API URL for status callbacks. */
  flashflowApiUrl:
    process.env.FF_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000',

  /** FlashFlow API token for status callbacks. */
  flashflowApiToken: process.env.FF_API_TOKEN || '',
} as const;

/** Standard Playwright launch options for TikTok persistent context. */
export function getLaunchOptions(opts?: { headless?: boolean }) {
  return {
    headless: opts?.headless ?? CONFIG.headless,
    viewport: CONFIG.viewport,
    locale: CONFIG.locale,
    timezoneId: CONFIG.timezoneId,
    userAgent: CONFIG.userAgent,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  };
}

// ─── Timeouts ───────────────────────────────────────────────────────────────

export const TIMEOUTS = {
  navigation: 30_000,
  upload: 1_200_000,  // 20 minutes — video processing can be very slow
  action: 10_000,
  selector: 3_000,    // per-selector probe
  searchResults: 8_000,
  postConfirm: 15_000,
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Data required to perform a TikTok Studio upload. */
export interface StudioUploadInput {
  videoPath: string;
  description: string;   // caption + hashtags combined
  productId: string;
}

/** Result emitted after a draft/upload attempt. */
export interface StudioUploadResult {
  status: 'drafted' | 'posted' | 'login_required' | 'error';
  tiktok_draft_id?: string;
  product_id: string;
  video_file: string;
  url?: string;
  errors: string[];
}
