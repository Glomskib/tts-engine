/**
 * API: Post Package
 *
 * POST /api/content-items/[id]/post-package — Generate & save post package
 * GET  /api/content-items/[id]/post-package — Return latest post package
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generatePostPackage } from '@/lib/posting/generatePostPackage';

export const runtime = 'nodejs';

// ── POST — Generate & save ──────────────────────────────────

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, product_id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Enforce product linkage
  if (!item.product_id) {
    return createApiErrorResponse('MISSING_PRODUCT_ID', 'Link a product before generating a post package', 400, correlationId);
  }

  const result = await generatePostPackage(id, user.id);

  // Upsert into content_item_ai_insights
  const { data: insight, error } = await supabaseAdmin
    .from('content_item_ai_insights')
    .upsert(
      {
        workspace_id: user.id,
        content_item_id: id,
        content_item_post_id: null,
        insight_type: 'post_package',
        json: result.json as unknown as Record<string, unknown>,
        markdown: result.markdown,
        generated_at: result.json.generated_at,
      },
      { onConflict: 'content_item_id,insight_type', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error) {
    // Fallback: insert instead (upsert may fail if no unique constraint)
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('content_item_ai_insights')
      .insert({
        workspace_id: user.id,
        content_item_id: id,
        content_item_post_id: null,
        insight_type: 'post_package',
        json: result.json as unknown as Record<string, unknown>,
        markdown: result.markdown,
        generated_at: result.json.generated_at,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error(`[${correlationId}] post_package insert error:`, insertErr);
      return createApiErrorResponse('DB_ERROR', 'Failed to save post package', 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: { json: result.json, markdown: result.markdown, insight: inserted },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    data: { json: result.json, markdown: result.markdown, insight },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/post-package', feature: 'posting' });

// ── GET — Return latest ─────────────────────────────────────

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: insight } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('*')
    .eq('content_item_id', id)
    .eq('workspace_id', user.id)
    .eq('insight_type', 'post_package')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!insight) {
    return createApiErrorResponse('NOT_FOUND', 'No post package found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: { json: insight.json, markdown: insight.markdown },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/post-package', feature: 'posting' });
