/**
 * Types and configuration for TikTok Studio browser automation.
 */

import * as path from 'path';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Stable Chrome UA string — pinned to avoid fingerprint drift. */
export const STABLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const CONFIG = {
  uploadUrl:
    process.env.TIKTOK_STUDIO_UPLOAD_URL ||
    'https://www.tiktok.com/tiktokstudio/upload',

  profileDir:
    process.env.TIKTOK_BROWSER_PROFILE ||
    path.join(process.cwd(), 'data', 'sessions', 'tiktok-studio-profile'),

  headless: process.env.TIKTOK_HEADLESS === 'true',

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
