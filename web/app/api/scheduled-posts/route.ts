import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    let query = supabaseAdmin
      .from('scheduled_posts')
      .select(`
        *,
        skit:saved_skits(id, title, product_name, product_brand)
      `)
      .order('scheduled_for', { ascending: true });

    if (startDate) query = query.gte('scheduled_for', startDate);
    if (endDate) query = query.lte('scheduled_for', endDate);
    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch scheduled posts:`, error);
      return NextResponse.json({ ok: true, data: [], correlation_id: correlationId });
    }

    return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Scheduled posts error:`, err);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { skit_id, title, description, scheduled_for, platform, metadata } = body;

    if (!title || !scheduled_for) {
      return createApiErrorResponse('BAD_REQUEST', 'Title and scheduled_for are required', 400, correlationId);
    }

    const scheduledDate = new Date(scheduled_for);
    if (scheduledDate <= new Date()) {
      return createApiErrorResponse('BAD_REQUEST', 'Scheduled time must be in the future', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('scheduled_posts')
      .insert({
        user_id: authContext.user.id,
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
      console.error(`[${correlationId}] Failed to create scheduled post:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to create scheduled post', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
  } catch (err) {
    console.error(`[${correlationId}] Scheduled post creation error:`, err);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
