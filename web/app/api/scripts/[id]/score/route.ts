import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { scoreScript, extractScriptFromSkit, type ScriptScoreResult } from '@/lib/script-scorer';
import { BRAND_PERSONA_MAP } from '@/lib/product-persona-map';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/scripts/[id]/score
 * Returns the existing score for a skit, or null if not yet scored.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  if (!UUID_RE.test(id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid skit ID format', 400, correlationId);
  }

  const { data: skit, error } = await supabaseAdmin
    .from('saved_skits')
    .select('id, title, script_quality_score')
    .eq('id', id)
    .single();

  if (error || !skit) {
    return createApiErrorResponse('NOT_FOUND', 'Skit not found', 404, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      skit_id: skit.id,
      title: skit.title,
      score: skit.script_quality_score || null,
    },
    correlation_id: correlationId,
  });
}

/**
 * POST /api/scripts/[id]/score
 * Scores a skit using Claude Haiku and saves the result.
 * Optionally accepts { persona?: string } in the body to override auto-detection.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  if (!UUID_RE.test(id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid skit ID format', 400, correlationId);
  }

  let body: { persona?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — auto-detect persona
  }

  // Fetch skit with product info
  const { data: skit, error: skitErr } = await supabaseAdmin
    .from('saved_skits')
    .select('id, title, skit_data, product_id, product_name, product_brand, generation_config')
    .eq('id', id)
    .single();

  if (skitErr || !skit) {
    return createApiErrorResponse('NOT_FOUND', 'Skit not found', 404, correlationId);
  }

  const skitData = skit.skit_data as {
    hook_line?: string;
    beats?: Array<{ dialogue?: string; action?: string; on_screen_text?: string }>;
    cta_line?: string;
    cta_overlay?: string;
  };

  if (!skitData?.beats || skitData.beats.length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'Skit has no beats to score', 400, correlationId);
  }

  // Extract script text
  const { script, hook } = extractScriptFromSkit(skitData);

  if (!script.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'Skit has no dialogue or action text', 400, correlationId);
  }

  // Resolve persona: body override > generation_config > brand map > fallback
  let persona = body.persona || '';
  if (!persona) {
    const genConfig = skit.generation_config as { persona_name?: string } | null;
    persona = genConfig?.persona_name || '';
  }
  if (!persona && skit.product_brand) {
    persona = BRAND_PERSONA_MAP[skit.product_brand] || '';
  }
  if (!persona) {
    persona = 'General consumer';
  }

  // Resolve product name
  let productName = skit.product_name || '';
  if (!productName && skit.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('product_display_name, name')
      .eq('id', skit.product_id)
      .single();
    productName = product?.product_display_name || product?.name || 'Unknown product';
  }

  // Score it
  let result: ScriptScoreResult;
  try {
    result = await scoreScript({ script, persona, product: productName, hook });
  } catch (err) {
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Scoring failed',
      500,
      correlationId
    );
  }

  // Save to skit record
  const { error: updateErr } = await supabaseAdmin
    .from('saved_skits')
    .update({ script_quality_score: result })
    .eq('id', id);

  if (updateErr) {
    console.error(`[${correlationId}] Failed to save score:`, updateErr);
    // Return score anyway — just warn about save failure
  }

  return NextResponse.json({
    ok: true,
    data: {
      skit_id: skit.id,
      title: skit.title,
      product: productName,
      persona,
      script_preview: script.length > 200 ? script.slice(0, 200) + '...' : script,
      result,
      saved: !updateErr,
    },
    correlation_id: correlationId,
  });
}
