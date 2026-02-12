import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const body = await request.json();
    const { content, is_resolved } = body;

    const updates: Record<string, unknown> = {};
    if (content !== undefined) updates.content = content;
    if (is_resolved !== undefined) {
      updates.is_resolved = is_resolved;
      if (is_resolved) {
        updates.resolved_by = user.id;
        updates.resolved_at = new Date().toISOString();
      } else {
        updates.resolved_by = null;
        updates.resolved_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('script_comments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update comment:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update comment', 500, correlationId);
    }

    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comment PATCH error:`, err);
    return createApiErrorResponse('BAD_REQUEST', 'Invalid request body', 400, correlationId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    // Verify comment exists and check ownership
    const { data: comment } = await supabaseAdmin
      .from('script_comments')
      .select('user_id, skit_id')
      .eq('id', id)
      .single();

    if (!comment) {
      return createApiErrorResponse('NOT_FOUND', 'Comment not found', 404, correlationId);
    }

    // Allow deletion if user owns comment or owns the skit
    if (comment.user_id !== user.id) {
      const { data: skit } = await supabaseAdmin
        .from('saved_skits')
        .select('user_id')
        .eq('id', comment.skit_id)
        .single();

      if (skit?.user_id !== user.id) {
        return createApiErrorResponse('FORBIDDEN', 'Not authorized', 403, correlationId);
      }
    }

    const { error } = await supabaseAdmin
      .from('script_comments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[${correlationId}] Failed to delete comment:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete comment', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comment DELETE error:`, err);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
