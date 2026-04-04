/**
 * Opportunity Radar — Ingestion Service
 *
 * Single entry point for ALL automated observation ingestion
 * (OpenClaw, scraper, import, manual).
 *
 * Handles dedup, change detection, scoring, and opportunity creation.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { computeOpportunityScore } from './scoring';
import { resolveCluster, linkObservationToCluster } from './clustering';
import { rescoreCluster } from './trend-scoring';
import type { ObservationConfidence, CreatorPriority } from './types';

// ── Public Types ─────────────────────────────────────────────

export interface IngestObservationInput {
  product_name: string;
  product_url?: string | null;
  product_image_url?: string | null;
  brand_name?: string | null;
  source_label?: string | null;
  confidence?: ObservationConfidence;
  creator_has_posted?: boolean;
  observation_notes?: string | null;
}

export interface IngestResult {
  action: 'created' | 'updated' | 'no_change';
  observation_id: string;
  opportunity_id?: string;
  score?: number;
  changes?: string[];
}

export interface IngestBatchResult {
  source_id: string;
  created: number;
  updated: number;
  unchanged: number;
  results: IngestResult[];
  duration_ms: number;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Find an existing observation by workspace + creator + product_name (case-insensitive),
 * falling back to product_url exact match if provided.
 */
async function findExistingObservation(
  workspaceId: string,
  creatorId: string,
  productName: string,
  productUrl?: string | null,
) {
  // Try name match first
  const { data: byName, error: nameErr } = await supabaseAdmin
    .from('creator_product_observations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('creator_id', creatorId)
    .ilike('product_name', productName)
    .limit(1)
    .maybeSingle();

  if (nameErr) {
    console.error('[ingestion] dedup name lookup failed:', nameErr.message);
  }
  if (byName) return byName;

  // Fallback: try product_url exact match
  if (productUrl) {
    const { data: byUrl, error: urlErr } = await supabaseAdmin
      .from('creator_product_observations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('creator_id', creatorId)
      .eq('product_url', productUrl)
      .limit(1)
      .maybeSingle();

    if (urlErr) {
      console.error('[ingestion] dedup url lookup failed:', urlErr.message);
    }
    if (byUrl) return byUrl;
  }

  return null;
}

/**
 * Count how many distinct OTHER creators in the same workspace have
 * observed the same product (case-insensitive name match).
 */
async function countMultiCreatorSignal(
  workspaceId: string,
  creatorId: string,
  productName: string,
): Promise<number> {
  // Supabase doesn't support COUNT(DISTINCT) easily, so we fetch distinct creator_ids
  const { data, error } = await supabaseAdmin
    .from('creator_product_observations')
    .select('creator_id')
    .eq('workspace_id', workspaceId)
    .neq('creator_id', creatorId)
    .ilike('product_name', productName);

  if (error) {
    console.error('[ingestion] multi-creator count failed:', error.message);
    return 0;
  }

  const uniqueCreators = new Set((data ?? []).map((r) => r.creator_id));
  return uniqueCreators.size;
}

/**
 * Fetch a creator's priority from the watchlist.
 */
async function getCreatorPriority(
  workspaceId: string,
  creatorId: string,
): Promise<CreatorPriority> {
  const { data, error } = await supabaseAdmin
    .from('creator_watchlist')
    .select('priority')
    .eq('workspace_id', workspaceId)
    .eq('id', creatorId)
    .maybeSingle();

  if (error) {
    console.error('[ingestion] creator priority lookup failed:', error.message);
    return 'medium';
  }

  return (data?.priority as CreatorPriority) ?? 'medium';
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Ingest a single observation with dedup and change detection.
 */
export async function ingestObservation(
  workspaceId: string,
  creatorId: string,
  input: IngestObservationInput,
  creatorSourceId?: string,
): Promise<IngestResult> {
  const now = new Date().toISOString();

  const existing = await findExistingObservation(
    workspaceId,
    creatorId,
    input.product_name,
    input.product_url,
  );

  // ── Existing observation — check for material changes ──────
  if (existing) {
    const changes: string[] = [];

    const comparisons: { field: string; incoming: unknown; current: unknown }[] = [
      { field: 'confidence', incoming: input.confidence, current: existing.confidence },
      { field: 'creator_has_posted', incoming: input.creator_has_posted, current: existing.creator_has_posted },
      { field: 'brand_name', incoming: input.brand_name, current: existing.brand_name },
      { field: 'product_url', incoming: input.product_url, current: existing.product_url },
      { field: 'product_image_url', incoming: input.product_image_url, current: existing.product_image_url },
    ];

    const updates: Record<string, unknown> = {};

    for (const { field, incoming, current } of comparisons) {
      // Skip undefined incoming values (not provided)
      if (incoming === undefined) continue;
      if (incoming !== current) {
        changes.push(field);
        updates[field] = incoming;
      }
    }

    // Always bump last_seen_at and times_seen
    updates.last_seen_at = now;
    updates.updated_at = now;

    if (changes.length === 0) {
      // No material changes — just bump counters
      const { error } = await supabaseAdmin
        .from('creator_product_observations')
        .update({
          last_seen_at: now,
          times_seen: (existing.times_seen ?? 1) + 1,
          updated_at: now,
        })
        .eq('id', existing.id);

      if (error) {
        console.error('[ingestion] bump update failed:', error.message);
      }

      return {
        action: 'no_change',
        observation_id: existing.id,
        changes: ['last_seen_at', 'times_seen'],
      };
    }

    // Material changes — update fields + bump counters + re-score
    updates.times_seen = (existing.times_seen ?? 1) + 1;

    const { error: updateErr } = await supabaseAdmin
      .from('creator_product_observations')
      .update(updates)
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[ingestion] observation update failed:', updateErr.message);
    }

    // Re-score the linked opportunity
    await rescoreObservation(existing.id, workspaceId);

    // Re-score the cluster if this observation belongs to one
    const { data: membership } = await supabaseAdmin
      .from('trend_cluster_members')
      .select('trend_cluster_id')
      .eq('observation_id', existing.id)
      .maybeSingle();

    if (membership?.trend_cluster_id) {
      await rescoreCluster(membership.trend_cluster_id);
    }

    return {
      action: 'updated',
      observation_id: existing.id,
      changes,
    };
  }

  // ── New observation — create + score + create opportunity ──
  const observationRow = {
    workspace_id: workspaceId,
    creator_id: creatorId,
    product_name: input.product_name,
    product_url: input.product_url ?? null,
    product_image_url: input.product_image_url ?? null,
    brand_name: input.brand_name ?? null,
    source_label: input.source_label ?? null,
    confidence: input.confidence ?? 'medium',
    creator_has_posted: input.creator_has_posted ?? false,
    observation_notes: input.observation_notes ?? null,
    source: creatorSourceId ? 'automation' : 'manual',
    ...(creatorSourceId ? { creator_source_id: creatorSourceId } : {}),
    first_seen_at: now,
    last_seen_at: now,
    times_seen: 1,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('creator_product_observations')
    .insert(observationRow)
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(`[ingestion] observation insert failed: ${insertErr?.message ?? 'no data returned'}`);
  }

  const observationId = inserted.id;

  // Gather scoring inputs
  const [multiCreatorCount, creatorPriority] = await Promise.all([
    countMultiCreatorSignal(workspaceId, creatorId, input.product_name),
    getCreatorPriority(workspaceId, creatorId),
  ]);

  const scoreBreakdown = computeOpportunityScore(
    {
      first_seen_at: now,
      creator_has_posted: input.creator_has_posted ?? false,
      confidence: (input.confidence ?? 'medium') as ObservationConfidence,
      times_seen: 1,
    },
    creatorPriority,
    multiCreatorCount,
  );

  // Create opportunity record
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from('opportunities')
    .insert({
      workspace_id: workspaceId,
      observation_id: observationId,
      score: scoreBreakdown.total,
      score_breakdown: scoreBreakdown,
      status: 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (oppErr) {
    console.error('[ingestion] opportunity insert failed:', oppErr.message);
  }

  // Resolve cluster and link observation
  try {
    const { clusterId } = await resolveCluster(
      workspaceId,
      input.product_name,
      input.brand_name,
      input.product_url,
      input.product_image_url,
    );
    await linkObservationToCluster(clusterId, observationId);
    await rescoreCluster(clusterId);
  } catch (clusterErr) {
    console.error(
      '[ingestion] clustering failed (non-fatal):',
      clusterErr instanceof Error ? clusterErr.message : clusterErr,
    );
  }

  return {
    action: 'created',
    observation_id: observationId,
    opportunity_id: opp?.id,
    score: scoreBreakdown.total,
  };
}

/**
 * Ingest a batch of observations. Logs per-item errors but continues processing.
 */
export async function ingestBatch(
  workspaceId: string,
  creatorId: string,
  observations: IngestObservationInput[],
  creatorSourceId?: string,
): Promise<IngestBatchResult> {
  const start = Date.now();
  const results: IngestResult[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const obs of observations) {
    try {
      const result = await ingestObservation(workspaceId, creatorId, obs, creatorSourceId);
      results.push(result);

      switch (result.action) {
        case 'created':
          created++;
          break;
        case 'updated':
          updated++;
          break;
        case 'no_change':
          unchanged++;
          break;
      }
    } catch (err) {
      console.error(
        `[ingestion] batch item failed for "${obs.product_name}":`,
        err instanceof Error ? err.message : err,
      );
      // Continue processing remaining items
    }
  }

  return {
    source_id: creatorSourceId ?? 'manual',
    created,
    updated,
    unchanged,
    results,
    duration_ms: Date.now() - start,
  };
}

/**
 * Re-score an existing observation's opportunity.
 * Only updates if the score actually changed.
 */
export async function rescoreObservation(
  observationId: string,
  workspaceId: string,
): Promise<void> {
  // Fetch the observation
  const { data: obs, error: obsErr } = await supabaseAdmin
    .from('creator_product_observations')
    .select('*, creator:creator_watchlist(priority)')
    .eq('id', observationId)
    .single();

  if (obsErr || !obs) {
    console.error('[ingestion] rescore observation lookup failed:', obsErr?.message ?? 'not found');
    return;
  }

  const creatorPriority: CreatorPriority =
    (obs.creator?.priority as CreatorPriority) ?? 'medium';

  const multiCreatorCount = await countMultiCreatorSignal(
    workspaceId,
    obs.creator_id,
    obs.product_name,
  );

  const scoreBreakdown = computeOpportunityScore(
    {
      first_seen_at: obs.first_seen_at,
      creator_has_posted: obs.creator_has_posted,
      confidence: obs.confidence as ObservationConfidence,
      times_seen: obs.times_seen,
    },
    creatorPriority,
    multiCreatorCount,
  );

  // Find the linked opportunity
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from('opportunities')
    .select('id, score')
    .eq('observation_id', observationId)
    .maybeSingle();

  if (oppErr) {
    console.error('[ingestion] rescore opportunity lookup failed:', oppErr.message);
    return;
  }

  if (!opp) {
    // No opportunity record exists — nothing to update
    return;
  }

  // Only update if score actually changed
  if (opp.score === scoreBreakdown.total) {
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('opportunities')
    .update({
      score: scoreBreakdown.total,
      score_breakdown: scoreBreakdown,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opp.id);

  if (updateErr) {
    console.error('[ingestion] rescore update failed:', updateErr.message);
  }
}
