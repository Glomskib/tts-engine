/**
 * Opportunity Radar — Product Clustering
 *
 * Groups observations into normalized product clusters using
 * deterministic heuristics:
 *
 * 1. Exact URL match (strongest signal)
 * 2. Normalized product key (brand + name, lowercased, cleaned)
 *
 * No AI/ML — pure string normalization for explainability and speed.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Product Key Normalization ───────────────────────────────────────

/**
 * Generate a normalized product key for clustering.
 *
 * Rules:
 * - lowercase everything
 * - trim whitespace
 * - collapse multiple spaces to single
 * - remove common noise characters: ™ ® © |
 * - strip trailing size/variant descriptors (e.g., "- 30ml", "(pack of 3)")
 * - prepend brand name if available for disambiguation
 *
 * Examples:
 *   "Magic Matcha Powder™ - 30ml" → "magic matcha powder"
 *   brand="GlowCo", name="Magic Matcha Powder" → "glowco::magic matcha powder"
 */
export function normalizeProductKey(productName: string, brandName?: string | null): string {
  let key = productName
    .toLowerCase()
    .trim()
    // Remove trademark/copyright symbols
    .replace(/[™®©]/g, '')
    // Remove pipe-delimited suffixes (e.g., "Product | Brand")
    .replace(/\s*\|.*$/, '')
    // Remove parenthetical variants: (Pack of 3), (30ml), etc.
    .replace(/\s*\([^)]*\)\s*$/, '')
    // Remove trailing size/variant after dash: "- 30ml", "- Large"
    .replace(/\s*-\s*\d+\s*(ml|g|oz|mg|ct|pk|pack|count).*$/i, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Prepend brand for disambiguation
  if (brandName?.trim()) {
    const normalBrand = brandName.toLowerCase().trim().replace(/\s+/g, ' ');
    // Don't duplicate if brand is already in the product name
    if (!key.startsWith(normalBrand)) {
      key = `${normalBrand}::${key}`;
    }
  }

  return key;
}

/**
 * Extract a clean display name from a product name.
 * Removes noise but keeps it human-readable.
 */
export function cleanDisplayName(productName: string): string {
  return productName
    .trim()
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── URL-Based Clustering ────────────────────────────────────────────

/**
 * Extract a normalized URL key for URL-based clustering.
 * Strips query params, fragments, trailing slashes, and www prefix.
 */
export function normalizeProductUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname.replace(/\/+$/, '');
    const host = parsed.hostname.replace(/^www\./, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

// ── Cluster Resolution ──────────────────────────────────────────────

/**
 * Find or create a trend cluster for a given observation.
 * Returns the cluster ID.
 *
 * Resolution order:
 * 1. Try URL match first (if observation has product_url)
 * 2. Then normalized product key match
 * 3. If neither matches, create a new cluster
 */
export async function resolveCluster(
  workspaceId: string,
  productName: string,
  brandName?: string | null,
  productUrl?: string | null,
  productImageUrl?: string | null,
): Promise<{ clusterId: string; isNew: boolean }> {
  const normalizedKey = normalizeProductKey(productName, brandName);
  const now = new Date().toISOString();

  // Try to find existing cluster by normalized key
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('trend_clusters')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('normalized_key', normalizedKey)
    .maybeSingle();

  if (findErr) {
    console.error('[clustering] lookup failed:', findErr.message);
  }

  if (existing) {
    return { clusterId: existing.id, isNew: false };
  }

  // Try URL-based match if we have a URL
  if (productUrl) {
    const normalUrl = normalizeProductUrl(productUrl);
    if (normalUrl) {
      const { data: byUrl } = await supabaseAdmin
        .from('trend_clusters')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('primary_product_url', productUrl)
        .maybeSingle();

      if (byUrl) {
        return { clusterId: byUrl.id, isNew: false };
      }
    }
  }

  // Create new cluster
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('trend_clusters')
    .insert({
      workspace_id: workspaceId,
      normalized_key: normalizedKey,
      display_name: cleanDisplayName(productName),
      brand_name: brandName ?? null,
      primary_product_url: productUrl ?? null,
      primary_image_url: productImageUrl ?? null,
      first_signal_at: now,
      last_signal_at: now,
      signal_count: 0,
      creator_count: 0,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    // Race condition: another ingestion may have created it
    const { data: retry } = await supabaseAdmin
      .from('trend_clusters')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('normalized_key', normalizedKey)
      .maybeSingle();

    if (retry) {
      return { clusterId: retry.id, isNew: false };
    }

    throw new Error(`[clustering] insert failed: ${insertErr?.message ?? 'no data returned'}`);
  }

  return { clusterId: inserted.id, isNew: true };
}

/**
 * Link an observation to a cluster (idempotent).
 */
export async function linkObservationToCluster(
  clusterId: string,
  observationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('trend_cluster_members')
    .upsert(
      { trend_cluster_id: clusterId, observation_id: observationId },
      { onConflict: 'trend_cluster_id,observation_id' },
    );

  if (error) {
    console.error('[clustering] link failed:', error.message);
  }
}

/**
 * Refresh a cluster's aggregate metrics from its member observations.
 */
export async function refreshClusterMetrics(clusterId: string): Promise<void> {
  // Get all observations linked to this cluster
  const { data: members, error: memberErr } = await supabaseAdmin
    .from('trend_cluster_members')
    .select('observation:creator_product_observations(id, creator_id, first_seen_at, last_seen_at, times_seen, creator_has_posted, confidence)')
    .eq('trend_cluster_id', clusterId);

  if (memberErr || !members) {
    console.error('[clustering] metrics refresh failed:', memberErr?.message);
    return;
  }

  const observations = members
    .map((m) => m.observation)
    .flat()
    .filter(Boolean) as Array<{
      id: string;
      creator_id: string;
      first_seen_at: string;
      last_seen_at: string;
      times_seen: number;
      creator_has_posted: boolean;
      confidence: string;
    }>;

  if (observations.length === 0) return;

  const uniqueCreators = new Set(observations.map((o) => o.creator_id));
  const postedCreators = new Set(
    observations.filter((o) => o.creator_has_posted).map((o) => o.creator_id),
  );
  const totalSignals = observations.reduce((sum, o) => sum + o.times_seen, 0);

  const firstSignal = observations.reduce((earliest, o) => {
    return o.first_seen_at < earliest ? o.first_seen_at : earliest;
  }, observations[0].first_seen_at);

  const lastSignal = observations.reduce((latest, o) => {
    return o.last_seen_at > latest ? o.last_seen_at : latest;
  }, observations[0].last_seen_at);

  const { error: updateErr } = await supabaseAdmin
    .from('trend_clusters')
    .update({
      signal_count: totalSignals,
      creator_count: uniqueCreators.size,
      posted_creator_count: postedCreators.size,
      first_signal_at: firstSignal,
      last_signal_at: lastSignal,
    })
    .eq('id', clusterId);

  if (updateErr) {
    console.error('[clustering] metrics update failed:', updateErr.message);
  }
}
