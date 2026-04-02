#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * draft-content-items.ts
 *
 * Pulls queued content_items, downloads their videos to temp dirs, and
 * delegates each upload to upload-from-pack.ts.
 *
 * Usage:
 *   npx tsx scripts/tiktok-studio/draft-content-items.ts [options]
 *
 * Options:
 *   --mode   draft|post   (default: draft)
 *   --item-ids id1,id2    comma-separated IDs to process (default: all queued)
 *   --dry-run             skip actual uploads, just log what would happen
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// Load .env.local first, then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

const mode = getArg('--mode') || 'draft';
const rawItemIds = getArg('--item-ids');
const itemIdsFilter: string[] = rawItemIds ? rawItemIds.split(',').map(s => s.trim()).filter(Boolean) : [];
const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log('[draft-content-items] DRY RUN — no uploads will be performed');
}
console.log(`[draft-content-items] mode=${mode} itemIds=${itemIdsFilter.length > 0 ? itemIdsFilter.join(',') : '(all queued)'}`);

// ── Supabase client ───────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[draft-content-items] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ── Preflight: session health ─────────────────────────────────────────────────

async function checkSessionHealth(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/tiktok/session-health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.valid === true || json.ok === true || json.is_valid === true;
  } catch (err) {
    console.error('[draft-content-items] Session health check failed:', err?.message || err);
    return false;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchQueuedItems() {
  let query = supabase
    .from('content_items')
    .select(`
      id,
      title,
      caption,
      hashtags,
      primary_hook,
      final_video_url,
      tiktok_draft_account_id,
      products:product_id(name, tiktok_product_id, link_code)
    `);

  if (itemIdsFilter.length > 0) {
    query = query.in('id', itemIdsFilter);
  } else {
    query = query.eq('tiktok_draft_status', 'queued');
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch content items: ${error.message}`);
  return data || [];
}

async function markCompleted(id: string) {
  await supabase
    .from('content_items')
    .update({
      tiktok_draft_status: 'completed',
      tiktok_draft_completed_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function markFailed(id: string, errorMessage: string) {
  await supabase
    .from('content_items')
    .update({
      tiktok_draft_status: 'failed',
      tiktok_draft_error: errorMessage,
    })
    .eq('id', id);
}

// ── File helpers ──────────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ── Upload runner ─────────────────────────────────────────────────────────────

const scriptPath = path.resolve(process.cwd(), 'scripts/tiktok-studio/upload-from-pack.ts');

function runUpload(tmpDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'npx',
      ['tsx', scriptPath, tmpDir, '--mode', mode],
      {
        timeout: 5 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024,
        cwd: process.cwd(),
      },
      (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (err) {
          reject(new Error(err.message || 'upload-from-pack exited with error'));
        } else {
          resolve();
        }
      },
    );

    child.on('error', (e) => reject(e));
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Session preflight
  console.log('[draft-content-items] Checking TikTok session health...');
  const sessionOk = await checkSessionHealth();
  if (!sessionOk) {
    console.error('[draft-content-items] TikTok session is not valid. Exiting with code 42.');
    process.exit(42);
  }
  console.log('[draft-content-items] Session OK.');

  // 2. Fetch items
  let items;
  try {
    items = await fetchQueuedItems();
  } catch (err) {
    console.error('[draft-content-items] Failed to fetch items:', err?.message || err);
    process.exit(1);
  }

  if (items.length === 0) {
    console.log('[draft-content-items] No items to process.');
    process.exit(0);
  }

  console.log(`[draft-content-items] Processing ${items.length} item(s)...`);

  let succeeded = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const item of items) {
    console.log(`\n[draft-content-items] → ${item.id} "${item.title}"`);

    // Skip if no video
    if (!item.final_video_url) {
      console.warn(`[draft-content-items]   SKIP: no final_video_url`);
      failures.push(`${item.id}: no final_video_url`);
      failed++;
      continue;
    }

    const tmpDir = path.join(os.tmpdir(), `ff-draft-${item.id}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Download video
      const videoPath = path.join(tmpDir, 'video.mp4');
      console.log(`[draft-content-items]   Downloading video...`);
      await downloadFile(item.final_video_url, videoPath);

      // Write caption
      const captionText = item.caption || item.primary_hook || '';
      fs.writeFileSync(path.join(tmpDir, 'caption.txt'), captionText, 'utf8');

      // Write hashtags — ensure #ad is present
      const hashtags: string[] = Array.isArray(item.hashtags) ? item.hashtags : [];
      const hasAd = hashtags.some(h => h.toLowerCase() === '#ad');
      if (!hasAd) hashtags.push('#ad');
      fs.writeFileSync(path.join(tmpDir, 'hashtags.txt'), hashtags.join(' '), 'utf8');

      if (dryRun) {
        console.log(`[draft-content-items]   DRY RUN: would run upload-from-pack ${tmpDir} --mode ${mode}`);
        await markCompleted(item.id);
        succeeded++;
      } else {
        console.log(`[draft-content-items]   Running upload-from-pack...`);
        await runUpload(tmpDir);
        await markCompleted(item.id);
        console.log(`[draft-content-items]   OK`);
        succeeded++;
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[draft-content-items]   FAILED: ${msg}`);
      await markFailed(item.id, msg);
      failures.push(`${item.id}: ${msg}`);
      failed++;
    } finally {
      cleanupDir(tmpDir);
    }
  }

  // Summary
  console.log(`\n[draft-content-items] Done. ${succeeded} succeeded, ${failed} failed.`);
  if (failures.length > 0) {
    console.error('[draft-content-items] Failures:');
    for (const f of failures) console.error(`  - ${f}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[draft-content-items] Unhandled error:', err);
  process.exit(1);
});
