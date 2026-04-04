/**
 * API: Auto Content Experiments
 *
 * POST /api/admin/experiments/auto-generate
 *
 * Quick experiment creation from an opportunity/cluster.
 * Wraps the existing campaign generation engine with simplified defaults.
 *
 * Input:
 *   cluster_id: string         — trend cluster to base experiment on
 *   variant_count?: number     — number of variants (default 5, max 10)
 *   angles?: string[]          — optional angle mix override
 *   cta_style?: string         — optional CTA style
 *   platform?: string          — optional platform override
 *
 * Flow:
 *   1. Resolve cluster → product
 *   2. Pick diverse angles + personas automatically
 *   3. Create experiment via campaign engine
 *   4. Return experiment_id + summary
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { generateCampaign } from '@/lib/campaigns/generate-campaign';
import type { CampaignGenerateRequest } from '@/lib/campaigns/types';
import { PERSONAS } from '@/lib/personas';

export const runtime = 'nodejs';
export const maxDuration = 120; // Hook + script generation can take time

// Default angles for auto experiments
const DEFAULT_ANGLES = [
  'pain/problem',
  'curiosity',
  'contrarian',
  'product demo',
  'story/relatable',
];

// Pick a diverse subset of personas
function pickPersonas(count: number): string[] {
  // Pick from different categories for diversity
  const prioritized = ['mike', 'sarah', 'jessica', 'david', 'emily'];
  return prioritized.slice(0, Math.min(count, prioritized.length));
}

// Calculate the best angle/persona split for a target variant count
function buildMatrix(variantCount: number, angles: string[]) {
  // Strategy: use enough angles to get variety, each with 1 hook
  // Then pick personas to multiply up to the target count
  if (variantCount <= angles.length) {
    // 1 persona × N angles
    return { personaCount: 1, selectedAngles: angles.slice(0, variantCount), hooksPerCombo: 1 };
  }

  // Need more: use multiple personas
  const personaCount = Math.min(Math.ceil(variantCount / angles.length), 3);
  const hooksPerCombo = Math.max(1, Math.ceil(variantCount / (personaCount * angles.length)));
  return { personaCount, selectedAngles: angles, hooksPerCombo: Math.min(hooksPerCombo, 2) };
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const {
    cluster_id,
    variant_count = 5,
    angles,
    cta_style,
    platform = 'tiktok',
  } = body;

  if (!cluster_id) {
    return createApiErrorResponse('BAD_REQUEST', 'cluster_id is required', 400, correlationId);
  }

  const count = Math.max(3, Math.min(variant_count, 10));

  // 1. Resolve cluster
  const { data: cluster } = await supabaseAdmin
    .from('trend_clusters')
    .select('id, display_name, normalized_product_key, recommendation, earlyness_score, saturation_score, trend_score, community_best_hook')
    .eq('id', cluster_id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!cluster) {
    return createApiErrorResponse('NOT_FOUND', 'Cluster not found', 404, correlationId);
  }

  // 2. Find or create product
  let productId: string | null = null;
  let brandId: string | null = null;

  const { data: existingProduct } = await supabaseAdmin
    .from('products')
    .select('id, brand_id')
    .ilike('name', cluster.display_name)
    .limit(1)
    .maybeSingle();

  if (existingProduct) {
    productId = existingProduct.id;
    brandId = existingProduct.brand_id;
  } else {
    // Create minimal product for the experiment
    const { data: newProduct } = await supabaseAdmin
      .from('products')
      .insert({
        name: cluster.display_name,
        workspace_id: workspaceId,
      })
      .select('id')
      .single();

    if (newProduct) {
      productId = newProduct.id;
    }
  }

  if (!productId) {
    return createApiErrorResponse('DB_ERROR', 'Could not resolve product', 500, correlationId);
  }

  // 3. Build matrix from variant count
  const selectedAngles = angles && angles.length > 0 ? angles.slice(0, 5) : DEFAULT_ANGLES;
  const { personaCount, selectedAngles: finalAngles, hooksPerCombo } = buildMatrix(count, selectedAngles);
  const personaIds = pickPersonas(personaCount);

  // 4. Build campaign request
  const experimentName = `Quick Test: ${cluster.display_name}`;
  const goal = `Auto-experiment from opportunity (${cluster.recommendation || 'WATCH'}). Early: ${cluster.earlyness_score}, Sat: ${cluster.saturation_score}, Trend: ${cluster.trend_score}.`;

  const campaignReq: CampaignGenerateRequest = {
    name: experimentName,
    brand_id: brandId || productId, // fallback to product_id if no brand
    product_id: productId,
    goal,
    hooks_per_combo: hooksPerCombo,
    persona_ids: personaIds,
    angles: finalAngles,
    platform: platform as 'tiktok' | 'instagram_reels' | 'youtube_shorts',
    tone: undefined,
    cta_style: cta_style || undefined,
    auto_script: true,
    auto_content_items: true,
  };

  // 5. Generate via campaign engine
  try {
    const result = await generateCampaign(campaignReq, authContext.user.id);

    return NextResponse.json({
      ok: result.ok,
      data: {
        experiment_id: result.experiment_id,
        cluster_id,
        product_name: cluster.display_name,
        total_hooks: result.total_hooks,
        total_scripts: result.total_scripts,
        total_items: result.total_items,
        matrix_size: result.matrix.length,
        angles_used: finalAngles,
        personas_used: personaIds.map(id => PERSONAS.find(p => p.id === id)?.name || id),
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
      correlation_id: correlationId,
    }, { status: result.ok ? 201 : 207 }); // 207 Multi-Status for partial
  } catch (err) {
    console.error('[auto-generate] fatal:', err instanceof Error ? err.message : err);
    return createApiErrorResponse('INTERNAL', 'Experiment generation failed', 500, correlationId);
  }
}
