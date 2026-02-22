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

import { type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Reuse step functions and session management from skill module
import { uploadVideoFile } from '../../../../skills/tiktok-studio-uploader/upload.js';
import { fillDescription } from '../../../../skills/tiktok-studio-uploader/description.js';
import { attachProductByID } from '../../../../skills/tiktok-studio-uploader/product.js';
import { saveDraft, publishPost } from '../../../../skills/tiktok-studio-uploader/draft.js';
import {
  openUploadStudio,
  closeSession,
} from '../../../../skills/tiktok-studio-uploader/browser.js';
import { CONFIG } from '../../../../skills/tiktok-studio-uploader/types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ERROR_DIR = CONFIG.errorDir;

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

// ─── Modal Dismissal ────────────────────────────────────────────────────────

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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload (persistent profile) ===\n');
  console.log(`Mode:    ${SHOULD_POST ? 'POST (publish immediately)' : 'DRAFT (save as draft)'}`);

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

  // 3. Open browser via skill module (persistent context + session checks)
  const session = await openUploadStudio();
  if (!session) {
    // openUploadStudio already logged the reason and wrote session-invalid event
    process.exit(1);
  }

  const { page } = session;

  try {
    // 4. Upload video
    console.log('\n[1/4] Uploading video...');
    await uploadVideoFile(page, videoPath);
    console.log('      Video accepted.');

    // Dismiss any overlay modal TikTok shows after upload
    await dismissModals(page);

    // 5. Fill description + hashtags
    console.log('[2/4] Filling description + hashtags...');
    await fillDescription(page, pack.description);
    console.log('      Description filled.');

    // 6. Attach product
    console.log(`[3/4] Attaching product ${pack.productId}...`);
    const productResult = await attachProductByID(page, pack.productId);
    if (productResult.linked) {
      console.log('      Product linked.');
    } else {
      console.log(`      Product linking issues: ${productResult.errors.join('; ')}`);
    }

    // 7. Save as draft or post
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

    // 8. Brief wait before closing to let TikTok finalize
    await page.waitForTimeout(5_000);

    // 9. Output JSON result
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
    await closeSession(session);
    process.exit(1);
  } finally {
    // closeSession saves storageState backup automatically
    try { await closeSession(session); } catch { /* already closed */ }
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
