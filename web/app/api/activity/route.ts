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

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const entityType = searchParams.get('entity_type');
  const search = searchParams.get('search');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('user_activity')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply filters
  if (action) {
    query = query.eq('action', action);
  }

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  if (search) {
    query = query.ilike('entity_name', `%${search}%`);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to fetch activity:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }

  return NextResponse.json({
    data,
    meta: {
      total: count,
      limit,
      offset,
    },
  });
}

// POST to manually log activity (for actions not covered by triggers)
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
    const { action, entity_type, entity_id, entity_name, metadata } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('log_user_activity', {
      p_action: action,
      p_entity_type: entity_type || 'skit',
      p_entity_id: entity_id || null,
      p_entity_name: entity_name || null,
      p_metadata: metadata || {},
    });

    if (error) {
      console.error('Failed to log activity:', error);
      return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
    }

    return NextResponse.json({ data: { id: data } });
  } catch (err) {
    console.error('Failed to parse request:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
