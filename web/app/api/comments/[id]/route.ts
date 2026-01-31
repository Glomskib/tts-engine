import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Only allow updating own comments (for content) or any comment for resolve status
    const { data: comment } = await supabase
      .from('script_comments')
      .select('user_id, skit_id')
      .eq('id', id)
      .single();

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // For content updates, must be owner
    if (content !== undefined && comment.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // For resolve updates, must be skit owner or admin
    if (is_resolved !== undefined) {
      const { data: skit } = await supabase
        .from('saved_skits')
        .select('user_id')
        .eq('id', comment.skit_id)
        .single();

      if (skit?.user_id !== user.id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (profile?.role !== 'admin') {
          return NextResponse.json({ error: 'Not authorized to resolve comments' }, { status: 403 });
        }
      }
    }

    const { data, error } = await supabase
      .from('script_comments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update comment:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Failed to parse request:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check ownership
  const { data: comment } = await supabase
    .from('script_comments')
    .select('user_id, skit_id')
    .eq('id', id)
    .single();

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  // Allow deletion if user owns comment or owns the skit
  if (comment.user_id !== user.id) {
    const { data: skit } = await supabase
      .from('saved_skits')
      .select('user_id')
      .eq('id', comment.skit_id)
      .single();

    if (skit?.user_id !== user.id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }
  }

  const { error } = await supabase
    .from('script_comments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete comment:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
