/**
 * Types and configuration for TikTok Studio browser automation.
 */

import * as path from 'path';
import * as os from 'os';

// ─── Configuration ──────────────────────────────────────────────────────────

export const CONFIG = {
  uploadUrl:
    process.env.TIKTOK_STUDIO_UPLOAD_URL ||
    'https://www.tiktok.com/tiktokstudio/upload',

  profileDir:
    process.env.TIKTOK_BROWSER_PROFILE ||
    path.join(os.homedir(), '.openclaw', 'browser-profiles', 'tiktok-studio'),

  headless: process.env.TIKTOK_HEADLESS === 'true',
} as const;

// ─── Timeouts ───────────────────────────────────────────────────────────────

export const TIMEOUTS = {
  navigation: 30_000,
  upload: 120_000,    // video processing can be slow
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
