#!/usr/bin/env npx tsx
// @ts-nocheck — standalone CLI script, not part of Next.js build
/**
 * TikTok Nightly Selector — CLI orchestrator
 *
 * Ensures the video queue is never empty by selecting products via rotation,
 * then calling the auto-generate API to trigger the full pipeline (script gen
 * + scoring + TTS + HeyGen render). The check-renders cron moves completed
 * renders to READY_TO_POST for nightly-draft to pick up.
 *
 * Exit codes:
 *   0  = all products enqueued (or queue sufficient)
 *   1  = some products failed
 *
 * Env vars:
 *   MAX_PER_DAY          — max videos to enqueue per run (default: 3)
 *   EXCLUDE_DAYS         — soft-exclude products with content in last N days (default: 2)
 *   DRY_RUN              — '1' to skip API calls
 *   PIPELINE_BASE_URL    — base URL for auto-generate API (default: https://flashflowai.com)
 *   CRON_SECRET          — auth token for auto-generate endpoint
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *   SERVICE_USER_ID      — user_id for posting_queue inserts
 *
 * Usage:
 *   pnpm run tiktok:selector
 *   DRY_RUN=1 pnpm run tiktok:selector
 *   MAX_PER_DAY=1 pnpm run tiktok:selector
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TAG = '[nightly-selector]';
const EXIT_OK = 0;
const EXIT_ERROR = 1;

const MAX_PER_DAY = Number(process.env.MAX_PER_DAY) || 3;
const EXCLUDE_DAYS = Number(process.env.EXCLUDE_DAYS) || 2;
const DRY_RUN = process.env.DRY_RUN === '1';
const BASE_URL = process.env.PIPELINE_BASE_URL || 'https://flashflowai.com';
const CRON_SECRET = process.env.CRON_SECRET;
const SERVICE_USER_ID = process.env.SERVICE_USER_ID;
const RECENT_QUEUE_HOURS = 48;

const WEB_DIR = process.cwd();
const LOG_DIR = path.join(WEB_DIR, 'data', 'sessions', 'logs');

// ─── Supabase client ────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${TAG} SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`);
  process.exit(EXIT_ERROR);
}

if (!CRON_SECRET) {
  console.error(`${TAG} CRON_SECRET is required.`);
  process.exit(EXIT_ERROR);
}

if (!SERVICE_USER_ID) {
  console.error(`${TAG} SERVICE_USER_ID is required for posting_queue inserts.`);
  process.exit(EXIT_ERROR);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductCandidate {
  id: string;
  name: string;
  brand: string | null;
  tiktok_product_id: string | null;
  rotation_score: number | null;
  last_content_at: string | null;
}

interface ItemReport {
  product_id: string;
  product_name: string;
  brand: string | null;
  tiktok_product_id: string | null;
  video_id: string | null;
  posting_queue_id: string | null;
  status: 'enqueued' | 'failed' | 'skipped';
  error?: string;
}

interface SelectorReport {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  config: {
    max_per_day: number;
    exclude_days: number;
    dry_run: boolean;
    base_url: string;
  };
  queue_before: number;
  queue_after: number;
  items: ItemReport[];
  summary: {
    selected: number;
    skipped_recent: number;
    queued: number;
    failed: number;
    product_ids: string[];
  };
}

// ─── Step 1: Count Queue Deficit ────────────────────────────────────────────

async function countCurrentPipeline(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .in('recording_status', ['AI_RENDERING', 'READY_TO_POST'])
    .in('status', ['ready_to_post', 'needs_edit'])
    .gte('created_at', cutoff);

  if (error) {
    throw new Error(`Queue count query error: ${error.message}`);
  }

  return count || 0;
}

// ─── Step 2: Select Eligible Products ───────────────────────────────────────

async function fetchEligibleProducts(): Promise<ProductCandidate[]> {
  // Join with ff_products isn't needed — tiktok_product_id is on products table
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, tiktok_product_id, rotation_score, last_content_at')
    .not('tiktok_product_id', 'is', null)
    .order('last_content_at', { ascending: true, nullsFirst: true })
    .order('rotation_score', { ascending: false });

  if (error) {
    throw new Error(`Product query error: ${error.message}`);
  }

  return data || [];
}

// ─── Step 3: Get Last Video's Product ───────────────────────────────────────

async function getLastVideoProductId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('videos')
    .select('product_id')
    .not('product_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.product_id;
}

// ─── Step 3: Rotation Logic ─────────────────────────────────────────────────

function applyRotation(
  candidates: ProductCandidate[],
  lastProductId: string | null,
  excludeDays: number,
): ProductCandidate[] {
  if (candidates.length === 0) return [];

  const result = [...candidates];

  // Avoid consecutive same-product: move top candidate to the back
  if (lastProductId && result[0]?.id === lastProductId && result.length > 1) {
    const moved = result.shift()!;
    result.push(moved);
    console.log(`${TAG} Rotated ${moved.name} to back (consecutive avoidance)`);
  }

  // Soft-exclude products with content in last EXCLUDE_DAYS
  const cutoff = Date.now() - excludeDays * 24 * 3_600_000;
  const fresh: ProductCandidate[] = [];
  const recent: ProductCandidate[] = [];

  for (const p of result) {
    if (p.last_content_at && new Date(p.last_content_at).getTime() > cutoff) {
      recent.push(p);
    } else {
      fresh.push(p);
    }
  }

  // Prefer fresh products, but fall through to recent if all are recent
  if (fresh.length > 0) {
    return [...fresh, ...recent];
  }

  console.log(`${TAG} All products have recent content — falling through`);
  return result;
}

// ─── Step 3b: Skip products queued in last 48h ─────────────────────────────

async function getRecentlyQueuedProductIds(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - RECENT_QUEUE_HOURS * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from('posting_queue')
    .select('platform_metadata')
    .eq('platform', 'tiktok')
    .gte('created_at', cutoff);

  if (error) {
    console.error(`${TAG} posting_queue query error: ${error.message}`);
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of data || []) {
    const pid = (row.platform_metadata as any)?.product_id;
    if (pid) ids.add(pid);
  }
  return ids;
}

// ─── Insert into posting_queue ──────────────────────────────────────────────

async function insertPostingQueue(
  videoId: string,
  product: ProductCandidate,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('posting_queue')
    .insert({
      user_id: SERVICE_USER_ID,
      platform: 'tiktok',
      status: 'draft',
      video_id: videoId,
      platform_metadata: {
        product_id: product.id,
        tiktok_product_id: product.tiktok_product_id,
        recording_status: 'READY_TO_POST',
        source: 'nightly-selector',
        queued_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error(`${TAG} posting_queue insert error: ${error.message}`);
    return null;
  }

  return data?.id ?? null;
}

// ─── Update video recording_status ──────────────────────────────────────────

async function markVideoReadyToPost(videoId: string): Promise<void> {
  const { error } = await supabase
    .from('videos')
    .update({ recording_status: 'READY_TO_POST' })
    .eq('id', videoId);

  if (error) {
    console.error(`${TAG} Failed to set recording_status for ${videoId}: ${error.message}`);
  }
}

// ─── Step 4: Trigger Auto-Generate ──────────────────────────────────────────

interface AutoGenerateResult {
  video_id: string | null;
  ok: boolean;
  error?: string;
}

async function triggerAutoGenerate(productId: string): Promise<AutoGenerateResult> {
  const url = `${BASE_URL}/api/pipeline/auto-generate`;
  const correlationId = `nightly-selector-${Date.now()}-${productId.slice(0, 8)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({ productId, renderProvider: 'heygen' }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      video_id: null,
      ok: false,
      error: body?.error || body?.message || `HTTP ${res.status}`,
    };
  }

  return {
    video_id: body?.data?.video_id || null,
    ok: true,
  };
}

// ─── Write video_events row ─────────────────────────────────────────────────

async function writeVideoEvent(videoId: string, productId: string): Promise<void> {
  const { error } = await supabase.from('video_events').insert({
    video_id: videoId,
    event_type: 'nightly_selector_enqueued',
    actor: 'nightly_selector_job',
    details: { source: 'nightly-selector.ts', product_id: productId },
  });

  if (error) {
    console.error(`${TAG} Failed to write video_event for ${videoId}: ${error.message}`);
  }
}

// ─── Write report JSON ──────────────────────────────────────────────────────

function writeReport(report: SelectorReport): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(LOG_DIR, `selector-${ts}.json`);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`${TAG} Report written → ${filepath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TikTok Nightly Selector — ${startedAt.toISOString().slice(0, 10)}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`${TAG} Max per day:   ${MAX_PER_DAY}`);
  console.log(`${TAG} Exclude days:  ${EXCLUDE_DAYS}`);
  console.log(`${TAG} Dry run:       ${DRY_RUN}`);
  console.log(`${TAG} Base URL:      ${BASE_URL}`);
  console.log('');

  // Step 1: Count queue deficit
  console.log(`${TAG} Counting current pipeline videos...`);
  const queueBefore = await countCurrentPipeline();
  const deficit = Math.max(0, MAX_PER_DAY - queueBefore);

  console.log(`${TAG} Queue: ${queueBefore} in pipeline, deficit: ${deficit}`);

  if (deficit <= 0) {
    console.log(`${TAG} Queue sufficient (${queueBefore} >= ${MAX_PER_DAY}). Nothing to do.`);
    const report: SelectorReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      config: { max_per_day: MAX_PER_DAY, exclude_days: EXCLUDE_DAYS, dry_run: DRY_RUN, base_url: BASE_URL },
      queue_before: queueBefore,
      queue_after: queueBefore,
      items: [],
      summary: { selected: 0, skipped_recent: 0, queued: 0, failed: 0, product_ids: [] },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  // Step 2: Fetch eligible products
  console.log(`${TAG} Fetching eligible products (tiktok_product_id IS NOT NULL)...`);
  const allProducts = await fetchEligibleProducts();

  if (allProducts.length === 0) {
    console.log(`${TAG} No eligible products found. Nothing to do.`);
    const report: SelectorReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      config: { max_per_day: MAX_PER_DAY, exclude_days: EXCLUDE_DAYS, dry_run: DRY_RUN, base_url: BASE_URL },
      queue_before: queueBefore,
      queue_after: queueBefore,
      items: [],
      summary: { selected: 0, skipped_recent: 0, queued: 0, failed: 0, product_ids: [] },
    };
    writeReport(report);
    process.exit(EXIT_OK);
  }

  console.log(`${TAG} Found ${allProducts.length} eligible product(s)`);

  // Step 2b: Skip products already queued in last 48h
  console.log(`${TAG} Checking posting_queue for recently used products (${RECENT_QUEUE_HOURS}h)...`);
  const recentlyQueued = await getRecentlyQueuedProductIds();
  const skippedRecent: ProductCandidate[] = [];
  const freshProducts = allProducts.filter((p) => {
    if (recentlyQueued.has(p.id)) {
      skippedRecent.push(p);
      return false;
    }
    return true;
  });

  if (skippedRecent.length > 0) {
    console.log(`${TAG} Skipped ${skippedRecent.length} product(s) queued in last ${RECENT_QUEUE_HOURS}h:`);
    for (const p of skippedRecent) {
      console.log(`  - ${p.brand ? `${p.brand} — ` : ''}${p.name}`);
    }
  }

  // Step 3: Apply rotation
  const lastProductId = await getLastVideoProductId();
  const rotated = applyRotation(freshProducts, lastProductId, EXCLUDE_DAYS);
  const selected = rotated.slice(0, deficit);

  console.log(`${TAG} Selected ${selected.length} product(s) for generation:\n`);
  for (const p of selected) {
    const label = p.brand ? `${p.brand} — ${p.name}` : p.name;
    const lastAt = p.last_content_at ? new Date(p.last_content_at).toISOString().slice(0, 10) : 'never';
    console.log(`  - ${label} (last: ${lastAt}, score: ${p.rotation_score ?? 'N/A'})`);
  }
  console.log('');

  // DRY_RUN: log what would happen and exit
  if (DRY_RUN) {
    console.log(`${TAG} DRY RUN — would trigger ${selected.length} auto-generate call(s).`);
    const report: SelectorReport = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      config: { max_per_day: MAX_PER_DAY, exclude_days: EXCLUDE_DAYS, dry_run: true, base_url: BASE_URL },
      queue_before: queueBefore,
      queue_after: queueBefore,
      items: selected.map((p) => ({
        product_id: p.id,
        product_name: p.name,
        brand: p.brand,
        tiktok_product_id: p.tiktok_product_id,
        video_id: null,
        posting_queue_id: null,
        status: 'skipped' as const,
        error: 'dry_run',
      })),
      summary: {
        selected: selected.length,
        skipped_recent: skippedRecent.length,
        queued: 0,
        failed: 0,
        product_ids: selected.map((p) => p.id),
      },
    };
    writeReport(report);
    console.log(`\n${JSON.stringify({ selected: selected.length, skipped_recent: skippedRecent.length, queued: 0 }, null, 2)}`);
    process.exit(EXIT_OK);
  }

  // ── Step 4: Trigger auto-generate per product ─────────────────────────

  const itemReports: ItemReport[] = [];
  let finalExitCode = EXIT_OK;

  for (let i = 0; i < selected.length; i++) {
    const product = selected[i];
    const num = `[${i + 1}/${selected.length}]`;
    const label = product.brand ? `${product.brand} — ${product.name}` : product.name;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${TAG} ${num} Triggering auto-generate for: ${label}`);
    console.log(`${'─'.repeat(50)}`);

    try {
      const result = await triggerAutoGenerate(product.id);

      if (result.ok && result.video_id) {
        console.log(`${TAG} ${num} Enqueued — video_id: ${result.video_id}`);
        await writeVideoEvent(result.video_id, product.id);

        // Insert into posting_queue
        const queueId = await insertPostingQueue(result.video_id, product);
        if (queueId) {
          console.log(`${TAG} ${num} Queued → posting_queue id: ${queueId}`);
          await markVideoReadyToPost(result.video_id);
        } else {
          console.error(`${TAG} ${num} posting_queue insert failed (video still in pipeline)`);
        }

        itemReports.push({
          product_id: product.id,
          product_name: product.name,
          brand: product.brand,
          tiktok_product_id: product.tiktok_product_id,
          video_id: result.video_id,
          posting_queue_id: queueId,
          status: 'enqueued',
        });
      } else {
        console.error(`${TAG} ${num} Failed: ${result.error}`);
        itemReports.push({
          product_id: product.id,
          product_name: product.name,
          brand: product.brand,
          tiktok_product_id: product.tiktok_product_id,
          video_id: result.video_id,
          posting_queue_id: null,
          status: 'failed',
          error: result.error,
        });
        finalExitCode = EXIT_ERROR;
      }
    } catch (err: any) {
      console.error(`${TAG} ${num} Exception: ${err.message}`);
      itemReports.push({
        product_id: product.id,
        product_name: product.name,
        brand: product.brand,
        tiktok_product_id: product.tiktok_product_id,
        video_id: null,
        posting_queue_id: null,
        status: 'failed',
        error: err.message,
      });
      finalExitCode = EXIT_ERROR;
    }
  }

  // ── Step 5: Write report + summary ────────────────────────────────────

  const finishedAt = new Date();
  const queued = itemReports.filter((r) => r.status === 'enqueued').length;
  const failed = itemReports.filter((r) => r.status === 'failed').length;

  const report: SelectorReport = {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    config: { max_per_day: MAX_PER_DAY, exclude_days: EXCLUDE_DAYS, dry_run: false, base_url: BASE_URL },
    queue_before: queueBefore,
    queue_after: queueBefore + queued,
    items: itemReports,
    summary: {
      selected: selected.length,
      skipped_recent: skippedRecent.length,
      queued,
      failed,
      product_ids: itemReports
        .filter((r) => r.status === 'enqueued')
        .map((r) => r.product_id),
    },
  };

  writeReport(report);

  // JSON summary as requested
  const jsonSummary = {
    selected: selected.length,
    skipped_recent: skippedRecent.length,
    queued,
  };

  const durationSec = (report.duration_ms / 1000).toFixed(0);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Nightly Selector Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Duration:       ${durationSec}s`);
  console.log(`  Selected:       ${selected.length}`);
  console.log(`  Skipped recent: ${skippedRecent.length}`);
  console.log(`  Queued:         ${queued}`);
  console.log(`  Failed:         ${failed}`);
  console.log(`  Queue:          ${queueBefore} → ${queueBefore + queued}`);
  console.log(`  Exit code:      ${finalExitCode}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n${JSON.stringify(jsonSummary, null, 2)}\n`);

  process.exit(finalExitCode);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(EXIT_ERROR);
});
