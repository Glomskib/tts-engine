/**
 * Backfill: Encrypt existing plaintext TikTok OAuth tokens.
 *
 * Run once after deploying the encryption changes:
 *   npx tsx scripts/backfill-tiktok-token-encryption.ts
 *
 * Safe to run multiple times — already-encrypted rows are detected and skipped.
 * Requires DRIVE_TOKEN_ENCRYPTION_KEY env var (same key as Drive token encryption).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt, type EncryptedPayload } from '../lib/security/crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isEncrypted(value: string | null): boolean {
  if (!value) return true; // null counts as "no action needed"
  try {
    const parsed: EncryptedPayload = JSON.parse(value);
    return !!(parsed.ciphertext && parsed.iv && parsed.tag);
  } catch {
    return false; // plaintext
  }
}

async function backfillTable(tableName: string) {
  console.log(`\nProcessing ${tableName}...`);

  const { data: rows, error } = await supabase
    .from(tableName)
    .select('id, access_token, refresh_token');

  if (error) {
    console.error(`  Error reading ${tableName}:`, error.message);
    return;
  }

  if (!rows?.length) {
    console.log(`  No rows found.`);
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const needsAccessEnc = !isEncrypted(row.access_token) && row.access_token;
    const needsRefreshEnc = !isEncrypted(row.refresh_token) && row.refresh_token;

    if (!needsAccessEnc && !needsRefreshEnc) {
      skipped++;
      continue;
    }

    const updates: Record<string, string | null> = {};
    if (needsAccessEnc) {
      updates.access_token = JSON.stringify(encrypt(row.access_token));
    }
    if (needsRefreshEnc) {
      updates.refresh_token = JSON.stringify(encrypt(row.refresh_token));
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', row.id);

    if (updateError) {
      console.error(`  Error updating row ${row.id}:`, updateError.message);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`  Updated: ${updated}, Skipped (already encrypted): ${skipped}, Errors: ${errors}`);
}

async function main() {
  console.log('TikTok Token Encryption Backfill');
  console.log('==================================');

  // Verify key is configured
  if (!process.env.DRIVE_TOKEN_ENCRYPTION_KEY) {
    console.error('ERROR: DRIVE_TOKEN_ENCRYPTION_KEY is not set. Cannot encrypt tokens.');
    process.exit(1);
  }

  // Test encrypt/decrypt roundtrip
  const testPayload = 'test-token-roundtrip';
  const enc = encrypt(testPayload);
  const dec = decrypt(enc);
  if (dec !== testPayload) {
    console.error('ERROR: Encryption roundtrip failed. Check DRIVE_TOKEN_ENCRYPTION_KEY.');
    process.exit(1);
  }
  console.log('Encryption roundtrip: OK');

  // Backfill all 4 TikTok token tables
  const tables = [
    'tiktok_connections',
    'tiktok_login_connections',
    'tiktok_content_posting',
    'tiktok_shop_connections',
  ];

  for (const table of tables) {
    await backfillTable(table);
  }

  console.log('\nBackfill complete.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
