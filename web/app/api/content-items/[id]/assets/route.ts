import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';

export const runtime = 'nodejs';

// ── GET /api/content-items/[id]/assets ───────────────────────────

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

  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');

  let query = supabaseAdmin
    .from('content_item_assets')
    .select('*')
    .eq('content_item_id', id)
    .order('created_at', { ascending: false });

  if (kind) query = query.eq('kind', kind);

  const { data: assets, error } = await query;

  if (error) {
    console.error(`[${correlationId}] assets fetch error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch assets', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: assets || [],
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/assets', feature: 'content-items' });

// ── POST /api/content-items/[id]/assets ──────────────────────────

const AssetSchema = z.object({
  kind: z.enum(['raw_footage', 'transcript', 'final_video', 'broll', 'editor_notes']),
  source: z.enum(['google_drive', 'upload', 'generated']),
  file_id: z.string().optional().nullable(),
  file_name: z.string().optional().nullable(),
  file_url: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = AssetSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { data: asset, error } = await supabaseAdmin
    .from('content_item_assets')
    .insert({
      content_item_id: id,
      kind: parsed.data.kind,
      source: parsed.data.source,
      file_id: parsed.data.file_id ?? null,
      file_name: parsed.data.file_name ?? null,
      file_url: parsed.data.file_url ?? null,
      metadata: parsed.data.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] asset insert error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to create asset', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: asset,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/assets', feature: 'content-items' });
