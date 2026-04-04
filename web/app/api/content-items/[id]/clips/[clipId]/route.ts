/**
 * PATCH  /api/content-items/[id]/clips/[clipId] — update ordering, trims, duration
 * DELETE /api/content-items/[id]/clips/[clipId] — remove clip and reorder
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { deleteMediaObject, BUCKETS } from '@/lib/media-storage';
import { z } from 'zod';

export const runtime = 'nodejs';

const ClipUpdateSchema = z.object({
  sequence_index: z.number().int().min(0).optional(),
  trim_start_sec: z.number().min(0).nullable().optional(),
  trim_end_sec: z.number().min(0).nullable().optional(),
  duration_sec: z.number().positive().nullable().optional(),
}).strict();

// ── PATCH ────────────────────────────────────────────────────────

export const PATCH = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id, clipId } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);

  // Verify clip exists and belongs to this content item
  const { data: existing } = await supabaseAdmin
    .from('content_item_assets')
    .select('id, kind')
    .eq('id', clipId)
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip')
    .single();
  if (!existing) return createApiErrorResponse('NOT_FOUND', 'Clip not found', 404, correlationId);

  let body: unknown;
  try { body = await request.json(); } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = ClipUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, { issues: parsed.error.issues });
  }

  // Validate trim range
  if (parsed.data.trim_start_sec != null && parsed.data.trim_end_sec != null) {
    if (parsed.data.trim_start_sec >= parsed.data.trim_end_sec) {
      return createApiErrorResponse('VALIDATION_ERROR', 'trim_start_sec must be less than trim_end_sec', 400, correlationId);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('content_item_assets')
    .update(parsed.data)
    .eq('id', clipId)
    .select('*')
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', 'Failed to update clip', 500, correlationId);

  return NextResponse.json({ ok: true, data: updated, correlation_id: correlationId });
}, { routeName: '/api/content-items/[id]/clips/[clipId]', feature: 'editing-engine' });

// ── DELETE ───────────────────────────────────────────────────────

export const DELETE = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id, clipId } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);

  const { data: clip } = await supabaseAdmin
    .from('content_item_assets')
    .select('id, metadata, sequence_index')
    .eq('id', clipId)
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip')
    .single();
  if (!clip) return createApiErrorResponse('NOT_FOUND', 'Clip not found', 404, correlationId);

  // Delete from storage
  const storagePath = (clip.metadata as Record<string, unknown>)?.storage_path as string | undefined;
  if (storagePath) {
    await deleteMediaObject(BUCKETS.RAW_VIDEOS, storagePath);
  }

  // Delete asset row
  await supabaseAdmin
    .from('content_item_assets')
    .delete()
    .eq('id', clipId);

  // Reorder remaining clips to close the gap
  const { data: remaining } = await supabaseAdmin
    .from('content_item_assets')
    .select('id, sequence_index')
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip')
    .order('sequence_index', { ascending: true });

  if (remaining && remaining.length > 0) {
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sequence_index !== i) {
        await supabaseAdmin
          .from('content_item_assets')
          .update({ sequence_index: i })
          .eq('id', remaining[i].id);
      }
    }
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}, { routeName: '/api/content-items/[id]/clips/[clipId]', feature: 'editing-engine' });
