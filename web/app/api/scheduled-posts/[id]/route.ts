import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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

  const { data, error } = await supabase
    .from('scheduled_posts')
    .select(`
      *,
      skit:saved_skits(id, title, skit_data, product_name, product_brand)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });
    }
    console.error('Failed to fetch scheduled post:', error);
    return NextResponse.json({ error: 'Failed to fetch scheduled post' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

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
    const allowedFields = ['title', 'description', 'scheduled_for', 'platform', 'status', 'skit_id', 'metadata'];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Validate scheduled_for if being updated
    if (updates.scheduled_for) {
      const scheduledDate = new Date(updates.scheduled_for as string);
      if (scheduledDate <= new Date()) {
        return NextResponse.json(
          { error: 'Scheduled time must be in the future' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });
      }
      console.error('Failed to update scheduled post:', error);
      return NextResponse.json({ error: 'Failed to update scheduled post' }, { status: 500 });
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

  const { error } = await supabase
    .from('scheduled_posts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete scheduled post:', error);
    return NextResponse.json({ error: 'Failed to delete scheduled post' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
