import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';

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
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
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
      return NextResponse.json({ error: 'No valid fields to update', correlation_id: correlationId }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('script_comments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to update comment:`, error);
      return NextResponse.json({ error: 'Failed to update comment', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comment PATCH error:`, err);
    return NextResponse.json({ error: 'Invalid request body', correlation_id: correlationId }, { status: 400 });
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
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    // Verify comment exists and check ownership
    const { data: comment } = await supabaseAdmin
      .from('script_comments')
      .select('user_id, skit_id')
      .eq('id', id)
      .single();

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found', correlation_id: correlationId }, { status: 404 });
    }

    // Allow deletion if user owns comment or owns the skit
    if (comment.user_id !== user.id) {
      const { data: skit } = await supabaseAdmin
        .from('saved_skits')
        .select('user_id')
        .eq('id', comment.skit_id)
        .single();

      if (skit?.user_id !== user.id) {
        return NextResponse.json({ error: 'Not authorized', correlation_id: correlationId }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from('script_comments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[${correlationId}] Failed to delete comment:`, error);
      return NextResponse.json({ error: 'Failed to delete comment', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comment DELETE error:`, err);
    return NextResponse.json({ error: 'Internal server error', correlation_id: correlationId }, { status: 500 });
  }
}
