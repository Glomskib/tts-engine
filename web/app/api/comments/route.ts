import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const skitId = searchParams.get('skit_id');

  if (!skitId) {
    return NextResponse.json({ error: 'skit_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('script_comments')
    .select(`
      *,
      user:auth.users(id, email),
      replies:script_comments(
        *,
        user:auth.users(id, email)
      )
    `)
    .eq('skit_id', skitId)
    .is('parent_id', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { skit_id, content, parent_id, beat_index, selection_start, selection_end } = body;

    if (!skit_id || !content) {
      return NextResponse.json(
        { error: 'skit_id and content are required' },
        { status: 400 }
      );
    }

    // Verify user has access to the skit
    const { data: skit } = await supabase
      .from('saved_skits')
      .select('id, user_id, is_public')
      .eq('id', skit_id)
      .single();

    if (!skit) {
      return NextResponse.json({ error: 'Skit not found' }, { status: 404 });
    }

    if (skit.user_id !== user.id && !skit.is_public) {
      // Check if admin
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('script_comments')
      .insert({
        skit_id,
        user_id: user.id,
        content,
        parent_id: parent_id || null,
        beat_index: beat_index ?? null,
        selection_start: selection_start ?? null,
        selection_end: selection_end ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create comment:', error);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Failed to parse request:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
