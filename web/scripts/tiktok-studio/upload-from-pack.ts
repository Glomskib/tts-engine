#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Studio Upload-from-Pack — CLI entry point
 *
 * Reads an Upload Pack (local dir or --video-id API fetch) and runs the
 * Phase 3 automation module to upload → fill description → attach product → save draft.
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id <id>
 *   npx tsx scripts/tiktok-studio/upload-from-pack.ts /path/to/upload-pack --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  CONFIG,
  runUploadToDraft,
  openUploadStudio,
  closeSession,
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
}

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
    productId = fs.readFileSync(productFile, 'utf-8').trim();
  } else if (fs.existsSync(metadataFile)) {
    const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    productId = meta?.product?.tiktok_product_id || meta?.product_id || '';
  }

  if (!productId) {
    throw new Error('No product ID found — need product.txt or metadata.json with product.tiktok_product_id');
  }

  return { videoPath, description, productId };
}

async function fetchPackFromApi(videoId: string): Promise<RawPackData> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') ||
    'http://localhost:3000';
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
        description: string;
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

  return {
    videoPath,
    description,
    productId: pack.product_id,
  };
}

// ─── Dry-run ────────────────────────────────────────────────────────────────

async function runDryRun(): Promise<void> {
  console.log('\n=== DRY RUN — Opening browser & checking selectors ===\n');
  console.log(`Browser profile: ${CONFIG.profileDir}`);
  console.log(`Upload URL:      ${CONFIG.uploadUrl}\n`);

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

  await closeSession(session);
  console.log('\nDry run complete.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== TikTok Studio Upload-from-Pack (Phase 3) ===\n');

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

  console.log(`Video:       ${pack.videoPath}`);
  console.log(`Description: ${pack.description.slice(0, 80)}${pack.description.length > 80 ? '...' : ''}`);
  console.log(`Product ID:  ${pack.productId}`);
  console.log(`Mode:        draft-only\n`);

  const input: StudioUploadInput = {
    videoPath: pack.videoPath,
    description: pack.description,
    productId: pack.productId,
  };

  const result = await runUploadToDraft(input);

  // Emit JSON result
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2));

  // Clean up temp video if fetched from API
  if (videoId && pack.videoPath.includes(os.tmpdir())) {
    try {
      fs.unlinkSync(pack.videoPath);
      fs.rmdirSync(path.dirname(pack.videoPath));
    } catch { /* ignore */ }
  }

  process.exit(result.status === 'drafted' ? 0 : 1);
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
