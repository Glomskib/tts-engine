#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload — browser automation from an upload-pack folder.
 *
 * Reads caption.txt, hashtags.txt, metadata.json, and video.mp4 from a
 * local upload-pack directory, then drives TikTok Studio via Playwright
 * (headed) to upload, fill description, attach product, and save as
 * draft or post.
 *
 * Login persists via storageState JSON file (~/.flashflow/tiktok-studio.storageState.json).
 * On first run the script pauses for manual login, then saves the session.
 *
 * Usage:
 *   npx tsx scripts/publish/tiktok-studio-upload.ts <pack-dir>
 *   npx tsx scripts/publish/tiktok-studio-upload.ts <pack-dir> --post
 *   npx tsx scripts/publish/tiktok-studio-upload.ts <pack-dir> --dry-run
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Reuse step functions from existing skill modules
import { uploadVideoFile } from '../../../skills/tiktok-studio-uploader/upload.js';
import { fillDescription } from '../../../skills/tiktok-studio-uploader/description.js';
import { attachProductByID } from '../../../skills/tiktok-studio-uploader/product.js';
import { saveDraft, publishPost } from '../../../skills/tiktok-studio-uploader/draft.js';
import {
  LOGIN_INDICATORS,
  FILE_INPUT,
  CAPTION_EDITOR,
  ADD_PRODUCT_BTN,
  DRAFT_BTN,
  POST_BTN,
} from '../../../skills/tiktok-studio-uploader/selectors.js';
import { TIMEOUTS } from '../../../skills/tiktok-studio-uploader/types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const PROFILE_DIR =
  process.env.TIKTOK_BROWSER_PROFILE ||
  path.join(process.cwd(), 'data', 'sessions', 'tiktok-studio-profile');
const STATE_DIR = path.join(process.cwd(), 'data', 'sessions');
const STATE_FILE = path.join(STATE_DIR, 'tiktok-studio.storageState.json');

// ─── CLI args ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const DRY_RUN = rawArgs.includes('--dry-run');
const SHOULD_POST = rawArgs.includes('--post');
const packDir = rawArgs.find((a) => !a.startsWith('--'));

if (!packDir) {
  console.error(
    'Usage: tiktok-studio-upload.ts <pack-dir> [--post] [--dry-run]\n\n' +
      'Flags:\n' +
      '  --post      Publish immediately (default: save as draft)\n' +
      '  --dry-run   Print pack contents + verify selectors only\n',
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

  // Video file: local .mp4 first, then URL from metadata
  let videoPath = path.join(abs, 'video.mp4');
  if (!fs.existsSync(videoPath)) {
    const mp4s = fs.readdirSync(abs).filter((f) => f.endsWith('.mp4'));
    if (mp4s.length > 0) {
      videoPath = path.join(abs, mp4s[0]);
    } else if (meta.video_url) {
      videoPath = meta.video_url; // downloaded later
    } else if (meta.video_source?.google_drive_url) {
      videoPath = toDirectDriveUrl(meta.video_source.google_drive_url);
    } else {
      throw new Error('No .mp4 file found and no video_url in metadata.json');
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

/** Convert a Google Drive share URL to a direct download URL. */
function toDirectDriveUrl(shareUrl: string): string {
  const fileIdMatch =
    shareUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    shareUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?id=${fileIdMatch[1]}&export=download`;
  }
  return shareUrl; // return as-is if we can't parse
}

// ─── Video download ─────────────────────────────────────────────────────────

async function downloadVideo(url: string, destDir: string): Promise<string> {
  const dest = path.join(destDir, 'video-downloaded.mp4');
  console.log(`Downloading video from ${url}...`);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download video: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  return dest;
}

// ─── Browser + login ────────────────────────────────────────────────────────

async function launchBrowser(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

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

/**
 * Dismiss any overlay modals that TikTok shows (e.g. after upload,
 * promo dialogs, cookie banners). Tries close/dismiss buttons, then
 * Escape key, then clicks outside the modal.
 */
async function dismissModals(page: Page): Promise<void> {
  const dismissSelectors = [
    'div.TUXModal-overlay button[aria-label="Close"]',
    'div.TUXModal-overlay button:has-text("Close")',
    'div.TUXModal-overlay button:has-text("Got it")',
    'div.TUXModal-overlay button:has-text("OK")',
    'div.TUXModal-overlay button:has-text("Skip")',
    'div.TUXModal-overlay button:has-text("Dismiss")',
    'button[aria-label="Close"]',
    '[class*="modal"] button[aria-label="Close"]',
    '[class*="modal"] button:has-text("Got it")',
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
    } catch {
      // next
    }
  }

  // Fallback: press Escape
  try {
    const modalVisible = await page.locator('div.TUXModal-overlay').first().isVisible({ timeout: 1_000 });
    if (modalVisible) {
      await page.keyboard.press('Escape');
      console.log('      Dismissed modal via Escape');
      await page.waitForTimeout(1_000);
    }
  } catch {
    // no modal — continue
  }
}

// ─── Dry run ────────────────────────────────────────────────────────────────

async function runDryRun(pack: PackData): Promise<void> {
  console.log('\n=== DRY RUN ===\n');
  console.log(`Pack dir:    ${path.resolve(packDir!)}`);
  console.log(`Video:       ${pack.videoPath}`);
  console.log(`Caption:     ${pack.caption.slice(0, 80)}${pack.caption.length > 80 ? '...' : ''}`);
  console.log(`Hashtags:    ${pack.hashtags.join(' ')}`);
  console.log(`Product ID:  ${pack.productId}`);
  console.log(`Cover text:  ${pack.coverText || '(none)'}`);
  console.log(`Video ID:    ${pack.videoId || '(none)'}`);
  console.log(`Mode:        ${SHOULD_POST ? 'POST' : 'DRAFT'}`);
  console.log(
    `State file:  ${STATE_FILE} (${fs.existsSync(STATE_FILE) ? 'exists' : 'not found'})`,
  );

  console.log('\nOpening browser to verify selectors...');
  const { browser, context, page } = await launchBrowser();

  try {
    await page.goto(UPLOAD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    const loggedIn = await isLoggedIn(page);
    console.log(`\nLogin: ${loggedIn ? 'LOGGED IN' : 'NOT LOGGED IN'}`);

    if (loggedIn) {
      const checks: Array<{ name: string; selectors: readonly string[] }> = [
        { name: 'File input', selectors: FILE_INPUT },
        { name: 'Caption editor', selectors: CAPTION_EDITOR },
        { name: 'Add product btn', selectors: ADD_PRODUCT_BTN },
        { name: 'Draft button', selectors: DRAFT_BTN },
        { name: 'Post button', selectors: POST_BTN },
      ];

      console.log('\nSelector check:');
      for (const check of checks) {
        let found = false;
        for (const s of check.selectors) {
          try {
            const loc = page.locator(s).first();
            const visible = await loc.isVisible({ timeout: 2_000 });
            const attached = !visible ? (await loc.count()) > 0 : true;
            if (visible || attached) {
              console.log(
                `  [OK]   ${check.name} — ${s} (${visible ? 'visible' : 'attached'})`,
              );
              found = true;
              break;
            }
          } catch {
            // next
          }
        }
        if (!found) console.log(`  [MISS] ${check.name}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\nDry run complete.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload ===\n');
  console.log(`Mode: ${SHOULD_POST ? 'POST (publish immediately)' : 'DRAFT (save as draft)'}`);

  // 1. Read pack
  const pack = readPack(packDir!);

  if (DRY_RUN) {
    await runDryRun(pack);
    return;
  }

  // 2. Resolve video file (download if URL)
  let videoPath = pack.videoPath;
  if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
    videoPath = await downloadVideo(videoPath, path.resolve(packDir!));
  }

  console.log(`\nVideo:       ${videoPath}`);
  console.log(`Description: ${pack.description.slice(0, 80)}...`);
  console.log(`Product ID:  ${pack.productId}`);

  // 3. Launch browser with persistent context
  const { context, page } = await launchBrowser();

  try {
    // 4. Navigate to upload page
    await page.goto(UPLOAD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    // 5. Login check — fail fast, exit 42 (session invalid)
    if (!(await isLoggedIn(page))) {
      console.error('\nNot logged in. Run bootstrap first:');
      console.error('  npm run tiktok:bootstrap\n');
      await context.close();
      process.exit(42);
    }

    // 6. Upload video
    console.log('\n[1/4] Uploading video...');
    await uploadVideoFile(page, videoPath);
    console.log('      Video accepted.');

    // Dismiss any overlay modal that TikTok shows after upload
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
    if (SHOULD_POST) {
      console.log('[4/4] Publishing...');
      const result = await publishPost(page);
      if (result.saved) {
        console.log(`      Published! ${result.url || ''}`);
      } else {
        console.log(`      Post issues: ${result.errors.join('; ')}`);
      }
    } else {
      console.log('[4/4] Saving as draft...');
      const result = await saveDraft(page);
      if (result.saved) {
        console.log(`      Draft saved! ${result.tiktok_draft_id || ''}`);
      } else {
        console.log(`      Draft issues: ${result.errors.join('; ')}`);
      }
    }

    // Save storageState as backup
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      await context.storageState({ path: STATE_FILE });
    } catch { /* non-critical */ }

    console.log('\nDone.');
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
