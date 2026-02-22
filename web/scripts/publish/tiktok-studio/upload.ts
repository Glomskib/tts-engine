#!/usr/bin/env tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload — storageState-based browser automation.
 *
 * Reads an upload-pack directory (caption.txt, hashtags.txt, product.txt,
 * metadata.json, video.mp4) and drives TikTok Studio via Playwright to
 * upload, fill description, attach product, and save as draft or post.
 *
 * Session is loaded from data/sessions/tiktok-studio.storageState.json
 * (created by bootstrap-session.ts).
 *
 * Usage:
 *   npm run tiktok:upload -- --pack-dir <dir>
 *   npm run tiktok:upload -- --pack-dir <dir> --post
 *   npm run tiktok:upload -- --video-url <url> --pack-dir <dir>
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Reuse step functions from existing skill modules
import { uploadVideoFile } from '../../../../skills/tiktok-studio-uploader/upload.js';
import { fillDescription } from '../../../../skills/tiktok-studio-uploader/description.js';
import { attachProductByID } from '../../../../skills/tiktok-studio-uploader/product.js';
import { saveDraft, publishPost } from '../../../../skills/tiktok-studio-uploader/draft.js';
import { LOGIN_INDICATORS } from '../../../../skills/tiktok-studio-uploader/selectors.js';
import { TIMEOUTS } from '../../../../skills/tiktok-studio-uploader/types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const SESSION_DIR = path.join(process.cwd(), 'data/sessions');
const SESSION_PATH = path.join(SESSION_DIR, 'tiktok-studio.storageState.json');
const META_PATH = path.join(SESSION_DIR, 'tiktok-studio.meta.json');

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
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
  page: Page;
}> {
  // Check session exists
  if (!fs.existsSync(SESSION_PATH)) {
    console.error(
      `\nNo session file found at ${SESSION_PATH}\n` +
        'Run bootstrap first:\n' +
        '  npm run tiktok:bootstrap\n',
    );
    process.exit(1);
  }

  // Check session age
  if (fs.existsSync(META_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf-8'));
      const ageMs = Date.now() - new Date(meta.saved_at).getTime();
      const ageHours = Math.round(ageMs / 3_600_000);
      console.log(`Session age: ${ageHours}h (saved: ${meta.saved_at})`);
      if (ageHours > 72) {
        console.warn(`⚠ Session is ${ageHours}h old — may be expired. Re-run bootstrap if login fails.`);
      }
    } catch {
      // meta file unreadable, continue anyway
    }
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  let context: BrowserContext;
  const ctxOpts = {
    viewport: { width: 1280, height: 900 } as const,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  try {
    context = await browser.newContext({ ...ctxOpts, storageState: SESSION_PATH });
  } catch {
    console.error('Saved session invalid. Re-run bootstrap:');
    console.error('  npm run tiktok:bootstrap');
    await browser.close();
    process.exit(1);
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();
  return { browser, context, page };
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

function waitForEnter(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('\n' + '='.repeat(60));
    console.log('  ' + prompt);
    console.log('  Press Enter when done, or type "quit" to abort.');
    console.log('='.repeat(60) + '\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on('line', (line) => {
      rl.close();
      resolve(line.trim().toLowerCase() !== 'quit');
    });
  });
}

async function saveSession(context: BrowserContext): Promise<void> {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  await context.storageState({ path: SESSION_PATH });

  const now = new Date();
  const meta = { saved_at: now.toISOString() };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log(`Session saved to ${SESSION_PATH}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload (storageState) ===\n');
  console.log(`Mode: ${SHOULD_POST ? 'POST (publish immediately)' : 'DRAFT (save as draft)'}`);

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

  // 3. Launch browser with storageState
  const { browser, context, page } = await launchBrowser();

  try {
    // 4. Navigate to upload page
    await page.goto(UPLOAD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForTimeout(3_000);

    // 5. Login check — if auth failure, pause and instruct to rerun bootstrap
    if (!(await isLoggedIn(page))) {
      console.log('\n⚠ Session appears expired or invalid.');
      const ok = await waitForEnter(
        'LOGIN REQUIRED — log in to TikTok in the browser window, or quit and re-run bootstrap.',
      );
      if (!ok) {
        console.log('Aborted.');
        process.exit(1);
      }
      await saveSession(context);
      // Re-navigate after login
      await page.goto(UPLOAD_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
      await page.waitForTimeout(3_000);
    }

    // 6. Upload video
    console.log('\n[1/4] Uploading video...');
    await uploadVideoFile(page, videoPath);
    console.log('      Video accepted.');

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

    // 10. Save updated storageState after success
    await saveSession(context);

    // 11. Output JSON result
    const output = {
      status: SHOULD_POST ? 'posted' : 'drafted',
      pack_dir: path.resolve(packDir!),
      video_file: videoPath,
      product_id: pack.productId,
      tiktok_draft_id: result.tiktok_draft_id,
      url: result.url,
      errors: [
        ...productResult.errors,
        ...result.errors,
      ],
    };

    console.log('\n--- Result ---');
    console.log(JSON.stringify(output, null, 2));
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
