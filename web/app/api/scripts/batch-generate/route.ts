import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { BRAND_PERSONA_MAP } from '@/lib/product-persona-map';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/scripts/batch-generate
 * Returns products that need UGC_SHORT scripts (no saved skit with content_type 'ugc_short').
 * Auth: API key required.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  // Products that already have a UGC_SHORT skit
  const { data: coveredRows, error: coveredErr } = await supabaseAdmin
    .from('saved_skits')
    .select('product_id')
    .not('product_id', 'is', null)
    .filter('generation_config->>content_type', 'eq', 'ugc_short');

  if (coveredErr) {
    return createApiErrorResponse('DB_ERROR', coveredErr.message, 500, correlationId);
  }

  const coveredIds = [...new Set((coveredRows || []).map((r) => r.product_id).filter(Boolean))];

  // All products, minus covered ones
  let query = supabaseAdmin
    .from('products')
    .select('id, name, brand, category_risk, product_image_url')
    .order('created_at', { ascending: false });

  if (coveredIds.length > 0) {
    // Supabase PostgREST: not.in filter
    query = query.not('id', 'in', `(${coveredIds.join(',')})`);
  }

  const { data: products, error: prodErr } = await query;

  if (prodErr) {
    return createApiErrorResponse('DB_ERROR', prodErr.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      products_needing_scripts: products || [],
      total: products?.length || 0,
      already_covered: coveredIds.length,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * POST /api/scripts/batch-generate
 * Generates UGC_SHORT scripts for up to 10 products that don't have one.
 * Calls the existing /api/ai/generate-skit endpoint internally.
 * Auth: API key required.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  // Optional: pass specific product_ids, otherwise auto-pick
  let body: { product_ids?: string[]; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — auto-pick mode
  }

  const batchLimit = Math.min(body.limit || 10, 10);

  // Find products that need UGC_SHORT scripts
  const { data: coveredRows } = await supabaseAdmin
    .from('saved_skits')
    .select('product_id')
    .not('product_id', 'is', null)
    .filter('generation_config->>content_type', 'eq', 'ugc_short');

  const coveredIds = new Set((coveredRows || []).map((r) => r.product_id).filter(Boolean));

  let productsToProcess: { id: string; name: string; brand: string | null }[];

  if (body.product_ids && body.product_ids.length > 0) {
    // Use specified product IDs, skip already covered
    const filtered = body.product_ids.filter((id) => !coveredIds.has(id));
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .in('id', filtered.slice(0, batchLimit));

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }
    productsToProcess = data || [];
  } else {
    // Auto-pick products without UGC_SHORT
    let query = supabaseAdmin
      .from('products')
      .select('id, name, brand')
      .order('created_at', { ascending: false })
      .limit(batchLimit);

    if (coveredIds.size > 0) {
      query = query.not('id', 'in', `(${[...coveredIds].join(',')})`);
    }

    const { data, error } = await query;
    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }
    productsToProcess = data || [];
  }

  if (productsToProcess.length === 0) {
    const response = NextResponse.json({
      ok: true,
      data: { total: 0, completed: 0, failed: 0, remaining: 0, results: [] },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  // Resolve the base URL for internal API calls
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'flashflowai.com';
  const baseUrl = `${proto}://${host}`;

  // Forward auth header
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  if (apiKey) authHeaders['x-api-key'] = apiKey;
  else if (authHeader) authHeaders['Authorization'] = authHeader;

  // Process products sequentially to stay within timeout
  // Each generation takes ~30-90s, so sequential with 1 variation is safest
  const results: Array<{
    product_id: string;
    product_name: string;
    status: 'success' | 'failed';
    skit_id?: string;
    error?: string;
  }> = [];

  for (const product of productsToProcess) {
    try {
      // Look up brand-specific persona
      let audiencePersonaId: string | undefined;
      const personaName = product.brand ? BRAND_PERSONA_MAP[product.brand] : undefined;
      if (personaName) {
        const { data: persona } = await supabaseAdmin
          .from('audience_personas')
          .select('id')
          .eq('name', personaName)
          .limit(1)
          .single();
        if (persona) audiencePersonaId = persona.id;
      }

      // Step 1: Generate skit
      const genRes = await fetch(`${baseUrl}/api/ai/generate-skit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          product_id: product.id,
          content_type_id: 'ugc_short',
          risk_tier: 'BALANCED',
          persona: 'NONE',
          intensity: 50,
          variation_count: 1,
          actor_type: 'human',
          target_duration: 'quick',
          hook_strength: 'strong',
          ...(audiencePersonaId && { audience_persona_id: audiencePersonaId }),
        }),
      });

      const genData = await genRes.json();

      if (!genRes.ok || !genData.ok || !genData.data?.skit) {
        results.push({
          product_id: product.id,
          product_name: product.name,
          status: 'failed',
          error: genData.message || genData.error || `Generate failed (${genRes.status})`,
        });
        continue;
      }

      // Step 2: Save skit
      const saveRes = await fetch(`${baseUrl}/api/skits`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          title: `UGC Short — ${product.name}`,
          skit_data: genData.data.skit,
          generation_config: {
            content_type: 'ugc_short',
            risk_tier: 'BALANCED',
            persona: personaName || 'NONE',
            intensity: 50,
            actor_type: 'human',
            target_duration: 'quick',
            source: 'batch_generate',
            ...(audiencePersonaId && { audience_persona_id: audiencePersonaId }),
          },
          product_id: product.id,
          product_name: product.name,
          product_brand: product.brand || undefined,
          status: 'draft',
          ai_score: genData.data.ai_score || null,
        }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok || !saveData.ok) {
        results.push({
          product_id: product.id,
          product_name: product.name,
          status: 'failed',
          error: saveData.message || `Save failed (${saveRes.status})`,
        });
        continue;
      }

      results.push({
        product_id: product.id,
        product_name: product.name,
        status: 'success',
        skit_id: saveData.data?.id,
      });
    } catch (err) {
      results.push({
        product_id: product.id,
        product_name: product.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Count remaining products without UGC_SHORT
  const { count: totalProducts } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true });

  const completed = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const newCovered = (coveredIds.size) + completed;
  const remaining = (totalProducts || 0) - newCovered;

  const response = NextResponse.json({
    ok: true,
    data: {
      total: productsToProcess.length,
      completed,
      failed,
      remaining: Math.max(0, remaining),
      results,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
