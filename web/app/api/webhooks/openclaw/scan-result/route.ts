/**
 * Webhook: OpenClaw Creator Scan Results
 *
 * POST /api/webhooks/openclaw/scan-result
 *
 * OpenClaw calls this endpoint when a creator scan completes.
 * Authenticated via OPENCLAW_API_KEY in the Authorization header.
 *
 * Flow:
 *   OpenClaw finishes scanning a creator's showcase/products
 *   → POSTs normalized product observations here
 *   → FlashFlow deduplicates, scores, and creates opportunities
 *   → Updates creator_scan_log with results
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ingestBatch } from '@/lib/opportunity-radar/ingestion';
import { logScanResult } from '@/lib/opportunity-radar/scheduler';
import { computeProductFingerprint, hasFingerPrintChanged } from '@/lib/opportunity-radar/fingerprint';
import type { IngestObservationInput } from '@/lib/opportunity-radar/ingestion';

export const runtime = 'nodejs';
export const maxDuration = 120;

const LOG = '[webhook/openclaw/scan-result]';

interface ScanResultPayload {
  creator_source_id: string;
  scan_id?: string;
  status: 'completed' | 'error' | 'no_products';
  error_message?: string;
  duration_ms?: number;
  products?: Array<{
    product_name: string;
    brand_name?: string | null;
    product_url?: string | null;
    product_image_url?: string | null;
    confidence?: 'high' | 'medium' | 'low';
    creator_has_posted?: boolean;
  }>;
}

export async function POST(request: Request) {
  // ── Auth ──
  const apiKey = process.env.OPENCLAW_API_KEY;
  if (!apiKey) {
    console.error(`${LOG} OPENCLAW_API_KEY not configured`);
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse payload ──
  let payload: ScanResultPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { creator_source_id, status, error_message, duration_ms, products } = payload;

  if (!creator_source_id) {
    return NextResponse.json({ error: 'creator_source_id is required' }, { status: 400 });
  }

  // ── Verify creator source exists ──
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('creator_sources')
    .select('id, platform, handle, last_source_fingerprint')
    .eq('id', creator_source_id)
    .maybeSingle();

  if (srcErr || !source) {
    return NextResponse.json({ error: 'Creator source not found' }, { status: 404 });
  }

  // ── Handle error scans ──
  if (status === 'error') {
    console.warn(`${LOG} scan error for @${source.handle}: ${error_message}`);
    await logScanResult(creator_source_id, {
      status: 'error',
      duration_ms: duration_ms ?? 0,
      error_message: error_message ?? 'Unknown error from OpenClaw',
    });
    return NextResponse.json({ ok: true, action: 'error_logged' });
  }

  // ── Handle no products ──
  if (status === 'no_products' || !products || products.length === 0) {
    await logScanResult(creator_source_id, {
      status: 'no_change',
      products_found: 0,
      new_observations: 0,
      duration_ms: duration_ms ?? 0,
    });
    return NextResponse.json({ ok: true, action: 'no_change' });
  }

  // ── Fingerprint comparison — short-circuit if unchanged ──
  const fingerprint = computeProductFingerprint(products as import('@/lib/openclaw/client').CreatorScanProduct[]);
  if (!hasFingerPrintChanged(source.last_source_fingerprint, fingerprint)) {
    await logScanResult(creator_source_id, {
      status: 'no_change',
      scan_mode: 'full_fetch',
      changed: false,
      fingerprint,
      products_found: products.length,
      new_observations: 0,
      duration_ms: duration_ms ?? 0,
    });
    console.log(`${LOG} @${source.handle} fingerprint unchanged — skipping ingestion`);
    return NextResponse.json({ ok: true, action: 'no_change_fingerprint_match' });
  }

  // ── Find all workspaces watching this creator ──
  const { data: watchers, error: watchErr } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id, workspace_id')
    .eq('creator_source_id', creator_source_id)
    .eq('is_active', true);

  if (watchErr) {
    console.error(`${LOG} failed to fetch watchers:`, watchErr.message);
    return NextResponse.json({ error: 'Failed to fetch watchers' }, { status: 500 });
  }

  if (!watchers || watchers.length === 0) {
    // Source has no active watchers — log the scan but skip ingestion
    await logScanResult(creator_source_id, {
      status: 'no_change',
      products_found: products.length,
      new_observations: 0,
      duration_ms: duration_ms ?? 0,
    });
    return NextResponse.json({ ok: true, action: 'no_active_watchers' });
  }

  // ── Ingest observations for each watching workspace ──
  const observations: IngestObservationInput[] = products.map((p) => ({
    product_name: p.product_name,
    brand_name: p.brand_name ?? null,
    product_url: p.product_url ?? null,
    product_image_url: p.product_image_url ?? null,
    confidence: p.confidence ?? 'medium',
    creator_has_posted: p.creator_has_posted ?? false,
    source_label: 'openclaw',
  }));

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const watcher of watchers) {
    try {
      const result = await ingestBatch(
        watcher.workspace_id,
        watcher.id, // creator watchlist ID (= creator_id in observations)
        observations,
        creator_source_id,
      );
      totalCreated += result.created;
      totalUpdated += result.updated;
    } catch (err) {
      console.error(
        `${LOG} ingestion failed for workspace ${watcher.workspace_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Update fingerprint on source ──
  await supabaseAdmin
    .from('creator_sources')
    .update({
      last_source_fingerprint: fingerprint,
      last_full_fetch_at: new Date().toISOString(),
      consecutive_no_change: 0,
    })
    .eq('id', creator_source_id);

  // ── Log scan result ──
  await logScanResult(creator_source_id, {
    status: totalCreated > 0 ? 'new_products' : totalUpdated > 0 ? 'updated' : 'no_change',
    scan_mode: 'full_fetch',
    changed: true,
    fingerprint,
    products_found: products.length,
    new_observations: totalCreated,
    observations_updated: totalUpdated,
    duration_ms: duration_ms ?? 0,
  });

  console.log(
    `${LOG} @${source.handle} scan complete — ${products.length} products, ` +
      `${totalCreated} new, ${totalUpdated} updated across ${watchers.length} workspace(s)`,
  );

  return NextResponse.json({
    ok: true,
    products_found: products.length,
    observations_created: totalCreated,
    observations_updated: totalUpdated,
    workspaces_notified: watchers.length,
  });
}
