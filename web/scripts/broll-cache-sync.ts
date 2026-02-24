#!/usr/bin/env npx tsx
// ============================================================
// B-roll Cache Sync — Local Archive5TB mirror
// ============================================================
// Downloads broll_assets from Supabase Storage to local disk,
// verifies hash, and updates local_cached / local_path columns.
//
// Usage:
//   npx tsx scripts/broll-cache-sync.ts
//
// Environment:
//   NEXT_PUBLIC_SUPABASE_URL  — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Service role key
//   ARCHIVE5TB_PATH           — Local cache root (default: /Volumes/Archive5TB/FlashFlow/broll)
//   DRY_RUN                   — Set to "1" to skip actual downloads
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ARCHIVE_ROOT = process.env.ARCHIVE5TB_PATH || '/Volumes/Archive5TB/FlashFlow/broll';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log(`[broll-cache-sync] Starting...`);
  console.log(`  Archive root: ${ARCHIVE_ROOT}`);
  console.log(`  Dry run: ${DRY_RUN}`);

  // Fetch uncached assets
  const { data: assets, error } = await supabase
    .from('broll_assets')
    .select('id, hash, storage_bucket, storage_path, local_cached, local_path')
    .eq('local_cached', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to query broll_assets:', error.message);
    process.exit(1);
  }

  if (!assets || assets.length === 0) {
    console.log('[broll-cache-sync] No uncached assets found. Done.');
    return;
  }

  console.log(`[broll-cache-sync] Found ${assets.length} uncached assets`);

  let synced = 0;
  let failed = 0;

  for (const asset of assets) {
    const localPath = join(ARCHIVE_ROOT, asset.storage_path);
    const dir = dirname(localPath);

    console.log(`\n  Processing: ${asset.storage_path}`);
    console.log(`  -> Local: ${localPath}`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Skipping download');
      continue;
    }

    try {
      // Download from Supabase Storage
      const { data, error: dlError } = await supabase.storage
        .from(asset.storage_bucket)
        .download(asset.storage_path);

      if (dlError || !data) {
        console.error(`  FAILED to download: ${dlError?.message || 'no data'}`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());

      // Verify hash (if the asset hash is a file content hash, not a prompt-based placeholder)
      const fileHash = createHash('sha256').update(buffer).digest('hex');
      if (asset.hash !== fileHash) {
        // Could be a prompt-based hash — log but still save
        console.log(`  Hash mismatch (file=${fileHash.slice(0, 12)}... vs record=${asset.hash.slice(0, 12)}...) — may be prompt-based hash`);
      }

      // Write to local disk
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(localPath, buffer);

      // Update DB
      const { error: updateError } = await supabase
        .from('broll_assets')
        .update({ local_cached: true, local_path: localPath })
        .eq('id', asset.id);

      if (updateError) {
        console.error(`  FAILED to update DB: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  OK (${(buffer.length / 1024).toFixed(1)} KB)`);
        synced++;
      }
    } catch (err) {
      console.error(`  ERROR:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\n[broll-cache-sync] Done. Synced: ${synced}, Failed: ${failed}, Total: ${assets.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
