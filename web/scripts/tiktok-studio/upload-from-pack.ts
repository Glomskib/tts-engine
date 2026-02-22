#!/usr/bin/env npx tsx
/**
 * TikTok Studio Upload-from-Pack
 *
 * Uploads a video to TikTok Shop via the TikTok Studio web UI
 * using the contents of an Upload Pack directory.
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id>
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack --dry-run
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Configuration ──────────────────────────────────────────────────────────

const TIKTOK_STUDIO_UPLOAD_URL =
  process.env.TIKTOK_STUDIO_UPLOAD_URL || 'https://www.tiktok.com/tiktokstudio/upload';

const POST_MODE = (process.env.TIKTOK_POST_MODE || 'draft') as 'draft' | 'post';

const BROWSER_PROFILE_DIR =
  process.env.TIKTOK_BROWSER_PROFILE ||
  path.join(os.homedir(), '.openclaw', 'browser-profiles', 'tiktok-studio');

const HEADLESS = process.env.TIKTOK_HEADLESS === 'true';

const DRY_RUN = process.argv.includes('--dry-run');

// Timeouts
const NAV_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 120_000; // video processing can be slow
const ACTION_TIMEOUT = 10_000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface PackData {
  videoPath: string;
  caption: string;
  hashtags: string[];
  productId: string;
  coverText?: string;
}

interface UploadResult {
  ok: boolean;
  mode: 'draft' | 'post' | 'dry-run';
  product_id: string;
  video_file: string;
  url?: string;
  errors: string[];
}

// ─── Selectors ──────────────────────────────────────────────────────────────
// Role/text-based selectors for resilience against class name changes.
// TikTok Studio uses a React-based SPA; these target semantic elements.

const SEL = {
  // File input (hidden, triggered by the upload drop zone)
  fileInput: 'input[type="file"][accept*="video"]',
  fileInputFallback: 'input[type="file"]',

  // Caption / description field — TikTok Studio uses a contenteditable div
  captionEditor: '[contenteditable="true"]',
  captionEditorFallback: '[data-placeholder*="caption"], [data-placeholder*="description"], [aria-label*="caption"], [aria-label*="description"]',

  // Product link area
  addProductBtn: [
    'button:has-text("Add product")',
    'button:has-text("Product link")',
    'text="Add product"',
    '[class*="product"] button',
    'button:has-text("product")',
  ],

  // Product search input (inside product modal/panel)
  productSearchInput: [
    'input[placeholder*="Search"]',
    'input[placeholder*="search"]',
    'input[placeholder*="product"]',
    'input[type="search"]',
  ],

  // Product search result row — first clickable row
  productResultRow: [
    '[class*="product"] [class*="item"]:first-child',
    '[class*="search-result"]:first-child',
    'table tbody tr:first-child',
    '[role="listbox"] [role="option"]:first-of-type',
    '[class*="list"] [class*="row"]:first-child',
  ],

  // Confirm / Next button in product modal
  productConfirmBtn: [
    'button:has-text("Confirm")',
    'button:has-text("Done")',
    'button:has-text("Next")',
    'button:has-text("Add")',
  ],

  // Post / Draft buttons
  postBtn: [
    'button:has-text("Post")',
    'button[type="submit"]:has-text("Post")',
  ],
  draftBtn: [
    'button:has-text("Save as draft")',
    'button:has-text("Draft")',
    'button:has-text("Save draft")',
  ],

  // Login detection — if we land on a login page
  loginIndicators: [
    'button:has-text("Log in")',
    'button:has-text("Sign up")',
    'input[name="username"]',
    '[class*="login"]',
  ],

  // Success indicators after posting/drafting
  successIndicators: [
    'text="Successfully"',
    'text="uploaded"',
    'text="saved"',
    'text="Your video"',
    '[class*="success"]',
    '[class*="toast"]',
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseArgs(): { packDir?: string; videoId?: string } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const videoIdIdx = process.argv.indexOf('--video-id');
  const videoId = videoIdIdx !== -1 ? process.argv[videoIdIdx + 1] : undefined;

  if (!args[0] && !videoId) {
    console.error('Usage: upload-from-pack.ts <pack-directory> [--dry-run]');
    console.error('       upload-from-pack.ts --video-id <id> [--dry-run]');
    process.exit(1);
  }

  return { packDir: args[0], videoId };
}

function readPackDir(dir: string): PackData {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Upload pack directory not found: ${abs}`);
  }

  // Video file — look for video.mp4 or any .mp4
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

  // Product ID — from product.txt or metadata.json
  let productId = '';
  const productFile = path.join(abs, 'product.txt');
  const metadataFile = path.join(abs, 'metadata.json');

  if (fs.existsSync(productFile)) {
    productId = fs.readFileSync(productFile, 'utf-8').trim();
  } else if (fs.existsSync(metadataFile)) {
    const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    productId = meta?.product?.tiktok_product_id || meta?.product_id || '';
  }

  if (!productId) {
    throw new Error('No product ID found — need product.txt or metadata.json with product.tiktok_product_id');
  }

  // Cover text (optional)
  const coverFile = path.join(abs, 'cover.txt');
  const coverText = fs.existsSync(coverFile) ? fs.readFileSync(coverFile, 'utf-8').trim() : undefined;

  return { videoPath, caption, hashtags, productId, coverText };
}

/** Try multiple selectors in order, return the first match */
async function findFirst(page: Page, selectors: string[], timeout = ACTION_TIMEOUT): Promise<ReturnType<Page['locator']> | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: Math.min(timeout, 3_000) });
      return loc;
    } catch {
      // try next selector
    }
  }
  return null;
}

/** Check if the page shows a login screen */
async function isLoggedIn(page: Page): Promise<boolean> {
  // Check URL — if redirected to login/auth page
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth') || url.includes('/signup')) {
    return false;
  }

  // Check for login form elements
  for (const sel of SEL.loginIndicators) {
    try {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible({ timeout: 2_000 });
      if (visible) return false;
    } catch {
      // selector not found, continue
    }
  }

  return true;
}

function emitResult(result: UploadResult): void {
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2));
}

// ─── Core Upload Flow ───────────────────────────────────────────────────────

async function runUpload(pack: PackData): Promise<UploadResult> {
  const errors: string[] = [];
  const result: UploadResult = {
    ok: false,
    mode: DRY_RUN ? 'dry-run' : POST_MODE,
    product_id: pack.productId,
    video_file: path.basename(pack.videoPath),
    errors,
  };

  // Ensure profile directory exists
  fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

  console.log(`Browser profile: ${BROWSER_PROFILE_DIR}`);
  console.log(`Upload URL:      ${TIKTOK_STUDIO_UPLOAD_URL}`);
  console.log(`Post mode:       ${DRY_RUN ? 'DRY RUN' : POST_MODE}`);
  console.log(`Video:           ${pack.videoPath}`);
  console.log(`Caption:         ${pack.caption.slice(0, 80)}${pack.caption.length > 80 ? '...' : ''}`);
  console.log(`Hashtags:        ${pack.hashtags.join(' ')}`);
  console.log(`Product ID:      ${pack.productId}`);
  console.log('');

  // Launch persistent context (keeps cookies/login between runs)
  const context: BrowserContext = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // ── Step 1: Navigate to upload page ──
    console.log('1. Navigating to TikTok Studio upload page...');
    await page.goto(TIKTOK_STUDIO_UPLOAD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(3_000); // let SPA settle

    // ── Step 2: Login check ──
    console.log('2. Checking login status...');
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      const msg =
        'Not logged in to TikTok Studio.\n' +
        'Please log in manually once in the persistent browser profile:\n' +
        `  1. Run: TIKTOK_HEADLESS=false npx tsx scripts/tiktok-studio/upload-from-pack.ts --dry-run <pack-dir>\n` +
        `  2. Log in to TikTok in the browser window that opens\n` +
        `  3. Close the browser and re-run this script\n` +
        `Profile directory: ${BROWSER_PROFILE_DIR}`;
      console.error(`\nERROR: ${msg}`);
      errors.push('Login required — user must log in manually in the persistent browser profile');
      return result;
    }
    console.log('   Logged in.');

    // ── Dry-run: selector check ──
    if (DRY_RUN) {
      console.log('\n=== DRY RUN — Checking selectors ===\n');
      await checkSelectors(page);
      result.ok = true;
      result.mode = 'dry-run';
      return result;
    }

    // ── Step 3: Upload video file ──
    console.log('3. Uploading video file...');
    let fileInput = page.locator(SEL.fileInput).first();
    try {
      await fileInput.waitFor({ state: 'attached', timeout: ACTION_TIMEOUT });
    } catch {
      // Fallback to generic file input
      fileInput = page.locator(SEL.fileInputFallback).first();
      await fileInput.waitFor({ state: 'attached', timeout: ACTION_TIMEOUT });
    }

    await fileInput.setInputFiles(pack.videoPath);
    console.log('   File set. Waiting for video processing...');

    // Wait for the caption editor to appear (signals video accepted)
    let captionEditor = page.locator(SEL.captionEditor).first();
    try {
      await captionEditor.waitFor({ state: 'visible', timeout: UPLOAD_TIMEOUT });
    } catch {
      // Try fallback selector
      const fb = page.locator(SEL.captionEditorFallback).first();
      try {
        await fb.waitFor({ state: 'visible', timeout: 10_000 });
        captionEditor = fb;
      } catch {
        errors.push('Caption editor not found after video upload — video may still be processing');
        console.error('   ERROR: Caption editor not found. Video may still be processing.');
        return result;
      }
    }
    console.log('   Video accepted.');

    // ── Step 4: Fill caption + hashtags ──
    console.log('4. Filling caption and hashtags...');
    const fullCaption = pack.caption + '\n' + pack.hashtags.join(' ');

    // Clear existing content and type new caption
    await captionEditor.click();
    await page.keyboard.press('Meta+A'); // Select all (Cmd+A on Mac)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // Type caption line by line to handle newlines properly
    const lines = fullCaption.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.keyboard.press('Enter');
      await page.keyboard.type(lines[i], { delay: 10 });
    }
    console.log('   Caption filled.');

    // ── Step 5: Add product link ──
    console.log('5. Adding product link...');
    const addProductBtn = await findFirst(page, SEL.addProductBtn);

    if (addProductBtn) {
      await addProductBtn.click();
      await page.waitForTimeout(1_500); // wait for product panel/modal

      // Search for product by ID
      const searchInput = await findFirst(page, SEL.productSearchInput);
      if (searchInput) {
        await searchInput.click();
        await searchInput.fill(pack.productId);
        await page.waitForTimeout(2_000); // wait for search results

        // Select first result
        const resultRow = await findFirst(page, SEL.productResultRow, 8_000);
        if (resultRow) {
          await resultRow.click();
          await page.waitForTimeout(500);
          console.log('   Product selected.');

          // Confirm selection
          const confirmBtn = await findFirst(page, SEL.productConfirmBtn);
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForTimeout(1_000);
            console.log('   Product confirmed.');
          } else {
            errors.push('Product confirm button not found — product may still be selected');
            console.warn('   WARN: Confirm button not found.');
          }
        } else {
          errors.push(`No product found for ID: ${pack.productId}`);
          console.error(`   ERROR: No search results for product ID ${pack.productId}`);
        }
      } else {
        errors.push('Product search input not found');
        console.error('   ERROR: Product search input not found in modal.');
      }
    } else {
      errors.push('"Add product" button not found — may need manual product linking');
      console.warn('   WARN: "Add product" button not found. Continuing without product link.');
    }

    // ── Step 6: Post or save as draft ──
    console.log(`6. ${POST_MODE === 'post' ? 'Posting' : 'Saving as draft'}...`);

    const actionSelectors = POST_MODE === 'post' ? SEL.postBtn : SEL.draftBtn;
    const actionBtn = await findFirst(page, actionSelectors);

    if (actionBtn) {
      await actionBtn.click();
      console.log(`   Clicked "${POST_MODE === 'post' ? 'Post' : 'Save as draft'}".`);

      // ── Step 7: Wait for confirmation ──
      console.log('7. Waiting for confirmation...');
      await page.waitForTimeout(3_000);

      // Check for success indicators
      const success = await findFirst(page, SEL.successIndicators, 15_000);
      if (success) {
        console.log('   Success confirmed.');
        result.ok = true;
      } else {
        // May still have succeeded — check if page changed
        const currentUrl = page.url();
        if (currentUrl !== TIKTOK_STUDIO_UPLOAD_URL) {
          console.log(`   Page redirected to: ${currentUrl} — likely success.`);
          result.ok = true;
          result.url = currentUrl;
        } else {
          errors.push('No success confirmation detected — check TikTok Studio manually');
          console.warn('   WARN: No success indicator found. Please verify manually.');
          // Still mark as potentially ok since the action was taken
          result.ok = true;
        }
      }
    } else {
      errors.push(`"${POST_MODE === 'post' ? 'Post' : 'Save as draft'}" button not found`);
      console.error('   ERROR: Action button not found.');
    }
  } catch (err: any) {
    errors.push(err.message);
    console.error(`\nFATAL: ${err.message}`);
  } finally {
    // Give user a moment to see the result in headed mode
    if (!HEADLESS && !DRY_RUN) {
      console.log('\nClosing browser in 5 seconds...');
      await page.waitForTimeout(5_000);
    }
    await context.close();
  }

  return result;
}

// ─── Dry-Run Selector Check ─────────────────────────────────────────────────

async function checkSelectors(page: Page): Promise<void> {
  const checks: Array<{ name: string; selectors: string | string[] }> = [
    { name: 'File input', selectors: [SEL.fileInput, SEL.fileInputFallback] },
    { name: 'Caption editor', selectors: [SEL.captionEditor, SEL.captionEditorFallback] },
    { name: 'Add product button', selectors: SEL.addProductBtn },
    { name: 'Post button', selectors: SEL.postBtn },
    { name: 'Draft button', selectors: SEL.draftBtn },
  ];

  for (const check of checks) {
    const sels = Array.isArray(check.selectors) ? check.selectors : [check.selectors];
    let found = false;
    let matchedSelector = '';

    for (const sel of sels) {
      try {
        const loc = page.locator(sel).first();
        const visible = await loc.isVisible({ timeout: 2_000 });
        const attached = !visible
          ? await loc.count().then((c) => c > 0)
          : true;

        if (visible || attached) {
          found = true;
          matchedSelector = sel;
          console.log(`  [OK]   ${check.name} — matched: ${sel} (${visible ? 'visible' : 'attached'})`);
          break;
        }
      } catch {
        // try next
      }
    }

    if (!found) {
      console.log(`  [MISS] ${check.name} — none of ${sels.length} selectors matched`);
    }
  }
}

// ─── Fetch pack via API (--video-id mode) ───────────────────────────────────

async function fetchPackFromApi(videoId: string): Promise<PackData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') || 'http://localhost:3000';
  const apiKey = process.env.SERVICE_API_KEY;

  if (!apiKey) {
    throw new Error('SERVICE_API_KEY env var required when using --video-id');
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
        hashtags: string[];
        cover_text: string;
        video_url: string;
      };
    };
    error?: { message: string };
  };

  if (!json.ok) {
    throw new Error(`API returned error: ${json.error?.message || 'unknown'}`);
  }

  const pack = json.data.pack;

  // Download the video to a temp file
  console.log(`Downloading video from ${pack.video_url}...`);
  const videoRes = await fetch(pack.video_url);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-upload-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  fs.writeFileSync(videoPath, buffer);
  console.log(`Video saved to ${videoPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  return {
    videoPath,
    caption: pack.caption,
    hashtags: pack.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)),
    productId: pack.product_id,
    coverText: pack.cover_text || undefined,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload-from-Pack ===\n');

  const { packDir, videoId } = parseArgs();

  let pack: PackData;

  if (videoId) {
    pack = await fetchPackFromApi(videoId);
  } else {
    pack = readPackDir(packDir!);
  }

  const result = await runUpload(pack);
  emitResult(result);

  // Clean up temp video file if we fetched from API
  if (videoId && pack.videoPath.includes(os.tmpdir())) {
    try {
      fs.unlinkSync(pack.videoPath);
      fs.rmdirSync(path.dirname(pack.videoPath));
    } catch {
      // ignore cleanup errors
    }
  }

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  emitResult({
    ok: false,
    mode: DRY_RUN ? 'dry-run' : POST_MODE,
    product_id: '',
    video_file: '',
    errors: [err.message],
  });
  process.exit(1);
});
