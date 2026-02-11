import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const entityType = searchParams.get('entity_type');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = supabaseAdmin
      .from('user_activity')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (entityType) query = query.eq('entity_type', entityType);
    if (search) query = query.ilike('entity_name', `%${search}%`);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error, count } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch activity:`, error);
      return NextResponse.json({ error: 'Failed to fetch activity', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ data, meta: { total: count, limit, offset }, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Activity GET error:`, err);
    return NextResponse.json({ error: 'Internal server error', correlation_id: correlationId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    const body = await request.json();
    const { action, entity_type, entity_id, entity_name, metadata } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required', correlation_id: correlationId }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('user_activity')
      .insert({
        user_id: user.id,
        action,
        entity_type: entity_type || 'skit',
        entity_id: entity_id || null,
        entity_name: entity_name || null,
        metadata: metadata || {},
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to log activity:`, error);
      return NextResponse.json({ error: 'Failed to log activity', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ data, correlation_id: correlationId }, { status: 201 });
  } catch (err) {
    console.error(`[${correlationId}] Activity POST error:`, err);
    return NextResponse.json({ error: 'Invalid request body', correlation_id: correlationId }, { status: 400 });
  }
}
