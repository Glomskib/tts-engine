import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';

export const runtime = 'nodejs';

// ── GET /api/content-items ───────────────────────────────────────

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const brandId = url.searchParams.get('brand_id');
  const productId = url.searchParams.get('product_id');
  const assigned = url.searchParams.get('assigned'); // 'creator' | 'editor'
  const dueStart = url.searchParams.get('due_start');
  const dueEnd = url.searchParams.get('due_end');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const view = url.searchParams.get('view'); // 'board' for joined data

  const selectFields = view === 'board'
    ? '*, brands:brand_id(name), products:product_id(name)'
    : '*';

  let query = supabaseAdmin
    .from('content_items')
    .select(selectFields, { count: 'exact' })
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (brandId) query = query.eq('brand_id', brandId);
  if (productId) query = query.eq('product_id', productId);
  if (assigned === 'creator') query = query.eq('assigned_creator_id', user.id);
  if (assigned === 'editor') query = query.eq('assigned_editor_id', user.id);
  if (dueStart) query = query.gte('due_at', dueStart);
  if (dueEnd) query = query.lte('due_at', dueEnd);

  const { data, error, count } = await query;

  if (error) {
    console.error(`[${correlationId}] content_items list error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch content items', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: data || [],
    total: count ?? 0,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items', feature: 'content-items' });

// ── POST /api/content-items ──────────────────────────────────────

const ExperimentSchema = z.object({
  variable_type: z.enum(['hook', 'format', 'product', 'length']),
  variant: z.string().min(1),
});

const CreateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  brand_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  video_id: z.string().uuid().optional().nullable(),
  due_at: z.string().optional().nullable(),
  assigned_creator_id: z.string().uuid().optional().nullable(),
  assigned_editor_id: z.string().uuid().optional().nullable(),
  brief_selected_cow_tier: z.enum(['safe', 'edgy', 'unhinged']).optional(),
  experiments: z.array(ExperimentSchema).optional(),
});

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .insert({
      workspace_id: user.id,
      title: parsed.data.title,
      brand_id: parsed.data.brand_id ?? null,
      product_id: parsed.data.product_id ?? null,
      video_id: parsed.data.video_id ?? null,
      due_at: parsed.data.due_at ?? null,
      assigned_creator_id: parsed.data.assigned_creator_id ?? null,
      assigned_editor_id: parsed.data.assigned_editor_id ?? null,
      brief_selected_cow_tier: parsed.data.brief_selected_cow_tier ?? 'edgy',
      short_id: 'temp', // Overridden by DB trigger
    })
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] content_items insert error:`, error);
    const detail = error.message || error.details || 'Unknown database error';
    return createApiErrorResponse('DB_ERROR', `Failed to create content item: ${detail}`, 500, correlationId);
  }

  // Insert experiment tags if provided
  if (parsed.data.experiments?.length && item) {
    const rows = parsed.data.experiments.map(exp => ({
      workspace_id: user.id,
      variable_type: exp.variable_type,
      variant: exp.variant,
      content_item_id: item.id,
    }));
    const { error: expError } = await supabaseAdmin
      .from('content_experiments')
      .insert(rows);
    if (expError) {
      console.error(`[${correlationId}] experiment insert error:`, expError);
    }
  }

  const response = NextResponse.json({
    ok: true,
    data: item,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items', feature: 'content-items' });
