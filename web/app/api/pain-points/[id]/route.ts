import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * PATCH /api/pain-points/[id] — increment times_used or update category
 * Body: { times_used?: number; category?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('saved_pain_points')
      .select('*')
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .single();

    if (fetchError || !existing) {
      return createApiErrorResponse('NOT_FOUND', 'Pain point not found', 404, correlationId);
    }

    const updates: any = {};
    if (typeof body.times_used === 'number') {
      updates.times_used = body.times_used;
    }
    if (body.category !== undefined) {
      updates.category = body.category;
    }

    if (Object.keys(updates).length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('saved_pain_points')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`[${correlationId}] Pain point update error:`, updateError);
      return createApiErrorResponse('DB_ERROR', 'Failed to update pain point', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: updated,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Pain point update error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * DELETE /api/pain-points/[id] — delete a saved pain point
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { id } = await params;

    // Verify ownership before deleting
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('saved_pain_points')
      .select('id')
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .single();

    if (fetchError || !existing) {
      return createApiErrorResponse('NOT_FOUND', 'Pain point not found', 404, correlationId);
    }

    const { error: deleteError } = await supabaseAdmin
      .from('saved_pain_points')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error(`[${correlationId}] Pain point delete error:`, deleteError);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete pain point', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Pain point delete error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
