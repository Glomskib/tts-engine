#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload-from-Pack — CLI entry point
 *
 * Reads an Upload Pack (local dir or --video-id API fetch) and runs the
 * Phase 3 automation module to upload → fill description → attach product → save draft/post.
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id>
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack --dry-run
 *   POST_MODE=post npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack
 *   POST_NOW=true npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id>
 *
 * Env vars:
 *   TIKTOK_BROWSER_PROFILE  — Chromium profile dir (default: ~/.openclaw/browser-profiles/tiktok-studio)
 *   TIKTOK_STUDIO_UPLOAD_URL — Upload page URL (default: https://www.tiktok.com/tiktokstudio/upload)
 *   TIKTOK_HEADLESS          — 'true' for headless mode (default: false)
 *   POST_MODE                — 'draft' (default) or 'post'
 *   POST_NOW                 — 'true' to override POST_MODE to 'post'
 *   FF_API_URL               — FlashFlow API base URL for status callbacks
 *   FF_API_TOKEN             — FlashFlow API token for status callbacks
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

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Pack reading ───────────────────────────────────────────────────────────

interface RawPackData {
  videoPath: string;
  description: string;
  productId: string;
  videoId?: string; // for status callback
}

function parseArgs(): { packDir?: string; videoId?: string } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const videoIdIdx = process.argv.indexOf('--video-id');
  const videoId = videoIdIdx !== -1 ? process.argv[videoIdIdx + 1] : undefined;

  if (!args[0] && !videoId) {
    console.error('Usage: upload-from-pack.ts <pack-directory> [--dry-run]');
    console.error('       upload-from-pack.ts --video-id <id> [--dry-run]');
    console.error('');
    console.error('Env vars:');
    console.error('  POST_MODE=draft|post    — Save as draft (default) or post immediately');
    console.error('  POST_NOW=true           — Override to post mode');
    console.error('  TIKTOK_HEADLESS=true    — Run in headless mode (must be logged in)');
    console.error('  FF_API_URL=<url>        — FlashFlow API URL for status callbacks');
    console.error('  FF_API_TOKEN=<token>    — FlashFlow API token');
    process.exit(1);
  }

  return { packDir: args[0], videoId };
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

async function fetchPackFromApi(videoId: string): Promise<RawPackData> {
  const baseUrl = CONFIG.flashflowApiUrl;
  const apiKey = CONFIG.flashflowApiToken || process.env.SERVICE_API_KEY;

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

  // Download video to temp file
  console.log(`Downloading video from ${pack.video_url}...`);
  const videoRes = await fetch(pack.video_url);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);

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

// ─── Dry-run ────────────────────────────────────────────────────────────────

async function runDryRun(): Promise<void> {
  console.log('\n=== DRY RUN — Opening browser & checking selectors ===\n');
  console.log(`Browser profile: ${CONFIG.profileDir}`);
  console.log(`Upload URL:      ${CONFIG.uploadUrl}`);
  console.log(`Post mode:       ${CONFIG.postMode}\n`);

  const session = await openUploadStudio();
  if (!session) {
    console.error('ERROR: Not logged in to TikTok Studio.');
    console.error('Log in manually in headed mode, then retry.');
    console.error(`Profile: ${CONFIG.profileDir}`);
    process.exit(1);
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
  const shouldPost = CONFIG.postMode === 'post';

  console.log('=== TikTok Studio Upload-from-Pack ===\n');
  console.log(`Mode: ${shouldPost ? 'POST (will publish immediately!)' : 'DRAFT (save as draft)'}`);

  if (DRY_RUN) {
    await runDryRun();
    process.exit(0);
  }

  const { packDir, videoId } = parseArgs();

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
