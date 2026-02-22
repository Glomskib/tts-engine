#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Product ID Mapper
 *
 * Resolves NULL tiktok_product_id on products used by the uploader.
 * Uses a confidence-scored matching pipeline:
 *
 *   1. Exact title match against already-mapped products (confidence=1.0)
 *   2. Same brand + highest title similarity (Jaccard on words, threshold ≥ 0.85)
 *   3. Title similarity alone across all mapped products (threshold ≥ 0.85)
 *
 * Products below the confidence threshold are logged as "needs_manual_mapping".
 *
 * Usage:
 *   pnpm run tiktok:product-map -- --dry-run     # report only, no writes
 *   pnpm run tiktok:product-map                   # apply confident mappings
 *   pnpm run tiktok:product-map -- --threshold 0.7  # lower confidence bar
 *
 * Exit codes:
 *   0 = all done (some may still need manual mapping)
 *   1 = error
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const THRESHOLD = (() => {
  const idx = process.argv.indexOf('--threshold');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseFloat(process.argv[idx + 1]);
    if (!isNaN(n) && n > 0 && n <= 1) return n;
  }
  return 0.85;
})();

const TAG = '[product-map]';

// ─── Supabase ───────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.`);
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

// ─── Similarity ─────────────────────────────────────────────────────────────

/** Jaccard similarity on lowercased word tokens. */
function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  tiktok_product_id: string | null;
  brand_id: string | null;
}

interface MappingResult {
  product_id: string;
  product_name: string;
  brand_id: string | null;
  brand_name: string | null;
  status: 'mapped' | 'skipped_low_confidence' | 'already_mapped' | 'needs_manual_mapping';
  matched_to?: string;
  tiktok_product_id?: string;
  confidence?: number;
  match_reason?: string;
  has_videos: boolean;
  video_count: number;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  TikTok Product ID Mapper`);
  console.log(`${'='.repeat(55)}\n`);
  console.log(`${TAG} Dry run:    ${DRY_RUN}`);
  console.log(`${TAG} Threshold:  ${THRESHOLD}\n`);

  // Fetch all products
  const { data: products, error: prodErr } = await sb
    .from('products')
    .select('id, name, tiktok_product_id, brand_id')
    .order('name');

  if (prodErr || !products) {
    console.error(`${TAG} Failed to fetch products:`, prodErr);
    process.exit(1);
  }

  // Fetch brands
  const { data: brands } = await sb.from('brands').select('id, name');
  const brandMap: Record<string, string> = {};
  for (const b of (brands || [])) brandMap[b.id] = b.name;

  // Fetch ff_products for additional TikTok ID sources
  const { data: ffProducts } = await sb
    .from('ff_products')
    .select('key, display_name, tiktok_product_id')
    .not('tiktok_product_id', 'is', null);

  // Split into mapped vs unmapped
  const mapped = products.filter((p) => p.tiktok_product_id);
  const unmapped = products.filter((p) => !p.tiktok_product_id);

  console.log(`${TAG} Total products: ${products.length}`);
  console.log(`${TAG} Already mapped: ${mapped.length}`);
  console.log(`${TAG} Need mapping:   ${unmapped.length}\n`);

  if (unmapped.length === 0) {
    console.log(`${TAG} All products have TikTok IDs. Nothing to do.`);
    process.exit(0);
  }

  // Build reference pool: mapped products + ff_products
  const referencePool: Array<{ name: string; tiktok_product_id: string; brand_id: string | null; source: string }> = [];

  for (const m of mapped) {
    referencePool.push({
      name: m.name,
      tiktok_product_id: m.tiktok_product_id!,
      brand_id: m.brand_id,
      source: `product:${m.id}`,
    });
  }

  for (const ff of (ffProducts || [])) {
    if (ff.tiktok_product_id) {
      referencePool.push({
        name: ff.display_name || ff.key,
        tiktok_product_id: ff.tiktok_product_id,
        brand_id: null,
        source: `ff_product:${ff.key}`,
      });
    }
  }

  // Process each unmapped product
  const results: MappingResult[] = [];
  let mappedCount = 0;
  let skippedCount = 0;
  let manualCount = 0;

  for (const product of unmapped) {
    const brandName = product.brand_id ? brandMap[product.brand_id] || null : null;

    // Count videos for this product
    const { count: videoCount } = await sb
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', product.id);

    const result: MappingResult = {
      product_id: product.id,
      product_name: product.name,
      brand_id: product.brand_id,
      brand_name: brandName,
      status: 'needs_manual_mapping',
      has_videos: (videoCount || 0) > 0,
      video_count: videoCount || 0,
    };

    // 1. Exact title match
    const exactMatch = referencePool.find(
      (r) => r.name.toLowerCase().trim() === product.name.toLowerCase().trim(),
    );
    if (exactMatch) {
      result.status = 'mapped';
      result.matched_to = exactMatch.name;
      result.tiktok_product_id = exactMatch.tiktok_product_id;
      result.confidence = 1.0;
      result.match_reason = `exact title match (${exactMatch.source})`;
      results.push(result);
      mappedCount++;
      continue;
    }

    // 2. Same brand + highest title similarity
    let bestMatch: { ref: (typeof referencePool)[0]; sim: number } | null = null;

    if (product.brand_id) {
      const sameBrand = referencePool.filter((r) => r.brand_id === product.brand_id);
      for (const ref of sameBrand) {
        const sim = titleSimilarity(product.name, ref.name);
        if (!bestMatch || sim > bestMatch.sim) {
          bestMatch = { ref, sim };
        }
      }
      // Brand match bonus: add 0.1 to similarity (capped at 1.0)
      if (bestMatch) {
        bestMatch.sim = Math.min(1.0, bestMatch.sim + 0.1);
      }
    }

    // 3. Title similarity across all reference products
    for (const ref of referencePool) {
      const sim = titleSimilarity(product.name, ref.name);
      if (!bestMatch || sim > bestMatch.sim) {
        bestMatch = { ref, sim };
      }
    }

    if (bestMatch && bestMatch.sim >= THRESHOLD) {
      result.status = 'mapped';
      result.matched_to = bestMatch.ref.name;
      result.tiktok_product_id = bestMatch.ref.tiktok_product_id;
      result.confidence = Math.round(bestMatch.sim * 100) / 100;
      result.match_reason = `similarity ${result.confidence} (${bestMatch.ref.source})`;
      mappedCount++;
    } else if (bestMatch && bestMatch.sim > 0) {
      result.status = 'skipped_low_confidence';
      result.matched_to = bestMatch.ref.name;
      result.confidence = Math.round(bestMatch.sim * 100) / 100;
      result.match_reason = `below threshold (${result.confidence} < ${THRESHOLD})`;
      skippedCount++;
    } else {
      result.status = 'needs_manual_mapping';
      manualCount++;
    }

    results.push(result);
  }

  // Print report
  console.log(`${'─'.repeat(55)}`);
  console.log(`  Mapping Report`);
  console.log(`${'─'.repeat(55)}\n`);

  for (const r of results) {
    const icon = r.status === 'mapped' ? 'MAP' : r.status === 'skipped_low_confidence' ? 'LOW' : 'NUL';
    const vids = r.has_videos ? ` (${r.video_count} video${r.video_count > 1 ? 's' : ''})` : '';
    console.log(`  [${icon}] ${r.product_name}${vids}`);
    if (r.brand_name) console.log(`        brand: ${r.brand_name}`);
    if (r.matched_to) console.log(`        match: ${r.matched_to} → ${r.tiktok_product_id || '?'}`);
    if (r.match_reason) console.log(`        reason: ${r.match_reason}`);
    console.log('');
  }

  console.log(`${'─'.repeat(55)}`);
  console.log(`  Summary`);
  console.log(`${'─'.repeat(55)}`);
  console.log(`  Confident maps:    ${mappedCount}`);
  console.log(`  Low confidence:    ${skippedCount}`);
  console.log(`  Needs manual:      ${manualCount}`);
  console.log(`  Already mapped:    ${mapped.length}`);
  console.log(`  Total:             ${products.length}`);
  console.log(`${'─'.repeat(55)}\n`);

  // Apply updates for confident mappings (unless dry run)
  const toUpdate = results.filter((r) => r.status === 'mapped' && r.tiktok_product_id);

  if (toUpdate.length === 0) {
    console.log(`${TAG} No confident mappings to apply.`);
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`${TAG} DRY RUN — would update ${toUpdate.length} product(s):`);
    for (const r of toUpdate) {
      console.log(`  ${r.product_name} → ${r.tiktok_product_id}`);
    }
    process.exit(0);
  }

  console.log(`${TAG} Applying ${toUpdate.length} update(s)...\n`);

  for (const r of toUpdate) {
    const { error } = await sb
      .from('products')
      .update({ tiktok_product_id: r.tiktok_product_id })
      .eq('id', r.product_id);

    if (error) {
      console.error(`  FAIL: ${r.product_name} — ${error.message}`);
    } else {
      console.log(`  OK: ${r.product_name} → ${r.tiktok_product_id}`);
    }
  }

  console.log(`\n${TAG} Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
