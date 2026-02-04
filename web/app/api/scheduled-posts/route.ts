import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    let query = supabase
      .from('scheduled_posts')
      .select(`
        *,
        skit:saved_skits(id, title, product_name, product_brand)
      `)
      .order('scheduled_for', { ascending: true });

    if (startDate) {
      query = query.gte('scheduled_for', startDate);
    }

    if (endDate) {
      query = query.lte('scheduled_for', endDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    if (error) {
      // Table may not exist yet — return empty array so calendar still loads
      console.error('Failed to fetch scheduled posts:', error);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('Scheduled posts error:', err);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { skit_id, title, description, scheduled_for, platform, metadata } = body;

    if (!title || !scheduled_for) {
      return NextResponse.json(
        { error: 'Title and scheduled_for are required' },
        { status: 400 }
      );
    }

    // Validate scheduled_for is in the future
    const scheduledDate = new Date(scheduled_for);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        skit_id: skit_id || null,
        title,
        description: description || null,
        scheduled_for,
        platform: platform || 'tiktok',
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create scheduled post:', error);
      return NextResponse.json({ error: 'Failed to create scheduled post' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Failed to parse request:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
