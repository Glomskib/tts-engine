import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';
import { CONTENT_ITEM_STATUSES } from '@/lib/content-items/types';

export const runtime = 'nodejs';

// ── GET /api/content-items/[id] ──────────────────────────────────

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

  // Fetch content item
  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Fetch latest brief
  const { data: latestBrief } = await supabaseAdmin
    .from('creator_briefs')
    .select('*')
    .eq('content_item_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch asset counts by kind
  const { data: assets } = await supabaseAdmin
    .from('content_item_assets')
    .select('kind')
    .eq('content_item_id', id);

  const assetCounts: Record<string, number> = {};
  (assets || []).forEach(a => {
    assetCounts[a.kind] = (assetCounts[a.kind] || 0) + 1;
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      ...item,
      latest_brief: latestBrief || null,
      asset_counts: assetCounts,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]', feature: 'content-items' });

// ── PATCH /api/content-items/[id] ────────────────────────────────

const PROCESSING_STATUSES = ['none', 'pending', 'processing', 'completed', 'failed'] as const;

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(CONTENT_ITEM_STATUSES as [string, ...string[]]).optional(),
  due_at: z.string().nullable().optional(),
  assigned_creator_id: z.string().uuid().nullable().optional(),
  assigned_editor_id: z.string().uuid().nullable().optional(),
  brief_selected_cow_tier: z.enum(['safe', 'edgy', 'unhinged']).optional(),
  brand_id: z.string().uuid().nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  video_id: z.string().uuid().nullable().optional(),
  final_video_url: z.string().nullable().optional(),
  ai_description: z.string().nullable().optional(),
  hashtags: z.array(z.string()).nullable().optional(),
  caption: z.string().nullable().optional(),
  transcript_status: z.enum(PROCESSING_STATUSES).optional(),
  editor_notes_status: z.enum(PROCESSING_STATUSES).optional(),
}).strict();

export const PATCH = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
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

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('content_items')
    .select('id, transcript_status, editor_notes_status')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!existing) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Validate processing status transitions: only allow retry (failed → pending)
  if (parsed.data.transcript_status === 'pending' && existing.transcript_status !== 'failed') {
    return createApiErrorResponse('VALIDATION_ERROR', 'Can only retry transcription from failed state', 400, correlationId);
  }
  if (parsed.data.editor_notes_status === 'pending' && existing.editor_notes_status !== 'failed') {
    return createApiErrorResponse('VALIDATION_ERROR', 'Can only retry editor notes from failed state', 400, correlationId);
  }

  // Build update data — clear errors when retrying
  const updateData = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.transcript_status === 'pending') {
    updateData.transcript_error = null;
  }
  if (parsed.data.editor_notes_status === 'pending') {
    updateData.editor_notes_error = null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('content_items')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] content_items update error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to update content item', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: updated,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]', feature: 'content-items' });

// ── DELETE /api/content-items/[id] ───────────────────────────────

export const DELETE = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { error } = await supabaseAdmin
    .from('content_items')
    .delete()
    .eq('id', id)
    .eq('workspace_id', user.id);

  if (error) {
    console.error(`[${correlationId}] content_items delete error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to delete content item', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]', feature: 'content-items' });
