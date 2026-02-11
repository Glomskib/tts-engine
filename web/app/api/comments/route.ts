import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const skitId = searchParams.get('skit_id');

    if (!skitId) {
      return NextResponse.json({ error: 'skit_id is required', correlation_id: correlationId }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('script_comments')
      .select('*')
      .eq('skit_id', skitId)
      .is('parent_id', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Failed to fetch comments:`, error);
      return NextResponse.json({ error: 'Failed to fetch comments', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] Comments GET error:`, err);
    return NextResponse.json({ error: 'Internal server error', correlation_id: correlationId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', correlation_id: correlationId }, { status: 401 });
    }

    const body = await request.json();
    const { skit_id, content, parent_id, beat_index, selection_start, selection_end } = body;

    if (!skit_id || !content) {
      return NextResponse.json(
        { error: 'skit_id and content are required', correlation_id: correlationId },
        { status: 400 }
      );
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
      return NextResponse.json({ error: 'Failed to create comment', correlation_id: correlationId }, { status: 500 });
    }

    return NextResponse.json({ data, correlation_id: correlationId }, { status: 201 });
  } catch (err) {
    console.error(`[${correlationId}] Failed to parse request:`, err);
    return NextResponse.json({ error: 'Invalid request body', correlation_id: correlationId }, { status: 400 });
  }
}
