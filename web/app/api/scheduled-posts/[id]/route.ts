import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('scheduled_posts')
      .select(`
        *,
        skit:saved_skits(id, title, skit_data, product_name, product_brand)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createApiErrorResponse('NOT_FOUND', 'Scheduled post not found', 404, correlationId);
      }
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch scheduled post', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const allowedFields = ['title', 'description', 'scheduled_for', 'platform', 'status', 'skit_id', 'metadata'];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
    }

    if (updates.scheduled_for) {
      const scheduledDate = new Date(updates.scheduled_for as string);
      if (scheduledDate <= new Date()) {
        return createApiErrorResponse('BAD_REQUEST', 'Scheduled time must be in the future', 400, correlationId);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createApiErrorResponse('NOT_FOUND', 'Scheduled post not found', 404, correlationId);
      }
      return createApiErrorResponse('DB_ERROR', 'Failed to update scheduled post', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { error } = await supabaseAdmin
      .from('scheduled_posts')
      .delete()
      .eq('id', id);

    if (error) {
      return createApiErrorResponse('DB_ERROR', 'Failed to delete scheduled post', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
