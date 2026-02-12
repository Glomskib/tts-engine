import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const skitId = searchParams.get('skit_id');

    if (!skitId) {
      return createApiErrorResponse('BAD_REQUEST', 'skit_id is required', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('script_comments')
      .select('*')
      .eq('skit_id', skitId)
      .is('parent_id', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Failed to fetch comments:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch comments', 500, correlationId);
    }

    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comments GET error:`, err);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const body = await request.json();
    const { skit_id, content, parent_id, beat_index, selection_start, selection_end } = body;

    if (!skit_id || !content) {
      return createApiErrorResponse('BAD_REQUEST', 'skit_id and content are required', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
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
      console.error(`[${correlationId}] Failed to create comment:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to create comment', 500, correlationId);
    }

    return NextResponse.json({ data, correlation_id: correlationId }, { status: 201 });
  } catch (err) {
    console.error(`[${correlationId}] Failed to parse request:`, err);
    return createApiErrorResponse('BAD_REQUEST', 'Invalid request body', 400, correlationId);
  }
}
