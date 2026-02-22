#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload-from-Pack — CLI entry point
 *
 * Reads an Upload Pack (local dir or --video-id API fetch) and runs the
 * Phase 3 automation module to upload → fill description → attach product → save draft/post.
 *
 * FAIL-FAST: If not logged in, exits immediately with EXIT CODE 42.
 * NO repeated login attempts. NO human intervention in automated runs.
 *
 * Exit codes:
 *   0  = success (drafted or posted)
 *   1  = generic error (retryable)
 *   42 = session invalid — needs manual `npm run tiktok:bootstrap`
 *
 * Cooldown: SESSION_INVALID_COOLDOWN_HOURS (default 6) prevents repeated
 * session-invalid alerts. After the first exit-42 event, subsequent runs
 * within the window exit silently (still code 42, no error report).
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id>
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack --mode draft
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id> --mode post
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack --dry-run
 *
 * Env vars:
 *   TIKTOK_BROWSER_PROFILE           — Chromium profile dir (default: data/sessions/tiktok-studio-profile)
 *   TIKTOK_STUDIO_UPLOAD_URL         — Upload page URL (default: https://www.tiktok.com/tiktokstudio/upload)
 *   TIKTOK_HEADLESS                  — 'true' for headless mode (default: false)
 *   POST_MODE                        — 'draft' (default) or 'post' (overridden by --mode)
 *   POST_NOW                         — 'true' to override POST_MODE to 'post'
 *   FF_API_URL                       — FlashFlow API base URL for status callbacks
 *   FF_API_TOKEN                     — FlashFlow API token for status callbacks
 *   SESSION_INVALID_COOLDOWN_HOURS   — Hours to suppress repeated session-invalid alerts (default: 6)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  CONFIG,
  runUploadToDraft,
  openUploadStudio,
  closeSession,
  reportStatus,
  type StudioUploadInput,
  type StudioUploadResult,
} from '../../../skills/tiktok-studio-uploader/index.js';

// Dry-run imports (uses selectors directly)
import * as sel from '../../../skills/tiktok-studio-uploader/selectors.js';

const ERROR_DIR = path.join(process.cwd(), 'data', 'tiktok-errors');

// ─── Session-invalid guardrails ─────────────────────────────────────────────
// Exit code 42 = "needs manual login" — distinct from generic error (1).
// Callers (cron, OpenClaw, scripts) should watch for 42 and stop retrying.
const EXIT_SESSION_INVALID = 42;

// Cooldown lockfile prevents repeated identical "session expired" noise.
// Set SESSION_INVALID_COOLDOWN_HOURS (default: 6) to control suppression window.
const COOLDOWN_HOURS = Number(process.env.SESSION_INVALID_COOLDOWN_HOURS) || 6;
const COOLDOWN_LOCKFILE = path.join(
  process.cwd(), 'data', 'sessions', '.session-invalid.lock',
);

/** Returns true if cooldown is active (we already reported session-invalid recently). */
function isSessionCooldownActive(): boolean {
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
function setSessionCooldown(): void {
  try {
    fs.mkdirSync(path.dirname(COOLDOWN_LOCKFILE), { recursive: true });
    fs.writeFileSync(COOLDOWN_LOCKFILE, new Date().toISOString() + '\n');
  } catch (err: any) {
    console.error(`[session-guard] Failed to write cooldown lockfile: ${err.message}`);
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Pack reading ───────────────────────────────────────────────────────────

interface RawPackData {
  videoPath: string;
  description: string;
  productId: string;
  videoId?: string; // for status callback
}

function parseArgs(): { packDir?: string; videoId?: string; mode: 'draft' | 'post' } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const videoIdIdx = process.argv.indexOf('--video-id');
  const videoId = videoIdIdx !== -1 ? process.argv[videoIdIdx + 1] : undefined;

  // --mode flag overrides env vars
  const modeIdx = process.argv.indexOf('--mode');
  let mode: 'draft' | 'post' = CONFIG.postMode;
  if (modeIdx !== -1 && process.argv[modeIdx + 1]) {
    mode = process.argv[modeIdx + 1] === 'post' ? 'post' : 'draft';
  }

  if (!args[0] && !videoId && !DRY_RUN) {
    console.error('Usage: upload-from-pack.ts <pack-directory> [--mode draft|post] [--dry-run]');
    console.error('       upload-from-pack.ts --video-id <id> [--mode draft|post] [--dry-run]');
    console.error('');
    console.error('Flags:');
    console.error('  --mode draft|post   — Save as draft (default) or post immediately');
    console.error('  --dry-run           — Check selectors without uploading');
    console.error('  --video-id <id>     — Fetch pack from FlashFlow API by video ID');
    console.error('');
    console.error('Env vars:');
    console.error('  POST_MODE=draft|post    — Save as draft (default) or post immediately');
    console.error('  POST_NOW=true           — Override to post mode');
    console.error('  TIKTOK_HEADLESS=true    — Run in headless mode (must be logged in)');
    console.error('  FF_API_URL=<url>        — FlashFlow API URL for status callbacks');
    console.error('  FF_API_TOKEN=<token>    — FlashFlow API token');
    process.exit(1);
  }

  return { packDir: args[0], videoId, mode };
}

function readPackDir(dir: string): RawPackData {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Upload pack directory not found: ${abs}`);
  }

  // Video file
  let videoPath = path.join(abs, 'video.mp4');
  if (!fs.existsSync(videoPath)) {
    const mp4s = fs.readdirSync(abs).filter((f) => f.endsWith('.mp4'));
    if (mp4s.length === 0) throw new Error('No .mp4 file found in upload pack directory');
    videoPath = path.join(abs, mp4s[0]);
  }

  // Caption
  const captionFile = path.join(abs, 'caption.txt');
  if (!fs.existsSync(captionFile)) throw new Error('caption.txt not found in upload pack');
  const caption = fs.readFileSync(captionFile, 'utf-8').trim();

  // Hashtags
  const hashtagsFile = path.join(abs, 'hashtags.txt');
  if (!fs.existsSync(hashtagsFile)) throw new Error('hashtags.txt not found in upload pack');
  const rawHashtags = fs.readFileSync(hashtagsFile, 'utf-8').trim();
  const hashtags = rawHashtags
    .split(/[\n\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`));

  // Build description = caption + newline + hashtags
  const description = caption + '\n' + hashtags.join(' ');

  // Product ID
  let productId = '';
  const productFile = path.join(abs, 'product.txt');
  const metadataFile = path.join(abs, 'metadata.json');

  if (fs.existsSync(productFile)) {
    // product.txt may have a display name on line 1 and TikTok Product ID on line 2
    const lines = fs.readFileSync(productFile, 'utf-8').trim().split('\n');
    for (const line of lines) {
      const match = line.match(/TikTok Product ID:\s*(.+)/i);
      if (match) {
        productId = match[1].trim();
        break;
      }
    }
    // If no labeled line, use the first non-empty line
    if (!productId) {
      productId = lines[0].trim();
    }
  } else if (fs.existsSync(metadataFile)) {
    const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    productId = meta?.product?.tiktok_product_id || meta?.product_id || '';
  }

  if (!productId) {
    throw new Error('No product ID found — need product.txt or metadata.json with product.tiktok_product_id');
  }

  // Try to extract video_id from metadata for status callback
  let videoId: string | undefined;
  if (fs.existsSync(metadataFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      videoId = meta?.video_id;
    } catch { /* ignore */ }
  }

  return { videoPath, description, productId, videoId };
}

async function fetchWithRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.log(`  Retry ${attempt}/${retries} after error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
  throw new Error('unreachable');
}

async function fetchPackFromApi(videoId: string): Promise<RawPackData> {
  const baseUrl = CONFIG.flashflowApiUrl || process.env.FF_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const apiKey = CONFIG.flashflowApiToken || process.env.FF_API_TOKEN || process.env.SERVICE_API_KEY;

  if (!apiKey) {
    throw new Error('FF_API_TOKEN or SERVICE_API_KEY env var required when using --video-id');
  }

  const url = `${baseUrl}/api/publish/upload-pack`;
  console.log(`Fetching upload pack from ${url} for video_id=${videoId}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ video_id: videoId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    ok: boolean;
    data: {
      pack: {
        video_id: string;
        product_id: string;
        caption: string;
        description: string;
        hashtags: string[];
        cover_text: string;
        video_url: string;
        product?: { tiktok_product_id: string };
      };
    };
    error?: { message: string };
  };

  if (!json.ok) {
    throw new Error(`API returned error: ${json.error?.message || 'unknown'}`);
  }

  const pack = json.data.pack;

  // Download video to temp file with retries
  console.log(`Downloading video from ${pack.video_url}...`);
  const videoRes = await fetchWithRetry(pack.video_url);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-upload-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  fs.writeFileSync(videoPath, buffer);
  console.log(`Video saved to ${videoPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  // Use description field if available, otherwise build from caption + hashtags
  const description =
    pack.description ||
    pack.caption + '\n' + pack.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');

  // Resolve product ID: prefer product.tiktok_product_id, fallback to product_id
  const productId = pack.product?.tiktok_product_id || pack.product_id;

  return {
    videoPath,
    description,
    productId,
    videoId: pack.video_id,
  };
}

// ─── Error reporting ────────────────────────────────────────────────────────

function saveErrorReport(error: string, context?: Record<string, any>): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ERROR_DIR, ts);
  fs.mkdirSync(dir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    error,
    ...context,
  };
  fs.writeFileSync(path.join(dir, 'error-report.json'), JSON.stringify(report, null, 2));
  console.error(`[error] Report saved to ${dir}`);
  return dir;
}

// ─── Dry-run ────────────────────────────────────────────────────────────────

async function runDryRun(): Promise<void> {
  console.log('\n=== DRY RUN — Opening browser & checking selectors ===\n');
  console.log(`Browser profile: ${CONFIG.profileDir}`);
  console.log(`Upload URL:      ${CONFIG.uploadUrl}`);
  console.log(`Post mode:       ${CONFIG.postMode}\n`);

  const session = await openUploadStudio({ interactive: false });
  if (!session) {
    console.error('ERROR: Not logged in to TikTok Studio.');
    console.error('TikTok session expired — run `npm run tiktok:bootstrap` (one-time phone approval).');
    process.exit(EXIT_SESSION_INVALID);
  }

  const { page } = session;

  const checks: Array<{ name: string; selectors: readonly string[] }> = [
    { name: 'File input', selectors: sel.FILE_INPUT },
    { name: 'Caption editor', selectors: sel.CAPTION_EDITOR },
    { name: 'Add product button', selectors: sel.ADD_PRODUCT_BTN },
    { name: 'Draft button', selectors: sel.DRAFT_BTN },
    { name: 'Post button', selectors: sel.POST_BTN },
  ];

  for (const check of checks) {
    let found = false;
    for (const s of check.selectors) {
      try {
        const loc = page.locator(s).first();
        const visible = await loc.isVisible({ timeout: 2_000 });
        const attached = !visible ? (await loc.count()) > 0 : true;

        if (visible || attached) {
          console.log(`  [OK]   ${check.name} — ${s} (${visible ? 'visible' : 'attached'})`);
          found = true;
          break;
        }
      } catch {
        // next
      }
    }
    if (!found) {
      console.log(`  [MISS] ${check.name} — none of ${check.selectors.length} selectors matched`);
    }
  }

  // Also check for blockers
  const blockerChecks: Array<{ name: string; selectors: readonly string[] }> = [
    { name: 'Captcha', selectors: sel.CAPTCHA_INDICATORS },
    { name: '2FA', selectors: sel.TWO_FA_INDICATORS },
    { name: 'Blocker', selectors: sel.BLOCKER_INDICATORS },
  ];

  console.log('\n  Blocker detection:');
  for (const check of blockerChecks) {
    let found = false;
    for (const s of check.selectors) {
      try {
        const visible = await page.locator(s).first().isVisible({ timeout: 1_500 });
        if (visible) {
          console.log(`  [WARN] ${check.name} detected: ${s}`);
          found = true;
          break;
        }
      } catch {
        // next
      }
    }
    if (!found) {
      console.log(`  [OK]   No ${check.name.toLowerCase()} detected`);
    }
  }

  await closeSession(session);
  console.log('\nDry run complete.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { packDir, videoId, mode } = parseArgs();
  const shouldPost = mode === 'post';

  console.log('=== TikTok Studio Upload-from-Pack ===\n');
  console.log(`Mode: ${shouldPost ? 'POST (will publish immediately!)' : 'DRAFT (save as draft)'}`);

  if (DRY_RUN) {
    await runDryRun();
    process.exit(0);
  }

  let pack: RawPackData;
  if (videoId) {
    pack = await fetchPackFromApi(videoId);
  } else {
    pack = readPackDir(packDir!);
  }

  console.log(`\nVideo:       ${pack.videoPath}`);
  console.log(`Description: ${pack.description.slice(0, 80)}${pack.description.length > 80 ? '...' : ''}`);
  console.log(`Product ID:  ${pack.productId}`);
  console.log(`Video ID:    ${pack.videoId || '(none — no status callback)'}`);
  console.log(`Mode:        ${shouldPost ? 'POST' : 'DRAFT'}\n`);

  const input: StudioUploadInput = {
    videoPath: pack.videoPath,
    description: pack.description,
    productId: pack.productId,
  };

  const result = await runUploadToDraft(input, shouldPost);

  // Emit JSON result
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2));

  // ── Session-invalid: exit 42 with cooldown ──
  if (result.status === 'login_required') {
    if (isSessionCooldownActive()) {
      // Already reported recently — exit silently, no error report, no spam
      process.exit(EXIT_SESSION_INVALID);
    }
    // First report in this cooldown window — emit once, then set cooldown
    saveErrorReport(result.errors.join('; '), {
      video_id: pack.videoId,
      product_id: pack.productId,
      status: result.status,
    });
    console.error('\n[session-guard] SESSION INVALID — exit 42.');
    console.error('[session-guard] Manual login required: npm run tiktok:bootstrap');
    console.error(`[session-guard] Cooldown set: ${COOLDOWN_HOURS}h (no repeated alerts).`);
    setSessionCooldown();
    process.exit(EXIT_SESSION_INVALID);
  }

  // Save error report if failed (non-login errors)
  if (result.status === 'error') {
    saveErrorReport(result.errors.join('; '), {
      video_id: pack.videoId,
      product_id: pack.productId,
      status: result.status,
    });
  }

  // Report status back to FlashFlow (non-blocking)
  if (pack.videoId) {
    await reportStatus({ video_id: pack.videoId, result });
  }

  // Clean up temp video if fetched from API
  if (videoId && pack.videoPath.includes(os.tmpdir())) {
    try {
      fs.unlinkSync(pack.videoPath);
      fs.rmdirSync(path.dirname(pack.videoPath));
    } catch { /* ignore */ }
  }

  const exitCode = result.status === 'drafted' || result.status === 'posted' ? 0 : 1;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  saveErrorReport(err.message, { fatal: true });
  const result: StudioUploadResult = {
    status: 'error',
    product_id: '',
    video_file: '',
    errors: [err.message],
  };
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
});
