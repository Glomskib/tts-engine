#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload — persistent-profile browser automation.
 *
 * Reads an upload-pack directory (caption.txt, hashtags.txt, product.txt,
 * metadata.json, video.mp4) and drives TikTok Studio via Playwright to
 * upload, fill description, attach product, and save as draft or post.
 *
 * Uses launchPersistentContext (same profile as tiktok:bootstrap) so
 * login survives across runs.  Also saves storageState as backup.
 *
 * FAIL-FAST: If not logged in, exits immediately with clear error.
 * NO repeated login attempts in non-interactive mode.
 *
 * Usage:
 *   npm run tiktok:upload -- --pack-dir <dir>
 *   npm run tiktok:upload -- --pack-dir <dir> --post
 *   npm run tiktok:upload -- --video-url <url> --pack-dir <dir>
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Reuse step functions from existing skill modules
import { uploadVideoFile } from '../../../../skills/tiktok-studio-uploader/upload.js';
import { fillDescription } from '../../../../skills/tiktok-studio-uploader/description.js';
import { attachProductByID } from '../../../../skills/tiktok-studio-uploader/product.js';
import { saveDraft, publishPost } from '../../../../skills/tiktok-studio-uploader/draft.js';
import { LOGIN_INDICATORS } from '../../../../skills/tiktok-studio-uploader/selectors.js';
import { CONFIG, TIMEOUTS, getLaunchOptions } from '../../../../skills/tiktok-studio-uploader/types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const UPLOAD_URL = CONFIG.uploadUrl;
const PROFILE_DIR = CONFIG.profileDir;

const STATE_DIR = path.join(process.cwd(), 'data', 'sessions');
const STATE_FILE = path.join(STATE_DIR, 'tiktok-studio.storageState.json');
const META_FILE = path.join(STATE_DIR, 'tiktok-studio.meta.json');
const ERROR_DIR = path.join(process.cwd(), 'data', 'tiktok-errors');

const FAIL_FAST_MSG =
  'TikTok session expired — run `npm run tiktok:bootstrap` (one-time phone approval).';

// ─── CLI args ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const SHOULD_POST = rawArgs.includes('--post');

function getArgValue(flag: string): string | undefined {
  const idx = rawArgs.indexOf(flag);
  if (idx === -1 || idx + 1 >= rawArgs.length) return undefined;
  return rawArgs[idx + 1];
}

const packDir = getArgValue('--pack-dir');
const videoUrlArg = getArgValue('--video-url');

if (!packDir) {
  console.error(
    'Usage: upload.ts --pack-dir <dir> [--video-url <url>] [--post]\n\n' +
      'Flags:\n' +
      '  --pack-dir <dir>    Upload-pack directory (required)\n' +
      '  --video-url <url>   Download video from URL instead of local file\n' +
      '  --post              Publish immediately (default: save as draft)\n',
  );
  process.exit(1);
}

// ─── Pack reading ───────────────────────────────────────────────────────────

interface PackData {
  videoPath: string;
  description: string;
  productId: string;
  caption: string;
  hashtags: string[];
  coverText: string;
  videoId?: string;
}

function readPack(dir: string): PackData {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) throw new Error(`Pack directory not found: ${abs}`);

  // Caption (required)
  const captionFile = path.join(abs, 'caption.txt');
  if (!fs.existsSync(captionFile)) throw new Error('caption.txt not found in pack');
  const caption = fs.readFileSync(captionFile, 'utf-8').trim();

  // Hashtags (required)
  const hashtagsFile = path.join(abs, 'hashtags.txt');
  if (!fs.existsSync(hashtagsFile)) throw new Error('hashtags.txt not found in pack');
  const hashtags = fs
    .readFileSync(hashtagsFile, 'utf-8')
    .trim()
    .split(/[\n\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`));

  const description = caption + '\n' + hashtags.join(' ');

  // Cover text (optional)
  const coverFile = path.join(abs, 'cover.txt');
  const coverText = fs.existsSync(coverFile)
    ? fs.readFileSync(coverFile, 'utf-8').trim()
    : '';

  // Metadata (optional)
  const metaFile = path.join(abs, 'metadata.json');
  let meta: Record<string, any> = {};
  if (fs.existsSync(metaFile)) {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  }

  // Video file: CLI --video-url > metadata video_url > local .mp4
  let videoPath = '';
  if (videoUrlArg) {
    videoPath = videoUrlArg;
  } else if (fs.existsSync(path.join(abs, 'video.mp4'))) {
    videoPath = path.join(abs, 'video.mp4');
  } else {
    const mp4s = fs.readdirSync(abs).filter((f) => f.endsWith('.mp4'));
    if (mp4s.length > 0) {
      videoPath = path.join(abs, mp4s[0]);
    } else if (meta.video_url) {
      videoPath = meta.video_url;
    } else {
      throw new Error('No .mp4 file found and no video_url in metadata.json (or --video-url)');
    }
  }

  // Product ID resolution
  let productId = '';
  if (meta.product?.tiktok_product_id) {
    productId = meta.product.tiktok_product_id;
  } else if (meta.product_id) {
    productId = meta.product_id;
  }
  if (!productId) {
    const productFile = path.join(abs, 'product.txt');
    if (fs.existsSync(productFile)) {
      const lines = fs.readFileSync(productFile, 'utf-8').trim().split('\n');
      for (const line of lines) {
        const match = line.match(/TikTok Product ID:\s*(.+)/i);
        if (match) {
          productId = match[1].trim();
          break;
        }
      }
      if (!productId) productId = lines[0].trim();
    }
  }
  if (!productId) throw new Error('No product ID found in metadata.json or product.txt');

  return {
    videoPath,
    description,
    productId,
    caption,
    hashtags,
    coverText,
    videoId: meta.video_id,
  };
}

// ─── Video download ─────────────────────────────────────────────────────────

async function downloadVideo(url: string, destDir: string): Promise<string> {
  const dest = path.join(destDir, 'video-downloaded.mp4');
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Downloading video (attempt ${attempt}/${MAX_RETRIES}) from ${url}...`);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
      return dest;
    } catch (err: any) {
      console.error(`Download attempt ${attempt} failed: ${err.message}`);
      if (attempt === MAX_RETRIES) throw new Error(`Failed to download video after ${MAX_RETRIES} attempts: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3_000 * attempt)); // backoff
    }
  }
  throw new Error('unreachable');
}

// ─── Error reporting ────────────────────────────────────────────────────────

async function captureError(page: Page | null, error: string, context?: Record<string, any>): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ERROR_DIR, ts);
  fs.mkdirSync(dir, { recursive: true });

  // Screenshot
  if (page) {
    try {
      await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });
    } catch { /* page may be closed */ }
  }

  // Error report
  const report = {
    timestamp: new Date().toISOString(),
    error,
    url: page ? page.url() : 'unknown',
    ...context,
  };
  fs.writeFileSync(path.join(dir, 'error-report.json'), JSON.stringify(report, null, 2));
  console.error(`[error] Report saved to ${dir}`);
  return dir;
}

// ─── Browser (persistent context) ───────────────────────────────────────────

async function launchBrowser(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error(`\n${FAIL_FAST_MSG}`);
    console.error(`No persistent profile found at ${PROFILE_DIR}\n`);
    process.exit(1);
  }

  // Clean stale lock files from previous crashed runs
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(PROFILE_DIR, lock);
    try { fs.unlinkSync(lockPath); } catch { /* doesn't exist */ }
  }

  // Use shared launch options for consistent fingerprint
  const launchOpts = getLaunchOptions({ headless: false });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);

  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
    return false;
  }
  for (const sel of LOGIN_INDICATORS) {
    try {
      const visible = await page.locator(sel).first().isVisible({ timeout: 2_000 });
      if (visible) return false;
    } catch {
      // selector not found — good
    }
  }
  return true;
}

async function dismissModals(page: Page): Promise<void> {
  const dismissSelectors = [
    'div.TUXModal-overlay button[aria-label="Close"]',
    'div.TUXModal-overlay button:has-text("Close")',
    'div.TUXModal-overlay button:has-text("Got it")',
    'div.TUXModal-overlay button:has-text("OK")',
    'div.TUXModal-overlay button:has-text("Skip")',
    'button[aria-label="Close"]',
    '[class*="modal"] button[aria-label="Close"]',
  ];

  for (const sel of dismissSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1_500 })) {
        await btn.click();
        console.log(`      Dismissed modal via: ${sel}`);
        await page.waitForTimeout(1_000);
        return;
      }
    } catch { /* next */ }
  }

  // Fallback: press Escape
  try {
    const modalVisible = await page.locator('div.TUXModal-overlay').first().isVisible({ timeout: 1_000 });
    if (modalVisible) {
      await page.keyboard.press('Escape');
      console.log('      Dismissed modal via Escape');
      await page.waitForTimeout(1_000);
    }
  } catch { /* no modal */ }
}

async function saveBackupState(context: BrowserContext): Promise<void> {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    await context.storageState({ path: STATE_FILE });
    const now = new Date();
    fs.writeFileSync(
      META_FILE,
      JSON.stringify({ saved_at: now.toISOString(), profile_dir: PROFILE_DIR }, null, 2),
    );
    console.log(`StorageState backup saved to ${STATE_FILE}`);
  } catch {
    // non-critical — persistent profile is the primary
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload (persistent profile) ===\n');
  console.log(`Mode:    ${SHOULD_POST ? 'POST (publish immediately)' : 'DRAFT (save as draft)'}`);
  console.log(`Profile: ${PROFILE_DIR}`);

  // 1. Read pack
  const pack = readPack(packDir!);

  // 2. Resolve video file (download if URL)
  let videoPath = pack.videoPath;
  if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
    videoPath = await downloadVideo(videoPath, path.resolve(packDir!));
  }

  console.log(`\nVideo:       ${videoPath}`);
  console.log(`Description: ${pack.description.slice(0, 80)}...`);
  console.log(`Product ID:  ${pack.productId}`);

  // 3. Launch browser with persistent context (no newContext!)
  const { context, page } = await launchBrowser();

  try {
    // 4. Navigate to upload page
    await page.goto(UPLOAD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    // 5. Login check — FAIL FAST, no retries
    if (!(await isLoggedIn(page))) {
      console.error(`\n${FAIL_FAST_MSG}\n`);
      await captureError(page, 'Not logged in', { pack_dir: packDir });
      await context.close();
      process.exit(1);
    }

    // 6. Upload video
    console.log('\n[1/4] Uploading video...');
    await uploadVideoFile(page, videoPath);
    console.log('      Video accepted.');

    // Dismiss any overlay modal TikTok shows after upload
    await dismissModals(page);

    // 7. Fill description + hashtags
    console.log('[2/4] Filling description + hashtags...');
    await fillDescription(page, pack.description);
    console.log('      Description filled.');

    // 8. Attach product
    console.log(`[3/4] Attaching product ${pack.productId}...`);
    const productResult = await attachProductByID(page, pack.productId);
    if (productResult.linked) {
      console.log('      Product linked.');
    } else {
      console.log(`      Product linking issues: ${productResult.errors.join('; ')}`);
    }

    // 9. Save as draft or post
    let result;
    if (SHOULD_POST) {
      console.log('[4/4] Publishing...');
      result = await publishPost(page);
      if (result.saved) {
        console.log(`      Published! ${result.url || ''}`);
      } else {
        console.log(`      Post issues: ${result.errors.join('; ')}`);
      }
    } else {
      console.log('[4/4] Saving as draft...');
      result = await saveDraft(page);
      if (result.saved) {
        console.log(`      Draft saved! ${result.tiktok_draft_id || ''}`);
      } else {
        console.log(`      Draft issues: ${result.errors.join('; ')}`);
      }
    }

    // 10. Brief wait before closing to let TikTok finalize
    await page.waitForTimeout(5_000);

    // 11. Save storageState as backup
    await saveBackupState(context);

    // 12. Output JSON result
    const output = {
      status: SHOULD_POST ? 'posted' : 'drafted',
      pack_dir: path.resolve(packDir!),
      video_file: videoPath,
      product_id: pack.productId,
      tiktok_draft_id: result.tiktok_draft_id,
      url: result.url,
      errors: [...productResult.errors, ...result.errors],
    };

    console.log('\n--- Result ---');
    console.log(JSON.stringify(output, null, 2));
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    await captureError(page, err.message, { pack_dir: packDir, product_id: pack.productId });
    await context.close();
    process.exit(1);
  } finally {
    try { await context.close(); } catch { /* already closed */ }
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
