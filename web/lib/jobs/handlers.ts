/**
 * Job Queue — Handler Registry
 *
 * Maps job types to their handler functions.
 */

import type { Job, JobHandler, JobType } from './types';
import { detectWinners } from '@/lib/content-intelligence/winners';
import { analyzeAndStoreSuggestions } from '@/lib/editing/analyzeTranscript';
import { replicatePattern } from '@/lib/content-intelligence/replicatePattern';
import { generateEditorNotesForItem } from '@/lib/editing/generateEditorNotesJob';
import { renderContentItem } from '@/lib/editing/render-plan';
import { logScanResult, logProbeResult } from '@/lib/opportunity-radar/scheduler';
import { ingestBatch } from '@/lib/opportunity-radar/ingestion';
import { requestCreatorScan, probeCreator } from '@/lib/openclaw/client';
import { computeProductFingerprint, hasFingerPrintChanged } from '@/lib/opportunity-radar/fingerprint';
import { exportContentItemToTikTokDraft } from '@/lib/tiktok-draft-export';

const handlers: Record<JobType, JobHandler> = {
  detect_winners: async (job: Job) => {
    const daysBack = (job.payload.days_back as number) || 30;
    const result = await detectWinners(job.workspace_id, { daysBack });
    return result as unknown as Record<string, unknown>;
  },

  analyze_transcript: async (job: Job) => {
    const contentItemId = job.payload.content_item_id as string;
    if (!contentItemId) throw new Error('content_item_id required');
    const result = await analyzeAndStoreSuggestions(contentItemId, job.workspace_id);
    return { suggestions_count: result.suggestions.length, stored: result.stored };
  },

  generate_script: async (job: Job) => {
    // Placeholder — script generation is handled synchronously via the generate-skit API
    // This handler exists for future async script generation
    return { status: 'not_implemented', payload: job.payload };
  },

  refresh_metrics: async (job: Job) => {
    // Placeholder — metrics refresh is handled by the metrics-sync cron
    // This handler exists for on-demand single-workspace refresh
    return { status: 'not_implemented', workspace_id: job.workspace_id };
  },

  replicate_pattern: async (job: Job) => {
    const patternId = job.payload.pattern_id as string;
    const count = (job.payload.count as number) || 5;
    if (!patternId) throw new Error('pattern_id required');
    const result = await replicatePattern(job.workspace_id, patternId, count);
    return result as unknown as Record<string, unknown>;
  },

  generate_editor_notes: async (job: Job) => {
    const contentItemId = job.payload.content_item_id as string;
    if (!contentItemId) throw new Error('content_item_id required');
    const result = await generateEditorNotesForItem(contentItemId, job.workspace_id);
    return result as Record<string, unknown>;
  },

  scan_creator: async (job: Job) => {
    const sourceId = job.payload.creator_source_id as string;
    const handle = job.payload.handle as string;
    const platform = job.payload.platform as string;
    const forceFullFetch = job.payload.scan_reason === 'manual';
    if (!sourceId) throw new Error('creator_source_id required');

    const startMs = Date.now();

    const { supabaseAdmin: sa } = await import('@/lib/supabaseAdmin');

    // Gather workspace IDs watching this creator
    const { data: watchers } = await sa
      .from('creator_watchlist')
      .select('workspace_id')
      .eq('creator_source_id', sourceId)
      .eq('is_active', true);

    const workspaceIds = [...new Set((watchers ?? []).map((w) => w.workspace_id))];

    // Fetch current source fingerprint for comparison
    const { data: sourceRow } = await sa
      .from('creator_sources')
      .select('last_source_fingerprint')
      .eq('id', sourceId)
      .single();

    const storedFingerprint = sourceRow?.last_source_fingerprint ?? null;

    // ── STAGE A: Cheap Probe ────────────────────────────────────────
    // Try probe first unless this is a manual/forced scan
    if (!forceFullFetch && storedFingerprint) {
      try {
        const probe = await probeCreator({
          creator_handle: handle || '',
          platform: platform || 'tiktok',
          creator_source_id: sourceId,
          mode: 'probe',
          last_fingerprint: storedFingerprint,
        });

        if (probe.ok && !probe.changed) {
          // No change detected — short-circuit
          await logProbeResult(sourceId, {
            status: 'probe_unchanged',
            changed: false,
            fingerprint: probe.fingerprint ?? storedFingerprint,
            duration_ms: Date.now() - startMs,
            product_count: probe.product_count,
          });
          return { status: 'probe_unchanged', source_id: sourceId, saved_full_fetch: true };
        }

        // If probe says changed and includes products, use them directly
        if (probe.ok && probe.changed && probe.products && probe.products.length > 0) {
          const fingerprint = computeProductFingerprint(probe.products);

          // Double-check: compare computed fingerprint with stored
          if (!hasFingerPrintChanged(storedFingerprint, fingerprint)) {
            await logProbeResult(sourceId, {
              status: 'probe_unchanged',
              changed: false,
              fingerprint,
              duration_ms: Date.now() - startMs,
              product_count: probe.products.length,
            });
            return { status: 'probe_unchanged', source_id: sourceId, saved_full_fetch: true };
          }

          // Probe returned products with a real change — ingest directly
          await logProbeResult(sourceId, {
            status: 'probe_changed',
            changed: true,
            fingerprint,
            duration_ms: Date.now() - startMs,
            product_count: probe.products.length,
          });

          // Proceed to ingestion with probe products
          return await ingestAndLog(sa, sourceId, probe.products, watchers ?? [], startMs, fingerprint);
        }

        // Probe says changed but no inline products — fall through to full fetch
        if (probe.ok && probe.changed) {
          await logProbeResult(sourceId, {
            status: 'probe_changed',
            changed: true,
            fingerprint: probe.fingerprint,
            duration_ms: Date.now() - startMs,
            product_count: probe.product_count,
          });
          // Fall through to Stage B
        }

        // Probe error/unsupported — fall through to full fetch
        if (!probe.ok && probe.error === 'unsupported') {
          // Mark source so we skip probes in the future (TODO: adaptive)
        }
      } catch (probeErr) {
        console.warn('[scan_creator] probe failed, falling back to full fetch:', probeErr instanceof Error ? probeErr.message : probeErr);
      }
    }

    // ── STAGE B: Full Fetch ─────────────────────────────────────────

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const callbackUrl = `${appUrl}/api/webhooks/openclaw/scan-result`;

    try {
      const result = await requestCreatorScan({
        creator_handle: handle || '',
        platform: platform || 'tiktok',
        creator_source_id: sourceId,
        workspace_ids: workspaceIds,
        scan_reason: (job.payload.scan_reason as string as 'scheduled' | 'manual' | 'priority_change') || 'scheduled',
        callback_url: callbackUrl,
      });

      if (!result.ok) {
        await logScanResult(sourceId, {
          status: 'error',
          scan_mode: 'full_fetch',
          duration_ms: Date.now() - startMs,
          error_message: result.error || 'OpenClaw request failed',
        });
        return { status: 'error', source_id: sourceId, error: result.error };
      }

      // Sync response with products
      if (result.mode === 'completed' && result.products && result.products.length > 0) {
        const fingerprint = computeProductFingerprint(result.products);

        // Hash-based short-circuit: if fingerprint matches stored, skip ingestion
        if (!forceFullFetch && !hasFingerPrintChanged(storedFingerprint, fingerprint)) {
          await logScanResult(sourceId, {
            status: 'no_change',
            scan_mode: 'full_fetch',
            changed: false,
            fingerprint,
            products_found: result.products.length,
            new_observations: 0,
            duration_ms: Date.now() - startMs,
          });

          // Update consecutive_no_change for adaptive scheduling
          await sa
            .from('creator_sources')
            .update({
              consecutive_no_change: (sourceRow as Record<string, unknown>)?.consecutive_no_change
                ? Number((sourceRow as Record<string, unknown>).consecutive_no_change) + 1
                : 1,
              total_probe_savings: (sourceRow as Record<string, unknown>)?.total_probe_savings
                ? Number((sourceRow as Record<string, unknown>).total_probe_savings) + 1
                : 1,
            })
            .eq('id', sourceId);

          return { status: 'no_change', source_id: sourceId, fingerprint_match: true };
        }

        return await ingestAndLog(sa, sourceId, result.products, watchers ?? [], startMs, fingerprint);
      }

      // Async mode
      if (result.mode === 'accepted') {
        await logScanResult(sourceId, {
          status: 'dispatched',
          scan_mode: 'full_fetch',
          products_found: 0,
          new_observations: 0,
          duration_ms: Date.now() - startMs,
        });
        return { status: 'dispatched', source_id: sourceId, scan_id: result.scan_id };
      }

      // No products
      await logScanResult(sourceId, {
        status: 'no_change',
        scan_mode: 'full_fetch',
        changed: false,
        products_found: 0,
        new_observations: 0,
        duration_ms: Date.now() - startMs,
      });
      return { status: 'no_change', source_id: sourceId };
    } catch (err) {
      await logScanResult(sourceId, {
        status: 'error',
        scan_mode: 'full_fetch',
        duration_ms: Date.now() - startMs,
        error_message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  tiktok_draft_export: async (job: Job) => {
    const contentItemId = job.payload.content_item_id as string;
    const accountId = job.payload.account_id as string;
    const actorId = (job.payload.actor_id as string) || job.workspace_id;
    if (!contentItemId) throw new Error('content_item_id required');
    if (!accountId) throw new Error('account_id required');

    const result = await exportContentItemToTikTokDraft({
      contentItemId,
      accountId,
      actorId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Draft export failed');
    }

    return {
      publish_id: result.publish_id,
      content_item_id: contentItemId,
      account_id: accountId,
    };
  },

  render_video: async (job: Job) => {
    const contentItemId = job.payload.content_item_id as string;
    const actorId = (job.payload.actor_id as string) || job.workspace_id;
    if (!contentItemId) throw new Error('content_item_id required');

    // On retry (attempt > 1), reset edit_status so renderContentItem can proceed
    if (job.attempts > 0) {
      const { supabaseAdmin: sa } = await import('@/lib/supabaseAdmin');
      await sa
        .from('content_items')
        .update({ edit_status: 'rendering', render_error: null })
        .eq('id', contentItemId);
    }

    const result = await renderContentItem({ contentItemId, actorId });
    return {
      output_url: result.output_url,
      storage_path: result.storage_path,
      duration_sec: result.duration_sec,
    };
  },
};

export function getHandler(type: JobType): JobHandler | undefined {
  return handlers[type];
}

// ── Helper: ingest products and log result ────────────────────────────

async function ingestAndLog(
  sa: typeof import('@/lib/supabaseAdmin').supabaseAdmin,
  sourceId: string,
  products: import('@/lib/openclaw/client').CreatorScanProduct[],
  watchers: Array<{ workspace_id: string }>,
  startMs: number,
  fingerprint: string | null,
) {
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const watcher of watchers) {
    const batchResult = await ingestBatch(
      watcher.workspace_id,
      watcher.workspace_id,
      products.map((p) => ({
        product_name: p.product_name,
        brand_name: p.brand_name ?? null,
        product_url: p.product_url ?? null,
        product_image_url: p.product_image_url ?? null,
        confidence: p.confidence ?? 'medium',
        creator_has_posted: p.creator_has_posted ?? false,
        source_label: 'openclaw',
      })),
      sourceId,
    );
    totalCreated += batchResult.created;
    totalUpdated += batchResult.updated;
  }

  // Update fingerprint on source
  await sa
    .from('creator_sources')
    .update({
      last_source_fingerprint: fingerprint,
      last_full_fetch_at: new Date().toISOString(),
      consecutive_no_change: 0,
    })
    .eq('id', sourceId);

  await logScanResult(sourceId, {
    status: totalCreated > 0 ? 'new_products' : totalUpdated > 0 ? 'updated' : 'no_change',
    scan_mode: 'full_fetch',
    changed: true,
    fingerprint,
    products_found: products.length,
    new_observations: totalCreated,
    observations_updated: totalUpdated,
    duration_ms: Date.now() - startMs,
  });

  return {
    status: 'completed',
    source_id: sourceId,
    products_found: products.length,
    created: totalCreated,
    updated: totalUpdated,
  };
}
